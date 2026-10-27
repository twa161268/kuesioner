const { query, withTransaction, getTableColumns } = require('../config/database');
const qid = s => `"${String(s).replaceAll('"','""')}"`;
const colsOf = async t => new Set((await getTableColumns(t)).map(c=>c.column_name));
async function insertAvailable(client, table, values, returning) {
  const cols = await colsOf(table);
  const entries = Object.entries(values).filter(([k,v]) => cols.has(k) && v !== undefined);
  if (!entries.length) throw new Error(`Kolom untuk menyimpan ${table} tidak ditemukan.`);
  const sql = `INSERT INTO public.${qid(table)} (${entries.map(([k])=>qid(k)).join(',')}) VALUES (${entries.map((_,i)=>`$${i+1}`).join(',')})${returning && cols.has(returning) ? ` RETURNING ${qid(returning)}` : ''}`;
  const r = await client.query(sql, entries.map(([,v])=>v));
  return r.rows[0] || {};
}
function makePdf(lines) {
  const esc = s => String(s ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g,'').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  const rows = lines.flatMap(line => { const t=esc(line); const out=[]; for(let i=0;i<t.length;i+=88) out.push(t.slice(i,i+88)); return out.length?out:['']; }).slice(0,48);
  const stream = ['BT','/F1 11 Tf','50 790 Td','14 TL',...rows.flatMap((line,i)=>[`${i?'T* ':''}(${line}) Tj`]),'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}\nendstream`
  ];
  let pdf='%PDF-1.4\n'; const offsets=[0];
  objects.forEach((o,i)=>{ offsets.push(Buffer.byteLength(pdf,'ascii')); pdf+=`${i+1} 0 obj\n${o}\nendobj\n`; });
  const xref=Buffer.byteLength(pdf,'ascii'); pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++) pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf,'ascii');
}
async function calculate(detailId, actorId) {
  return withTransaction(async client => {
    const dr = await client.query(`SELECT sd.sesi_detail_id,sd.sesi_id,sd.versi_id,sd.status_pengerjaan,s.nama_peserta,s.kode_sesi,s.tanggal_tes,v.nama_versi,m.nama_kuesioner
      FROM public.kuesioner_sesi_detail sd JOIN public.kuesioner_sesi s ON s.sesi_id=sd.sesi_id JOIN public.kuesioner_versi v ON v.versi_id=sd.versi_id JOIN public.kuesioner_master m ON m.kuesioner_id=v.kuesioner_id WHERE sd.sesi_detail_id=$1 FOR UPDATE OF sd`,[detailId]);
    if(!dr.rowCount) throw new Error('Tes pada sesi tidak ditemukan.'); const d=dr.rows[0];
    if(d.status_pengerjaan!=='selesai') throw new Error('Peserta harus menyelesaikan tes sebelum nilai dihitung.');
    const missing=await client.query(`SELECT p.nomor_urut FROM public.kuesioner_pertanyaan p LEFT JOIN public.kuesioner_jawaban j ON j.pertanyaan_id=p.pertanyaan_id AND j.sesi_detail_id=$1 WHERE p.versi_id=$2 AND p.status='aktif' AND p.wajib_dijawab=true AND j.jawaban_id IS NULL ORDER BY p.nomor_urut`,[detailId,d.versi_id]);
    if(missing.rowCount) throw new Error(`Masih ada jawaban wajib kosong: ${missing.rows.slice(0,8).map(x=>x.nomor_urut).join(', ')}.`);
    const ruleCols = await colsOf('kuesioner_aturan_skor');
    const reverseExpr = ruleCols.has('balik_skor') ? 'r.balik_skor' : 'false';
    const scores=await client.query(`SELECT dim.dimensi_id,dim.kode_dimensi,dim.nama_dimensi,
      r.kode_sisi_hasil,r.bobot,${reverseExpr} AS balik_skor,j.nilai_jawaban,p.pertanyaan_id
      FROM public.kuesioner_aturan_skor r JOIN public.kuesioner_dimensi dim ON dim.dimensi_id=r.dimensi_id
      JOIN public.kuesioner_pertanyaan p ON p.pertanyaan_id=r.pertanyaan_id AND p.versi_id=r.versi_id
      JOIN public.kuesioner_jawaban j ON j.pertanyaan_id=p.pertanyaan_id AND j.sesi_detail_id=$1
      WHERE r.versi_id=$2 AND p.status='aktif' ORDER BY dim.urutan,p.nomor_urut`,[detailId,d.versi_id]);
    if(!scores.rowCount) throw new Error('Aturan skor atau jawaban tidak ditemukan. Periksa pengaturan skor versi ini.');
    const dims=new Map();
    for(const x of scores.rows){
      const k=String(x.dimensi_id);
      if(!dims.has(k)) dims.set(k,{dimensi_id:x.dimensi_id,kode_dimensi:x.kode_dimensi,nama_dimensi:x.nama_dimensi,sides:new Map()});
      const side=String(x.kode_sisi_hasil || '').trim();
      if(!side) throw new Error(`Kode sisi hasil kosong pada dimensi ${x.kode_dimensi}.`);
      const val=Number(x.balik_skor)?(6-Number(x.nilai_jawaban)):Number(x.nilai_jawaban);
      const weight=Number(x.bobot || 1);
      if(!dims.get(k).sides.has(side)) dims.get(k).sides.set(side,{sum:0,weight:0});
      const agg=dims.get(k).sides.get(side); agg.sum+=val*weight; agg.weight+=weight;
    }
    const dimensionResults=[]; let code='';
    for(const x of dims.values()){
      const sideEntries=[...x.sides.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
      if(sideEntries.length!==2) throw new Error(`Dimensi ${x.kode_dimensi} harus memiliki tepat dua kode sisi hasil pada aturan skor; ditemukan ${sideEntries.length}.`);
      const [sideA,a]=sideEntries[0], [sideB,b]=sideEntries[1];
      if(!a.weight || !b.weight) throw new Error(`Aturan skor dimensi ${x.kode_dimensi} belum lengkap.`);
      const avgA=a.sum/a.weight, avgB=b.sum/b.weight;
      const winner=Math.abs(avgA-avgB)<0.000001?'':avgA>avgB?sideA:sideB; code+=(winner || 'X');
      dimensionResults.push({dimensi_id:x.dimensi_id,kode_dimensi:x.kode_dimensi,nama_dimensi:x.nama_dimensi,kode_sisi_a:sideA,kode_sisi_b:sideB,skor_a:Number(avgA.toFixed(3)),skor_b:Number(avgB.toFixed(3)),skor_persentase:Number((Math.abs(avgA-avgB)/(Math.max(avgA,avgB,0.00001))*100).toFixed(2)),kode_hasil:winner||'imbang'});
    }
    const resultCols=await colsOf('kuesioner_hasil');
    const existing=await client.query('SELECT hasil_id FROM public.kuesioner_hasil WHERE sesi_detail_id=$1',[detailId]);
    let hasilId;
    if(existing.rowCount){ hasilId=existing.rows[0].hasil_id; await client.query('DELETE FROM public.kuesioner_laporan WHERE hasil_id=$1',[hasilId]); await client.query('DELETE FROM public.kuesioner_hasil_dimensi WHERE hasil_id=$1',[hasilId]); await client.query('DELETE FROM public.kuesioner_hasil WHERE hasil_id=$1',[hasilId]); }
    const inserted=await insertAvailable(client,'kuesioner_hasil',{sesi_detail_id:detailId,kode_hasil:code,tipe_hasil:code,tipe_kepribadian:code,skor_total:dimensionResults.reduce((s,x)=>s+x.skor_a+x.skor_b,0),ringkasan: `Hasil skor otomatis untuk ${d.nama_kuesioner} - ${d.nama_versi}.`,ringkasan_hasil:`Hasil skor otomatis untuk ${d.nama_kuesioner} - ${d.nama_versi}.`,status_hasil:'draf',dihitung_pada:new Date(),created_at:new Date(),updated_at:new Date()},'hasil_id'); hasilId=inserted.hasil_id;
    const dimCols=await colsOf('kuesioner_hasil_dimensi');
    for(const x of dimensionResults){ await insertAvailable(client,'kuesioner_hasil_dimensi',{hasil_id:hasilId,dimensi_id:x.dimensi_id,kode_sisi_a:x.kode_sisi_a,kode_sisi_b:x.kode_sisi_b,kode_hasil:x.kode_hasil,skor_sisi_a:x.skor_a,skor_sisi_b:x.skor_b,skor_a:x.skor_a,skor_b:x.skor_b,nilai_sisi_a:x.skor_a,nilai_sisi_b:x.skor_b,kode_hasil:x.kode_hasil,skor_persentase:x.skor_persentase,created_at:new Date(),updated_at:new Date()}); }
    await client.query('UPDATE public.kuesioner_sesi SET diproses_pada=now(), updated_at=now() WHERE sesi_id=$1',[d.sesi_id]);
    return {hasilId,detail:d,code,dimensionResults};
  });
}
async function publish(detailId, actorId) {
  return withTransaction(async client=>{
    const r=await client.query(`SELECT h.hasil_id,h.sesi_detail_id,s.sesi_id,s.kode_sesi,s.nama_peserta,s.tanggal_tes,v.nama_versi,m.nama_kuesioner FROM public.kuesioner_hasil h JOIN public.kuesioner_sesi_detail sd ON sd.sesi_detail_id=h.sesi_detail_id JOIN public.kuesioner_sesi s ON s.sesi_id=sd.sesi_id JOIN public.kuesioner_versi v ON v.versi_id=sd.versi_id JOIN public.kuesioner_master m ON m.kuesioner_id=v.kuesioner_id WHERE h.sesi_detail_id=$1`,[detailId]);
    if(!r.rowCount) throw new Error('Hitung nilai terlebih dahulu.'); const d=r.rows[0];
    const hcols=await colsOf('kuesioner_hasil'); const sets=[]; const vals=[]; const add=(col,val)=>{if(hcols.has(col)){vals.push(val);sets.push(`${qid(col)}=$${vals.length}`)}};
    add('status_hasil','diterbitkan'); add('diperiksa_oleh',actorId||null); add('diperiksa_pada',new Date()); add('diterbitkan_pada',new Date()); add('updated_at',new Date());
    if(sets.length) await client.query(`UPDATE public.kuesioner_hasil SET ${sets.join(',')} WHERE hasil_id=$${vals.length+1}`,[...vals,d.hasil_id]);
    await client.query("UPDATE public.kuesioner_sesi SET status_akses_hasil='aktif', updated_at=now() WHERE sesi_id=$1",[d.sesi_id]);
    const dims=await client.query('SELECT hd.*,d.nama_dimensi,d.kode_dimensi FROM public.kuesioner_hasil_dimensi hd JOIN public.kuesioner_dimensi d ON d.dimensi_id=hd.dimensi_id WHERE hd.hasil_id=$1 ORDER BY d.urutan',[d.hasil_id]);
    const lines=['LAPORAN HASIL KUESIONER','',`Nama peserta: ${d.nama_peserta}`,`Nomor sesi: ${d.kode_sesi}`,`Jenis tes: ${d.nama_kuesioner}`,`Versi: ${d.nama_versi}`,`Tanggal tes: ${String(d.tanggal_tes).slice(0,10)}`,'',`Tipe hasil: ${dims.rows.map(x=>x.kode_hasil||'').join('')}`,'RINGKASAN DIMENSI',...dims.rows.map(x=>`${x.nama_dimensi||x.kode_dimensi}: ${x.kode_sisi_a || 'A'} ${x.skor_sisi_a ?? x.skor_a ?? '-'}; ${x.kode_sisi_b || 'B'} ${x.skor_sisi_b ?? x.skor_b ?? '-'}; preferensi ${x.kode_hasil||'imbang'}`),'','Hasil ini merupakan alat refleksi/pengembangan diri dan bukan diagnosis medis atau psikologis.'];
    const pdf=makePdf(lines); return {d,pdf,lines};
  });
}

async function getPublishedPdf(detailId) {
  const r = await query(`SELECT h.hasil_id,h.status_hasil,sd.sesi_detail_id,s.kode_sesi,s.nama_peserta,s.tanggal_tes,v.nama_versi,m.nama_kuesioner
    FROM public.kuesioner_hasil h JOIN public.kuesioner_sesi_detail sd ON sd.sesi_detail_id=h.sesi_detail_id
    JOIN public.kuesioner_sesi s ON s.sesi_id=sd.sesi_id JOIN public.kuesioner_versi v ON v.versi_id=sd.versi_id
    JOIN public.kuesioner_master m ON m.kuesioner_id=v.kuesioner_id WHERE h.sesi_detail_id=$1 AND h.status_hasil='diterbitkan'`, [detailId]);
  if (!r.rowCount) throw new Error('Hasil belum diterbitkan.');
  const d = r.rows[0];
  const dims = await query(`SELECT hd.*,dim.nama_dimensi,dim.kode_dimensi FROM public.kuesioner_hasil_dimensi hd JOIN public.kuesioner_dimensi dim ON dim.dimensi_id=hd.dimensi_id WHERE hd.hasil_id=$1 ORDER BY dim.urutan`, [d.hasil_id]);
  const lines = ['LAPORAN HASIL KUESIONER','',`Nama peserta: ${d.nama_peserta}`,`Nomor sesi: ${d.kode_sesi}`,`Jenis tes: ${d.nama_kuesioner}`,`Versi: ${d.nama_versi}`,`Tanggal tes: ${String(d.tanggal_tes).slice(0,10)}`,'',`Tipe hasil: ${dims.rows.map(x=>x.kode_hasil || '').join('')}`,'RINCIAN SKOR',...dims.rows.map(x=>`${x.nama_dimensi || x.kode_dimensi}: ${x.kode_sisi_a || 'A'} ${x.skor_sisi_a ?? x.skor_a ?? '-'}; ${x.kode_sisi_b || 'B'} ${x.skor_sisi_b ?? x.skor_b ?? '-'}; hasil ${x.kode_hasil || 'imbang'}`),'','Hasil ini merupakan alat refleksi dan pengembangan diri, bukan diagnosis medis atau psikologis.'];
  const safe = String(d.kode_sesi).replace(/[^a-zA-Z0-9_-]/g,'');
  return { pdf: makePdf(lines), lines, filename: `${safe}-${detailId}` };
}

module.exports={calculate,publish,makePdf,getPublishedPdf};
