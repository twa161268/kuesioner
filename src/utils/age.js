function calculateAge(dob, testDate = new Date()) {
  const birth = new Date(`${dob}T00:00:00Z`);
  const test = new Date(`${String(testDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(test.getTime()) || birth > test) throw new Error('Tanggal lahir tidak valid.');
  let age = test.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = test.getUTCMonth() < birth.getUTCMonth() || (test.getUTCMonth() === birth.getUTCMonth() && test.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}
module.exports = { calculateAge };
