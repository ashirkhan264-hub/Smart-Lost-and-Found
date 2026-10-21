const sql = require('mssql');
const pool = sql.connect({
  server: 'localhost',
  database: 'lostfound_db',
  user: 'lostuser',
  password: 'Lost@12345',
  options: { trustServerCertificate: true, encrypt: false }
});
pool.catch(err => console.log('SQL connection error:', err.message));
module.exports = pool;