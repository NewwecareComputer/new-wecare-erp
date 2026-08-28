```js
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const ROOT = __dirname;
const ERP_DIR = path.join(ROOT, 'erp');
const DATA_FILE = path.join(ROOT, 'data', 'erp-data.json');
const INITIAL_FILE = path.join(ROOT, 'data', 'initial-data.json');

app.use(express.json({ limit: '10mb' }));

// Serve ERP frontend
app.use(express.static(ERP_DIR, {
  index: 'index.html',
  maxAge: 0
}));


// ==============================
// DATABASE / FILE STORAGE
// ==============================

function ensureData() {
  const dir = path.dirname(DATA_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {

    let bundled = {};

    if (fs.existsSync(INITIAL_FILE)) {
      bundled = JSON.parse(
        fs.readFileSync(INITIAL_FILE, 'utf8')
      );
    }

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        {
          revision: 1,
          data: bundled
        },
        null,
        2
      )
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

  const tmp = DATA_FILE + '.tmp';

  fs.writeFileSync(
    tmp,
    JSON.stringify(next, null, 2)
  );

  fs.renameSync(tmp, DATA_FILE);

  return next;
}


// ==============================
// HEALTH CHECK
// ==============================

app.get('/api/health', (req, res) => {

  res.json({
    ok: true,
    service: 'NEW WE-CARE ERP'
  });

});


// ==============================
// GET ERP DATA
// ==============================

app.get('/api/data', (req, res) => {

  try {

    const store = readStore();

    res.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );

    if (req.query.meta === '1') {

      return res.json({
        revision: store.revision
      });

    }

    res.json(store);

  } catch (error) {

    console.error(
      'GET /api/data ERROR:',
      error
    );

    res.status(500).json({
      error: error.message
    });

  }

});


// ==============================
// SAVE ERP DATA
// ==============================

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

    res.json({
      ok: true,
      revision: store.revision
    });

  } catch (error) {

    console.error(
      'PUT /api/data ERROR:',
      error
    );

    res.status(500).json({
      error: error.message
    });

  }

});


// ==============================
// FRONTEND FALLBACK
// IMPORTANT:
// DO NOT USE app.get('*')
// ==============================

app.use((req, res, next) => {

  if (
    req.method === 'GET' &&
    !req.path.startsWith('/api/')
  ) {

    return res.sendFile(
      path.join(ERP_DIR, 'index.html')
    );

  }

  next();

});


// ==============================
// START SERVER
// ==============================

ensureData();

app.listen(PORT, HOST, () => {

  console.log(
    `NEW WE-CARE ERP running on http://${HOST}:${PORT}`
  );

});
```
