const { query, getTableColumns } = require('../config/database');
const audit = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');

const TABLES = {
  versi: { table: 'kuesioner_versi', pk: 'versi_id', title: 'Versi Kuesioner', parent: 'kuesioner_id', parentTable: 'kuesioner_master', parentPk: 'kuesioner_id', parentLabel: 'nama_kuesioner', list: ['versi_id','kuesioner_id','kode_versi','nama_versi','nomor_revisi','usia_min','usia_max','jumlah_pertanyaan','status'], fields: ['kuesioner_id','kode_versi','nama_versi','nomor_revisi','usia_min','usia_max','skala_min','skala_max','jumlah_pertanyaan','tanggal_berlaku_mulai','tanggal_berlaku_sampai','status','deskripsi'] },
  dimensi: { table: 'kuesioner_dimensi', pk: 'dimensi_id', title: 'Dimensi', parent: 'versi_id', parentTable: 'kuesioner_versi', parentPk: 'versi_id', parentLabel: 'kode_versi', list: ['dimensi_id','versi_id','kode_dimensi','nama_dimensi','urutan','status'], fields: ['versi_id','kode_dimensi','nama_dimensi','deskripsi','urutan','status'] },
  pertanyaan: { table: 'kuesioner_pertanyaan', pk: 'pertanyaan_id', title: 'Pertanyaan', parent: 'versi_id', parentTable: 'kuesioner_versi', parentPk: 'versi_id', parentLabel: 'kode_versi', list: ['pertanyaan_id','versi_id','nomor_urut','kode_pertanyaan','teks_pertanyaan','isi_pertanyaan','status'], fields: ['versi_id','kode_pertanyaan','nomor_urut','teks_pertanyaan','isi_pertanyaan','pertanyaan','jenis_pertanyaan','status'] },
  pilihan: { table: 'kuesioner_pilihan', pk: 'pilihan_id', title: 'Pilihan Jawaban', parent: 'pertanyaan_id', parentTable: 'kuesioner_pertanyaan', parentPk: 'pertanyaan_id', parentLabel: 'kode_pertanyaan', list: ['pilihan_id','pertanyaan_id','kode_pilihan','teks_pilihan','label_pilihan','nilai','urutan','status'], fields: ['pertanyaan_id','kode_pilihan','teks_pilihan','label_pilihan','nilai','nilai_skor','urutan','status'] },
  skor: { table: 'kuesioner_aturan_skor', pk: 'aturan_skor_id', title: 'Aturan Skor', parent: 'versi_id', parentTable: 'kuesioner_versi', parentPk: 'versi_id', parentLabel: 'kode_versi', list: ['aturan_skor_id','versi_id','pertanyaan_id','dimensi_id','kode_sisi_hasil','nilai_skor','skor'], fields: ['versi_id','pertanyaan_id','dimensi_id','kode_sisi_hasil','nilai_skor','skor','bobot','keterangan'] }
};
const LABELS = {
  kuesioner_id:'Master Kuesioner', versi_id:'Versi Kuesioner', dimensi_id:'Dimensi', pertanyaan_id:'Pertanyaan', kode_versi:'Kode Versi', nama_versi:'Nama Versi', nomor_revisi:'Nomor Revisi', usia_min:'Usia Minimum', usia_max:'Usia Maksimum', skala_min:'Skala Minimum', skala_max:'Skala Maksimum', jumlah_pertanyaan:'Jumlah Pertanyaan', tanggal_berlaku_mulai:'Tanggal Berlaku Mulai', tanggal_berlaku_sampai:'Tanggal Berlaku Sampai', kode_dimensi:'Kode Dimensi', nama_dimensi:'Nama Dimensi', deskripsi:'Deskripsi', urutan:'Urutan', kode_pertanyaan:'Kode Pertanyaan', nomor_urut:'Nomor Urut', teks_pertanyaan:'Teks Pertanyaan', isi_pertanyaan:'Isi Pertanyaan', pertanyaan:'Pertanyaan', jenis_pertanyaan:'Jenis Pertanyaan', kode_pilihan:'Kode Pilihan', teks_pilihan:'Teks Pilihan', label_pilihan:'Label Pilihan', nilai:'Nilai', nilai_skor:'Nilai Skor', kode_sisi_hasil:'Kode Sisi Hasil', aturan_skor_id:'ID Aturan Skor', pilihan_id:'ID Pilihan', status:'Status', created_at:'Dibuat Pada', updated_at:'Diperbarui Pada', bobot:'Bobot', skor:'Skor', keterangan:'Keterangan'
};
const STATUS_OPTIONS = { status: ['draft','diterbitkan','aktif','nonaktif','arsip'] };
const FK = {
  kuesioner_id: { table:'kuesioner_master', pk:'kuesioner_id', label:'nama_kuesioner' },
  versi_id: { table:'kuesioner_versi', pk:'versi_id', label:'kode_versi' },
  dimensi_id: { table:'kuesioner_dimensi', pk:'dimensi_id', label:'nama_dimensi' },
  pertanyaan_id: { table:'kuesioner_pertanyaan', pk:'pertanyaan_id', label:'kode_pertanyaan' }
};
const quote = s => `"${String(s).replaceAll('"','""')}"`;
const safeId = v => /^\d+$/.test(String(v || ''));
const cfg = key => { if (!TABLES[key]) throw new Error('Modul instrumen tidak dikenal.'); return TABLES[key]; };
async function columns(table) {
  const cols = await getTableColumns(table);
  if (!cols.length) throw new Error(`Tabel ${table} tidak ditemukan di database.`);
  return cols;
}
function chooseColumn(cols, candidates, fallback) { const names = new Set(cols.map(c => c.column_name)); return candidates.find(n => names.has(n)) || fallback; }
async function getFkOptions(field, context = {}) {
  const fk = FK[field]; if (!fk) return [];
  const parentCols = await columns(fk.table); const names = new Set(parentCols.map(c => c.column_name));
  const fallback = {
    kuesioner_id: ['nama_kuesioner','kode_kuesioner'], versi_id: ['kode_versi','nama_versi'],
    dimensi_id: ['nama_dimensi','kode_dimensi'], pertanyaan_id: ['kode_pertanyaan','teks_pertanyaan','isi_pertanyaan','pertanyaan']
  }[field] || [];
  const label = [fk.label, ...fallback].find(n => names.has(n)) || fk.pk;
  let where = ''; const params = [];
  if (field === 'versi_id' && context.kuesioner_id && fk.table === 'kuesioner_versi') { where = 'WHERE kuesioner_id=$1'; params.push(context.kuesioner_id); }
  else if (field === 'versi_id' && context.versi_id && fk.table === 'kuesioner_versi') { where = 'WHERE versi_id=$1'; params.push(context.versi_id); }
  if (field === 'pertanyaan_id' && context.versi_id) { where = 'WHERE versi_id=$1'; params.push(context.versi_id); }
  else if (field === 'pertanyaan_id' && context.pertanyaan_id) { where = 'WHERE pertanyaan_id=$1'; params.push(context.pertanyaan_id); }
  if (field === 'dimensi_id' && context.versi_id) { where = 'WHERE versi_id=$1'; params.push(context.versi_id); }
  const result = await query(`SELECT ${quote(fk.pk)} AS id, ${quote(label)} AS label FROM public.${quote(fk.table)} ${where} ORDER BY ${quote(label)} LIMIT 1000`, params);
  return result.rows;
}
function isSystem(col) { return col.column_name.endsWith('_id') && ['versi_id','dimensi_id','pertanyaan_id','pilihan_id','aturan_skor_id','kuesioner_id'].includes(col.column_name) && false; }
function fieldType(col) {
  if (FK[col.column_name]) return 'select';
  if (STATUS_OPTIONS[col.column_name]) return 'select';
  if (col.data_type === 'boolean') return 'checkbox';
  if (col.data_type === 'date') return 'date';
  if (['integer','bigint','smallint','numeric','real','double precision'].includes(col.data_type)) return 'number';
  if (col.data_type === 'text' || /deskripsi|pertanyaan|keterangan|instruksi|petunjuk/i.test(col.column_name)) return 'textarea';
  return 'text';
}
async function formFields(key, cols, context) {
  const c = cfg(key); const present = new Map(cols.map(x => [x.column_name,x]));
  const chosen = c.fields.filter(n => present.has(n));
  // Include all additional editable schema columns too. This keeps the form aligned with the real database schema even if column names differ between deployments.
  for (const col of cols) {
    if (chosen.includes(col.column_name)) continue;
    if ([c.pk,'created_at','updated_at','created_by','dibuat_oleh'].includes(col.column_name)) continue;
    if (col.is_generated === 'ALWAYS') continue;
    chosen.push(col.column_name);
  }
  const out = [];
  for (const name of chosen) {
    if (name === c.pk || ['created_at','updated_at','created_by','dibuat_oleh'].includes(name)) continue;
    const meta = present.get(name); if (!meta) continue;
    const field = { name, label: LABELS[name] || name.replaceAll('_',' ').replace(/\b\w/g, x => x.toUpperCase()), type: fieldType(meta), required: meta.is_nullable === 'NO' && !meta.column_default };
    if (name === 'status') {
      const table = c.table;
      field.options = table === 'kuesioner_versi' ? ['draft','diterbitkan','nonaktif','arsip'] : ['aktif','nonaktif'];
      if (table === 'kuesioner_master') field.options = ['draft','aktif','nonaktif','arsip'];
    } else if (FK[name]) {
      field.options = await getFkOptions(name, context);
      field.optionLabel = name === 'kuesioner_id' ? 'Pilih master kuesioner' : name === 'versi_id' ? 'Pilih versi' : name === 'dimensi_id' ? 'Pilih dimensi' : 'Pilih pertanyaan';
      if (context[name] && field.options.some(o => String(o.id) === String(context[name]))) field.defaultValue = String(context[name]);
    }
    out.push(field);
  }
  return out;
}
function listColumns(key, cols) {
  const c = cfg(key); const names = c.list.filter(n => cols.some(x => x.column_name === n));
  for (const col of cols) {
    const n = col.column_name;
    if (names.includes(n) || [c.pk,'created_at','updated_at','created_by','dibuat_oleh'].includes(n)) continue;
    if (n.endsWith('_hash') || n.includes('token')) continue;
    names.push(n);
  }
  if (!names.includes(c.pk)) names.unshift(c.pk);
  return names;
}
async function contextFor(key, req) {
  const c = cfg(key); const context = {};
  for (const name of ['kuesioner_id','versi_id','pertanyaan_id','dimensi_id']) {
    if (req.query[name] && safeId(req.query[name])) context[name] = req.query[name];
  }
  if (key === 'versi' && req.query.kuesioner_id && safeId(req.query.kuesioner_id)) context.kuesioner_id = req.query.kuesioner_id;
  if (key === 'dimensi' || key === 'pertanyaan' || key === 'skor') {
    if (req.query.versi_id && safeId(req.query.versi_id)) context.versi_id = req.query.versi_id;
  }
  if (key === 'pilihan' && req.query.pertanyaan_id && safeId(req.query.pertanyaan_id)) context.pertanyaan_id = req.query.pertanyaan_id;
  return context;
}
async function enrichRows(key, rows) {
  const c = cfg(key);
  return rows.map(row => {
    const r = { ...row };
    if (key === 'versi') r._master = row._master || row.kuesioner_nama;
    if (['dimensi','pertanyaan','skor'].includes(key)) r._versi = row._versi || row.kode_versi;
    if (key === 'pilihan') r._pertanyaan = row._pertanyaan || row.kode_pertanyaan;
    if (key === 'skor') { r._pertanyaan = row._pertanyaan || row.kode_pertanyaan; r._dimensi = row._dimensi || row.nama_dimensi; }
    return r;
  });
}
const index = asyncHandler(async (req,res) => {
  const key = req.params.resource; const c = cfg(key); const cols = await columns(c.table); const context = await contextFor(key,req);
  const fields = listColumns(key,cols);
  if (key === 'versi' && cols.some(x=>x.column_name==='kuesioner_id')) fields.splice(1,0,'_master');
  if (['dimensi','pertanyaan','skor'].includes(key) && cols.some(x=>x.column_name==='versi_id')) fields.splice(1,0,'_versi');
  if (['pilihan','skor'].includes(key) && cols.some(x=>x.column_name==='pertanyaan_id')) fields.splice(fields.indexOf('pertanyaan_id') >= 0 ? fields.indexOf('pertanyaan_id') + 1 : 1,0,'_pertanyaan');
  if (key === 'skor' && cols.some(x=>x.column_name==='dimensi_id')) fields.splice(fields.indexOf('dimensi_id') >= 0 ? fields.indexOf('dimensi_id') + 1 : 1,0,'_dimensi');
  const q = String(req.query.q || '').trim().slice(0,100);
  const select = [`t.*`];
  let joins = '';
  if (key === 'versi' && cols.some(x=>x.column_name==='kuesioner_id')) { const mc=await columns('kuesioner_master'); const label=chooseColumn(mc,['nama_kuesioner','kode_kuesioner'],'kuesioner_id'); joins += ' LEFT JOIN public.kuesioner_master m ON m.kuesioner_id=t.kuesioner_id'; select.push(`m.${quote(label)} AS _master`); }
  if (['dimensi','pertanyaan','skor'].includes(key) && cols.some(x=>x.column_name==='versi_id')) { const vc=await columns('kuesioner_versi'); const label=chooseColumn(vc,['kode_versi','nama_versi'],'versi_id'); joins += ' LEFT JOIN public.kuesioner_versi v ON v.versi_id=t.versi_id'; select.push(`v.${quote(label)} AS _versi`); }
  if (['pilihan','skor'].includes(key) && cols.some(x=>x.column_name==='pertanyaan_id')) { const pc=await columns('kuesioner_pertanyaan'); const label=chooseColumn(pc,['kode_pertanyaan','teks_pertanyaan','isi_pertanyaan','pertanyaan'],'pertanyaan_id'); joins += ' LEFT JOIN public.kuesioner_pertanyaan p ON p.pertanyaan_id=t.pertanyaan_id'; select.push(`p.${quote(label)} AS _pertanyaan`); }
  if (key === 'skor' && cols.some(x=>x.column_name==='dimensi_id')) { const dc=await columns('kuesioner_dimensi'); const label=chooseColumn(dc,['nama_dimensi','kode_dimensi'],'dimensi_id'); joins += ' LEFT JOIN public.kuesioner_dimensi d ON d.dimensi_id=t.dimensi_id'; select.push(`d.${quote(label)} AS _dimensi`); }
  const where = []; const params = [];
  for (const [field,val] of Object.entries(context)) if (cols.some(x=>x.column_name===field)) { params.push(val); where.push(`t.${quote(field)}=$${params.length}`); }
  if (q) {
    // Flexible substring search across visible business fields, regardless of type:
    // text, numeric IDs/codes, scores, ages, dates, and boolean/status fields.
    // Also search the joined display labels (master/version/question/dimension).
    // Never search audit-user identifiers, password hashes, token hashes, or secrets.
    const searchable = cols
      .filter(x => !['created_by','dibuat_oleh','updated_by','password_hash','token_hash','qr_token_hash','pin_hash'].includes(x.column_name))
      .filter(x => !x.column_name.endsWith('_hash') && !x.column_name.toLowerCase().includes('secret') && !x.column_name.toLowerCase().includes('token'))
      .map(x => `COALESCE(t.${quote(x.column_name)}::text, '') ILIKE $${params.length + 1}`);
    for (const [alias, tableKey, candidateNames] of [
      ['m','versi',['nama_kuesioner','kode_kuesioner']],
      ['v','child',['kode_versi','nama_versi']],
      ['p','question',['kode_pertanyaan','teks_pertanyaan','isi_pertanyaan','pertanyaan']],
      ['d','dimension',['nama_dimensi','kode_dimensi']]
    ]) {
      const joined = (alias === 'm' && key === 'versi') || (alias === 'v' && ['dimensi','pertanyaan','skor'].includes(key)) || (alias === 'p' && ['pilihan','skor'].includes(key)) || (alias === 'd' && key === 'skor');
      if (!joined) continue;
      const joinTable = alias === 'm' ? 'kuesioner_master' : alias === 'v' ? 'kuesioner_versi' : alias === 'p' ? 'kuesioner_pertanyaan' : 'kuesioner_dimensi';
      const joinCols = await columns(joinTable);
      const joinLabel = chooseColumn(joinCols, candidateNames, alias === 'm' ? 'kuesioner_id' : alias === 'v' ? 'versi_id' : alias === 'p' ? 'pertanyaan_id' : 'dimensi_id');
      searchable.push(`COALESCE(${alias}.${quote(joinLabel)}::text, '') ILIKE $${params.length + 1}`);
    }
    if (searchable.length) {
      // Escape LIKE metacharacters so the search term is treated literally, while
      // still allowing a match anywhere inside a field (e.g. DEWASA or 139).
      const term = q.replace(/[\\%_]/g, '\\$&');
      params.push(`%${term}%`);
      where.push(`(${searchable.join(' OR ')})`);
    }
  }
  const orderCol = cols.some(x=>x.column_name==='urutan') ? 'urutan' : cols.some(x=>x.column_name==='nomor_urut') ? 'nomor_urut' : c.pk;
  const result = await query(`SELECT ${select.join(', ')} FROM public.${quote(c.table)} t ${joins} ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY t.${quote(orderCol)} DESC LIMIT 500`,params);
  const rows = await enrichRows(key,result.rows);
  res.render('instrumen/index',{ title:c.title, resource:key, config:c, rows, fields, context, q, notice:req.query.notice||null });
});
const createForm = asyncHandler(async (req,res) => {
  const key=req.params.resource,c=cfg(key),cols=await columns(c.table),context=await contextFor(key,req);
  const item={...context}; const fields=await formFields(key,cols,context);
  res.render('instrumen/form',{title:'Tambah '+c.title,resource:key,config:c,mode:'create',item,fields,error:null,context});
});
const editForm = asyncHandler(async (req,res) => {
  const key=req.params.resource,c=cfg(key),cols=await columns(c.table); if(!safeId(req.params.id)) return res.status(404).render('errors/error',{title:'Data tidak ditemukan',message:'ID data tidak valid.'});
  const found=await query(`SELECT * FROM public.${quote(c.table)} WHERE ${quote(c.pk)}=$1`,[req.params.id]);
  if(!found.rowCount) return res.status(404).render('errors/error',{title:'Data tidak ditemukan',message:'Data yang diminta tidak ditemukan.'});
  const item=found.rows[0],context={}; for(const n of ['kuesioner_id','versi_id','pertanyaan_id','dimensi_id']) if(item[n]) context[n]=String(item[n]);
  const fields=await formFields(key,cols,context);
  res.render('instrumen/form',{title:'Ubah '+c.title,resource:key,config:c,mode:'edit',item,fields,error:null,context});
});
async function validateRelations(key, data) {
  if (['dimensi','pertanyaan','skor'].includes(key) && data.versi_id) {
    const version = await query('SELECT versi_id FROM public.kuesioner_versi WHERE versi_id=$1',[data.versi_id]);
    if (!version.rowCount) throw new Error('Versi kuesioner yang dipilih tidak ditemukan.');
  }
  if (key === 'skor') {
    if (data.pertanyaan_id && data.versi_id) { const r=await query('SELECT 1 FROM public.kuesioner_pertanyaan WHERE pertanyaan_id=$1 AND versi_id=$2',[data.pertanyaan_id,data.versi_id]); if(!r.rowCount) throw new Error('Pertanyaan harus berasal dari versi yang sama dengan aturan skor.'); }
    if (data.dimensi_id && data.versi_id) { const r=await query('SELECT 1 FROM public.kuesioner_dimensi WHERE dimensi_id=$1 AND versi_id=$2',[data.dimensi_id,data.versi_id]); if(!r.rowCount) throw new Error('Dimensi harus berasal dari versi yang sama dengan aturan skor.'); }
  }
}
async function save(req,id=null) {
  const key=req.params.resource,c=cfg(key),cols=await columns(c.table),colMap=new Map(cols.map(x=>[x.column_name,x])); const isNew=!id; const data={};
  for(const col of cols) {
    const name=col.column_name;
    if(name===c.pk || ['created_at','updated_at','created_by','dibuat_oleh'].includes(name) || col.is_generated==='ALWAYS') continue;
    if(req.body[name]===undefined) { if(col.data_type==='boolean') data[name]=false; continue; }
    const raw=req.body[name];
    if(col.data_type==='boolean') data[name]=raw==='true'||raw==='on'||raw==='1';
    else if(raw==='' || raw===null) data[name]=null;
    else data[name]=String(raw).trim();
  }
  if(isNew && colMap.has('created_by')) data.created_by=req.session.user.id;
  if(isNew && colMap.has('dibuat_oleh')) data.dibuat_oleh=req.session.user.id;
  for(const [name,meta] of colMap) {
    if(name===c.pk || ['created_at','updated_at','created_by','dibuat_oleh'].includes(name) || meta.column_default) continue;
    if(meta.is_nullable==='NO' && (data[name]===undefined || data[name]===null || data[name]==='')) throw new Error(`Kolom ${LABELS[name]||name} wajib diisi.`);
  }
  if(data.status && colMap.has('status')) { const allowed=STATUS_OPTIONS.status.includes(data.status) ? (key==='versi'?['draft','diterbitkan','nonaktif','arsip']:key==='master'?['draft','aktif','nonaktif','arsip']:['aktif','nonaktif']) : null; if(allowed && !allowed.includes(data.status)) throw new Error('Status tidak valid.'); }
  await validateRelations(key,data);
  const entries=Object.entries(data).filter(([name])=>colMap.has(name));
  if(isNew) {
    const names=entries.map(([n])=>quote(n)).join(', '),marks=entries.map((_,i)=>`$${i+1}`).join(', ');
    const result=await query(`INSERT INTO public.${quote(c.table)} (${names}) VALUES (${marks}) RETURNING ${quote(c.pk)}`,entries.map(([,v])=>v)); return result.rows[0][c.pk];
  }
  if(!entries.length) throw new Error('Tidak ada perubahan yang dapat disimpan.');
  const vals=entries.map(([,v])=>v); const sets=entries.map(([n],i)=>`${quote(n)}=$${i+1}`); if(colMap.has('updated_at')) sets.push('updated_at=now()'); vals.push(id);
  const result=await query(`UPDATE public.${quote(c.table)} SET ${sets.join(', ')} WHERE ${quote(c.pk)}=$${vals.length} RETURNING ${quote(c.pk)}`,vals); if(!result.rowCount) throw new Error('Data tidak ditemukan.'); return id;
}
const create = asyncHandler(async(req,res)=>{
  const key=req.params.resource,c=cfg(key),context=await contextFor(key,req);
  for (const n of ['kuesioner_id','versi_id','pertanyaan_id','dimensi_id']) if (!context[n] && req.body[n] && safeId(req.body[n])) context[n]=String(req.body[n]);
  try { const id=await save(req); await audit.log({actorUserId:req.session.user.id,action:`${c.table}_dibuat`,entityType:c.table,entityId:id}).catch(()=>{}); const url=new URLSearchParams(context).toString(); res.redirect(`/admin/${key}?${url?url+'&':''}notice=created`); }
  catch(err) { const fields=await formFields(key,await columns(c.table),context); res.status(400).render('instrumen/form',{title:'Tambah '+c.title,resource:key,config:c,mode:'create',item:{...context,...req.body},fields,error:err.message,context}); }
});
const update = asyncHandler(async(req,res)=>{
  const key=req.params.resource,c=cfg(key); let context={};
  try { await save(req,req.params.id); const cols=await columns(c.table); const r=await query(`SELECT * FROM public.${quote(c.table)} WHERE ${quote(c.pk)}=$1`,[req.params.id]); for(const n of ['kuesioner_id','versi_id','pertanyaan_id','dimensi_id']) if(r.rows[0]?.[n]) context[n]=r.rows[0][n]; await audit.log({actorUserId:req.session.user.id,action:`${c.table}_diubah`,entityType:c.table,entityId:req.params.id}).catch(()=>{}); const url=new URLSearchParams(context).toString(); res.redirect(`/admin/${key}?${url?url+'&':''}notice=updated`); }
  catch(err) { const cols=await columns(c.table); const fields=await formFields(key,cols,context); res.status(400).render('instrumen/form',{title:'Ubah '+c.title,resource:key,config:c,mode:'edit',item:{...req.body,[c.pk]:req.params.id},fields,error:err.message,context}); }
});
const remove = asyncHandler(async(req,res)=>{
  const key=req.params.resource,c=cfg(key); if(!safeId(req.params.id)) return res.status(400).send('ID tidak valid.');
  const found=await query(`SELECT * FROM public.${quote(c.table)} WHERE ${quote(c.pk)}=$1`,[req.params.id]); if(!found.rowCount) return res.redirect(`/admin/${key}?notice=missing`);
  const context={}; for(const n of ['kuesioner_id','versi_id','pertanyaan_id','dimensi_id']) if(found.rows[0][n]) context[n]=found.rows[0][n];
  try { await query(`DELETE FROM public.${quote(c.table)} WHERE ${quote(c.pk)}=$1`,[req.params.id]); await audit.log({actorUserId:req.session.user.id,action:`${c.table}_dihapus`,entityType:c.table,entityId:req.params.id}).catch(()=>{}); const url=new URLSearchParams(context).toString(); res.redirect(`/admin/${key}?${url?url+'&':''}notice=deleted`); }
  catch(err) { const url=new URLSearchParams(context).toString(); res.redirect(`/admin/${key}?${url?url+'&':''}notice=delete_failed`); }
});
module.exports={index,createForm,editForm,create,update,remove};
