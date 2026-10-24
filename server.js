const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const dbPromise = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/', (req, res) => res.send('Lost & Found API is running'));

// ---------- health ----------
app.get('/api/health', async (req, res) => {
  try {
    const pool = await dbPromise;
    const r = await pool.request().query('SELECT COUNT(*) AS users FROM users');
    res.json(r.recordset[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- login / register ----------
app.post('/api/login', async (req, res) => {
  try {
    const pool = await dbPromise;
    const r = await pool.request()
      .input('email', sql.VarChar, (req.body.email || '').trim().toLowerCase())
      .input('password', sql.VarChar, req.body.password || '')
      .query('SELECT * FROM users WHERE email=@email AND password=@password');
    if (!r.recordset.length) return res.status(401).json({ message: 'Wrong email or password' });
    const u = r.recordset[0];
    if (u.blocked) return res.status(403).json({ message: 'This account is blocked by admin' });
    res.json({ name: u.name, email: u.email, role: u.role });
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'All fields are required' });
    const pool = await dbPromise;
    const e = email.trim().toLowerCase();
    const dup = await pool.request().input('email', sql.VarChar, e)
      .query('SELECT id FROM users WHERE email=@email');
    if (dup.recordset.length) return res.status(400).json({ message: 'Email already registered' });
    await pool.request()
      .input('name', sql.VarChar, name)
      .input('email', sql.VarChar, e)
      .input('password', sql.VarChar, password)
      .query("INSERT INTO users(name,email,password,role) VALUES(@name,@email,@password,'user')");
    res.json({ name, email: e, role: 'user' });
  } catch (err) { res.status(500).json({ message: 'Server error: ' + err.message }); }
});

// ---------- items: report (create) ----------
app.post('/api/items', async (req, res) => {
  try {
    const i = req.body;
    if (!i.title || !i.owner) return res.status(400).json({ message: 'Title is required' });
    const pool = await dbPromise;
    await pool.request()
      .input('type', sql.VarChar, i.type)
      .input('title', sql.VarChar, i.title)
      .input('category', sql.VarChar, i.category)
      .input('color', sql.VarChar, i.color)
      .input('location', sql.VarChar, i.location)
      .input('item_date', sql.Date, i.date)
      .input('description', sql.NVarChar(sql.MAX), i.desc)
      .input('image', sql.NVarChar(sql.MAX), i.img || null)
      .input('owner', sql.VarChar, (i.owner || '').toLowerCase())
      .query(`INSERT INTO items(type,title,category,color,location,item_date,description,image,owner_email)
              VALUES(@type,@title,@category,@color,@location,@item_date,@description,@image,@owner)`);
    res.json({ message: 'Report submitted' });
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

// ---------- items: search (approved only) ----------
app.get('/api/items', async (req, res) => {
  try {
    const pool = await dbPromise;
    const q = (req.query.q || '').trim();
    const r = await pool.request()
      .input('q', sql.NVarChar(4000), '%' + q + '%')
      .input('hasq', sql.Bit, q ? 1 : 0)
      .query(`SELECT id, type, title, category, color, location, item_date, description, image, owner_email, status
              FROM items
              WHERE status = 'approved'
                AND (@hasq = 0 OR title LIKE @q OR description LIKE @q
                     OR category LIKE @q OR color LIKE @q OR location LIKE @q OR type LIKE @q)
              ORDER BY id DESC`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

// ---------- my reports ----------
app.get('/api/my-items', async (req, res) => {
  try {
    const pool = await dbPromise;
    const r = await pool.request()
      .input('email', sql.VarChar, (req.query.email || '').toLowerCase())
      .query('SELECT * FROM items WHERE owner_email=@email ORDER BY id DESC');
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

function matchScore(a, b) {
  let score = a.category === b.category ? 30 : 0;
  if (String(a.color || '').trim().toLowerCase() === String(b.color || '').trim().toLowerCase()) score += 20;

  const words = item => new Set(`${item.title || ''} ${item.description || ''}`.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  const aWords = words(a);
  const bWords = words(b);
  const intersection = [...aWords].filter(word => bWords.has(word)).length;
  const union = new Set([...aWords, ...bWords]).size || 1;
  score += Math.round(25 * Math.min(1, intersection / union * 2.5));

  if (a.location === b.location) score += 15;
  const days = Math.abs(new Date(a.item_date).getTime() - new Date(b.item_date).getTime()) / 86400000;
  score += days <= 1 ? 10 : days <= 3 ? 7 : days <= 7 ? 4 : 0;
  return Math.min(100, score);
}

function matchItem(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    category: row.category,
    color: row.color,
    location: row.location,
    date: row.item_date instanceof Date ? row.item_date.toISOString().slice(0, 10) : String(row.item_date).slice(0, 10),
    desc: row.description,
    img: row.image,
    owner: row.owner_email,
    status: row.status
  };
}

// Smart matches: compare this user's reports with approved opposite-type reports.
app.get('/api/matches', async (req, res) => {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const pool = await dbPromise;
    const r = await pool.request()
      .input('email', sql.VarChar, email)
      .query(`SELECT id, type, title, category, color, location, item_date, description, image, owner_email, status
              FROM items
              WHERE (owner_email=@email AND status IN ('pending','approved'))
                 OR status='approved'
              ORDER BY id DESC`);
    const ownRows = r.recordset.filter(item => item.owner_email.toLowerCase() === email);
    const candidates = r.recordset.filter(item =>
      item.status === 'approved' || item.owner_email.toLowerCase() === email,
    );
    const matches = [];

    for (const ownItem of ownRows) {
      for (const row of candidates) {
        if (row.type === ownItem.type) continue;
        const sameOwner = row.owner_email.toLowerCase() === email;
        if (sameOwner && ownItem.type !== 'lost') continue;
        if (!sameOwner && row.status !== 'approved') continue;
        const s = matchScore(row, ownItem);
        if (s >= 40) {
          matches.push({ mine: matchItem(ownItem), other: matchItem(row), s, sameOwner });
        }
      }
    }

    matches.sort((a, b) => b.s - a.s);
    res.json(matches);
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

// delete own pending report
app.delete('/api/items/:id', async (req, res) => {
  try {
    const pool = await dbPromise;
    const r = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('email', sql.VarChar, (req.query.email || '').toLowerCase())
      .query("DELETE FROM items WHERE id=@id AND owner_email=@email AND status='pending'");
    if (!r.rowsAffected[0]) return res.status(400).json({ message: 'Only your pending reports can be deleted' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

// ---------- home page stats ----------
app.get('/api/stats', async (req, res) => {
  try {
    const pool = await dbPromise;
    const r = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM items WHERE type='lost')  AS lost,
        (SELECT COUNT(*) FROM items WHERE type='found') AS found,
        (SELECT COUNT(*) FROM items WHERE status='returned') AS returned,
        (SELECT COUNT(*) FROM users) AS users`);
    res.json(r.recordset[0]);
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

// ---------- admin ----------
async function requireAdmin(req, res, next) {
  try {
    const pool = await dbPromise;
    const r = await pool.request()
      .input('email', sql.VarChar, (req.get('x-admin-email') || '').toLowerCase())
      .query("SELECT id FROM users WHERE email=@email AND role='admin' AND blocked=0");
    if (!r.recordset.length) return res.status(403).json({ message: 'Admin access only' });
    next();
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
}

// all reports (image column left out to keep it light)
app.get('/api/admin/items', requireAdmin, async (req, res) => {
  try {
    const pool = await dbPromise;
    const r = await pool.request().query(
      `SELECT id, type, title, category, color, location, item_date, description, owner_email, status, created_at
       FROM items ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, id DESC`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

// approve / reject / returned
app.put('/api/admin/items/:id', requireAdmin, async (req, res) => {
  try {
    const st = req.body.status;
    if (!['pending', 'approved', 'rejected', 'returned'].includes(st))
      return res.status(400).json({ message: 'Invalid status' });
    const pool = await dbPromise;
    await pool.request().input('id', sql.Int, req.params.id).input('st', sql.VarChar, st)
      .query('UPDATE items SET status=@st WHERE id=@id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

app.delete('/api/admin/items/:id', requireAdmin, async (req, res) => {
  try {
    const pool = await dbPromise;
    await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM claims WHERE item_id=@id OR source_item_id=@id');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM items WHERE id=@id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

// users
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const pool = await dbPromise;
    const r = await pool.request().query('SELECT id, name, email, role, blocked FROM users ORDER BY id');
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

app.put('/api/admin/users/:id/block', requireAdmin, async (req, res) => {
  try {
    const pool = await dbPromise;
    await pool.request().input('id', sql.Int, req.params.id).input('b', sql.Bit, req.body.blocked ? 1 : 0)
      .query("UPDATE users SET blocked=@b WHERE id=@id AND role<>'admin'");
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  let transaction;
  try {
    const pool = await dbPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const user = await transaction.request().input('id', sql.Int, req.params.id)
      .query("SELECT email FROM users WITH (UPDLOCK, HOLDLOCK) WHERE id=@id AND role<>'admin'");
    if (!user.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    const email = user.recordset[0].email;
    await transaction.request().input('email', sql.VarChar, email)
      .query(`DELETE FROM claims
              WHERE claimed_by=@email
                 OR item_id IN (SELECT id FROM items WHERE owner_email=@email)
                 OR source_item_id IN (SELECT id FROM items WHERE owner_email=@email)`);
    await transaction.request().input('email', sql.VarChar, email)
      .query('DELETE FROM items WHERE owner_email=@email');
    await transaction.request().input('id', sql.Int, req.params.id)
      .query("DELETE FROM users WHERE id=@id AND role<>'admin'");
    await transaction.commit();
    res.json({ ok: true });
  } catch (e) {
    if (transaction) {
      try { await transaction.rollback(); }
      catch (rollbackError) { console.error('Could not roll back user removal:', rollbackError.message); }
    }
    res.status(500).json({ message: 'Server error: ' + e.message });
  }
});

// statistics
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const pool = await dbPromise;
    const t = await pool.request().query(`
      SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END), 0) AS approved,
        COALESCE(SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END), 0) AS returned,
        COALESCE(SUM(CASE WHEN type='lost'  THEN 1 ELSE 0 END), 0) AS lost,
        COALESCE(SUM(CASE WHEN type='found' THEN 1 ELSE 0 END), 0) AS found
      FROM items`);
    const c = await pool.request().query('SELECT category, COUNT(*) AS n FROM items GROUP BY category ORDER BY n DESC');
    const u = await pool.request().query('SELECT COUNT(*) AS n FROM users');
    res.json({ ...t.recordset[0], users: u.recordset[0].n, categories: c.recordset });
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

// ---------- claims ----------
// user sends a claim request
app.post('/api/claims', async (req, res) => {
  try {
    const itemId = Number(req.body.itemId);
    const sourceItemId = req.body.sourceItemId == null ? null : Number(req.body.sourceItemId);
    const by = (req.body.by || '').trim().toLowerCase();
    const msg = (req.body.msg || '').trim();
    if (!Number.isInteger(itemId) || itemId < 1 || !by || !msg) {
      return res.status(400).json({ message: 'Please provide the item and proof of ownership' });
    }
    if (sourceItemId !== null && (!Number.isInteger(sourceItemId) || sourceItemId < 1 || sourceItemId === itemId)) {
      return res.status(400).json({ message: 'Invalid matching report' });
    }

    const pool = await dbPromise;
    const it = await pool.request()
      .input('id', sql.Int, itemId)
      .input('sourceId', sql.Int, sourceItemId)
      .query(`SELECT id, type, title, category, color, location, item_date, description, owner_email, status
              FROM items
              WHERE id=@id OR id=@sourceId`);
    const target = it.recordset.find(item => item.id === itemId);
    const source = sourceItemId === null ? null : it.recordset.find(item => item.id === sourceItemId);
    if (!target || (target.status !== 'approved' && !(sourceItemId !== null && target.status === 'pending')))
      return res.status(400).json({ message: 'This item is not available for claims' });
    if (sourceItemId === null && target.owner_email.toLowerCase() === by)
      return res.status(400).json({ message: 'You cannot claim your own report' });
    if (sourceItemId !== null) {
      if (!source || source.type !== 'lost' || target.type !== 'found' ||
          !['pending', 'approved'].includes(source.status) ||
          !['pending', 'approved'].includes(target.status) ||
          source.owner_email.toLowerCase() !== by ||
          (target.owner_email.toLowerCase() !== by && target.status !== 'approved')) {
        return res.status(400).json({ message: 'A match claim must link your own lost report to an available found report' });
      }
      if (matchScore(source, target) < 40) {
        return res.status(400).json({ message: 'These reports do not meet the match threshold' });
      }
    }

    const user = await pool.request().input('by', sql.VarChar, by)
      .query("SELECT id FROM users WHERE email=@by AND blocked=0");
    if (!user.recordset.length) return res.status(403).json({ message: 'Please sign in with an active account to send a claim' });

    const dup = await pool.request()
      .input('id', sql.Int, itemId)
      .input('sourceId', sql.Int, sourceItemId)
      .input('by', sql.VarChar, by)
      .query(`SELECT id FROM claims
              WHERE claimed_by=@by AND status='pending'
                AND (item_id=@id OR (@sourceId IS NOT NULL AND source_item_id=@sourceId))`);
    if (dup.recordset.length) return res.status(400).json({ message: 'You already sent a claim for this item' });
    await pool.request()
      .input('id', sql.Int, itemId)
      .input('sourceId', sql.Int, sourceItemId)
      .input('by', sql.VarChar, by)
      .input('msg', sql.NVarChar(sql.MAX), msg)
      .query('INSERT INTO claims(item_id, source_item_id, claimed_by, message) VALUES(@id,@sourceId,@by,@msg)');
    res.json({ message: 'Claim sent. Pending admin verification.' });
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

// my claims
app.get('/api/my-claims', async (req, res) => {
  try {
    const pool = await dbPromise;
    const r = await pool.request().input('by', sql.VarChar, (req.query.email || '').toLowerCase())
    .query(`SELECT c.id, c.status, c.created_at, i.title, i.category,
                   source.title AS source_title, source.type AS source_type
            FROM claims c JOIN items i ON i.id = c.item_id
            LEFT JOIN items source ON source.id = c.source_item_id
            WHERE c.claimed_by=@by ORDER BY c.id DESC`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

// admin: all claims
app.get('/api/admin/claims', requireAdmin, async (req, res) => {
  try {
    const pool = await dbPromise;
    const r = await pool.request().query(
      `SELECT c.id, c.item_id, c.source_item_id, c.claimed_by, c.message, c.status, c.created_at,
              i.title, i.type, i.owner_email,
              source.title AS source_title, source.type AS source_type
       FROM claims c JOIN items i ON i.id = c.item_id
       LEFT JOIN items source ON source.id = c.source_item_id
       ORDER BY CASE WHEN c.status='pending' THEN 0 ELSE 1 END, c.id DESC`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ message: 'Server error: ' + e.message }); }
});

// admin: approve or reject a claim; approval removes the matched reports from active listings.
app.put('/api/admin/claims/:id', requireAdmin, async (req, res) => {
  let transaction;
  try {
    const st = req.body.status;
    if (!['approved', 'rejected'].includes(st)) return res.status(400).json({ message: 'Invalid status' });
    const pool = await dbPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const c = await transaction.request().input('id', sql.Int, req.params.id)
      .query(`SELECT c.id, c.item_id, c.source_item_id, c.claimed_by, c.status AS claim_status,
                     target.status AS item_status, target.type AS item_type,
                     target.owner_email AS item_owner,
                     source.status AS source_status, source.type AS source_type,
                     source.owner_email AS source_owner
              FROM claims c WITH (UPDLOCK, HOLDLOCK)
              JOIN items target WITH (UPDLOCK, HOLDLOCK) ON target.id=c.item_id
              LEFT JOIN items source WITH (UPDLOCK, HOLDLOCK) ON source.id=c.source_item_id
              WHERE c.id=@id`);
    if (!c.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Claim not found' });
    }
    const claim = c.recordset[0];
    if (claim.claim_status !== 'pending') {
      await transaction.rollback();
      return res.status(409).json({ message: 'This claim has already been reviewed' });
    }
    if (st === 'approved') {
      if (!['pending', 'approved'].includes(claim.item_status) ||
          (claim.source_item_id !== null &&
           (!['pending', 'approved'].includes(claim.source_status) || claim.source_type !== 'lost' ||
            claim.item_type !== 'found' || claim.source_owner.toLowerCase() !== claim.claimed_by.toLowerCase() ||
            (claim.item_owner.toLowerCase() === claim.claimed_by.toLowerCase()
              ? !['pending', 'approved'].includes(claim.item_status)
              : claim.item_status !== 'approved')))) {
        await transaction.rollback();
        return res.status(409).json({ message: 'The report or its match is no longer available' });
      }
      await transaction.request().input('id', sql.Int, req.params.id).input('st', sql.VarChar, st)
        .query('UPDATE claims SET status=@st WHERE id=@id');
      await transaction.request()
        .input('item', sql.Int, claim.item_id)
        .input('source', sql.Int, claim.source_item_id)
        .query(`UPDATE items SET status='returned'
                WHERE id=@item OR (@source IS NOT NULL AND id=@source)`);
      await transaction.request()
        .input('item', sql.Int, claim.item_id)
        .input('source', sql.Int, claim.source_item_id)
        .input('id', sql.Int, req.params.id)
        .query(`UPDATE claims SET status='rejected'
                WHERE id<>@id AND status='pending'
                  AND (item_id=@item OR source_item_id=@item
                       OR (@source IS NOT NULL AND (item_id=@source OR source_item_id=@source)))`);
    } else {
      await transaction.request().input('id', sql.Int, req.params.id).input('st', sql.VarChar, st)
        .query('UPDATE claims SET status=@st WHERE id=@id');
    }
    await transaction.commit();
    res.json({ ok: true });
  } catch (e) {
    if (transaction) {
      try { await transaction.rollback(); }
      catch (rollbackError) { console.error('Could not roll back claim review:', rollbackError.message); }
    }
    res.status(500).json({ message: 'Server error: ' + e.message });
  }
});

const port = Number(process.env.PORT) || 5000;
async function start() {
  const pool = await dbPromise;
  await pool.request().query(`
    IF COL_LENGTH('dbo.claims', 'source_item_id') IS NULL
      ALTER TABLE dbo.claims ADD source_item_id INT NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_claims_source_item')
      ALTER TABLE dbo.claims WITH CHECK
      ADD CONSTRAINT FK_claims_source_item FOREIGN KEY (source_item_id) REFERENCES dbo.items(id);
  `);
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}
start().catch(error => {
  console.error('Could not prepare the database for claims:', error.message);
  process.exitCode = 1;
});