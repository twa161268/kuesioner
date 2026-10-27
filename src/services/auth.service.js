const bcrypt = require('bcryptjs');
const users = require('../repositories/user.repository');
async function authenticate(email, password) {
  const user = await users.findByEmail(String(email || '').trim().toLowerCase());
  if (!user) return null;
  const match = await bcrypt.compare(String(password || ''), user.password_hash || '');
  if (!match || user.status !== 'aktif' || !['admin', 'super_admin'].includes(user.role)) return null;
  return { id: user.user_id, email: user.email, role: user.role };
}
module.exports = { authenticate };
