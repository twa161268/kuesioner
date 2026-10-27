const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateAge } = require('../src/utils/age');
test('calculateAge menghitung usia sebelum ulang tahun dengan benar', () => { assert.equal(calculateAge('2000-12-20', '2026-10-24'), 25); });
test('calculateAge menghitung usia sesudah ulang tahun dengan benar', () => { assert.equal(calculateAge('2000-01-10', '2026-10-24'), 26); });
test('calculateAge menolak tanggal lahir di masa depan', () => { assert.throws(() => calculateAge('2030-01-01', '2026-10-24')); });
