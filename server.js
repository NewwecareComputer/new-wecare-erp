const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const ROOT = __dirname;
const ERP_DIR = path.join(ROOT, 'erp');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'erp-data.json');
const INITIAL_FILE = path.join(DATA_DIR, 'initial-data.json');

app.use(express.json({ limit: '10mb' }));

// Serve ERP frontend
app.use(express.static(ERP_DIR, {
  etag: false,
  maxAge: 0
}));

// --------------------------------------------------
// DATA STORAGE
// --------------------------------------------------

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    let bundled = {};

    if (fs.existsSync(INITIAL_FILE)) {
      bundled = JSON.parse(
        fs.readFileSync(INITIAL_FILE, 'utf8')
      );
    }

    const initialStore = {
      revision: 1,
      data: bundled
    };

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(initialStore, null, 2),
      'utf8'
    );
  }
}

function readStore() {
  ensureData();

  return JSON.parse(
    fs.readFileSync(DATA_FILE, 'utf8')
  );
}

function writeStore(data) {
  const current = readStore();

  const next = {
    revision: Number(current.revision || 0) + 1,
    data: data
  };

  const tmpFile = DATA_FILE + '.tmp';

  fs.writeFileSync(
    tmpFile,
    JSON.stringify(next, null, 2),
    'utf8'
  );

  fs.renameSync(tmpFile, DATA_FILE);

  return next;
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'NEW WE-CARE ERP'
  });
});

// --------------------------------------------------
// GET ERP DATA
// --------------------------------------------------

app.get('/api/data', (req, res) => {
  try {
    const store = readStore();

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    if (req.query.meta === '1') {
      return res.json({
        revision: store.revision
      });
    }

    return res.json(store);

  } catch (e) {
    console.error('GET DATA ERROR:', e);

    return res.status(500).json({
      error: e.message
    });
  }
});

// --------------------------------------------------
// SAVE ERP DATA
// --------------------------------------------------

app.put('/api/data', (req, res) => {
  try {
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body)
    ) {
      return res.status(400).json({
        error: 'Invalid ERP data'
      });
    }

    const store = writeStore(req.body);

    return res.json({
      ok: true,
      revision: store.revision
    });

  } catch (e) {
    console.error('PUT DATA ERROR:', e);

    return res.status(500).json({
      error: e.message
    });
  }
});

// --------------------------------------------------
// FRONTEND FALLBACK
// IMPORTANT:
// Do NOT use app.get('*') with new Express/router.
// --------------------------------------------------

app.use((req, res, next) => {

  // Never redirect API errors to index.html
  if (req.path.startsWith('/api/')) {
    return next();
  }

  const indexFile = path.join(ERP_DIR, 'index.html');

  if (!fs.existsSync(indexFile)) {
    return res.status(404).send('ERP index.html not found');
  }

  res.sendFile(indexFile);
});

// --------------------------------------------------
// 404
// --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

ensureData();

app.listen(PORT, HOST, () => {
  console.log(
    `NEW WE-CARE ERP running on http://${HOST}:${PORT}`
  );
});
