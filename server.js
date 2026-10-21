const express = require('express');
const cors = require('cors');
const dbPromise = require('./db');
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', async (req, res) => {
  try {
    const pool = await dbPromise;
    const r = await pool.request().query('SELECT COUNT(*) AS users FROM users');
    res.json(r.recordset[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/', (req, res) => res.send('Lost & Found API is running'));
app.listen(5000, () => console.log('Server running on http://localhost:5000'));