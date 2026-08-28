const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const ROOT = __dirname;

const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'erp-data.json');
const INITIAL_FILE = path.join(DATA_DIR, 'initial-data.json');

app.use(express.json({ limit: '10mb' }));

// Frontend
app.use(express.static(path.join(ROOT, 'erp')));

/* =========================
   DATA FUNCTIONS
========================= */

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    let initialData = {};

    if (fs.existsSync(INITIAL_FILE)) {
      initialData = JSON.parse(
        fs.readFileSync(INITIAL_FILE, 'utf8')
      );
    }

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        {
          revision: 1,
          data: initialData
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

  const tempFile = DATA_FILE + '.tmp';

  fs.writeFileSync(
    tempFile,
    JSON.stringify(next, null, 2)
  );

  fs.renameSync(tempFile, DATA_FILE);

  return next;
}

/* =========================
   HEALTH CHECK
========================= */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'NEW WE-CARE ERP'
  });
});

/* =========================
   GET ERP DATA
========================= */

app.get('/api/data', (req, res) => {
  try {
    const store = readStore();

    if (req.query.meta === '1') {
      return res.json({
        revision: store.revision
      });
    }

    res.set('Cache-Control', 'no-store');

    return res.json(store);

  } catch (error) {
    console.error('GET DATA ERROR:', error);

    return res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   SAVE ERP DATA
========================= */

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

    const saved = writeStore(req.body);

    return res.json({
      ok: true,
      revision: saved.revision
    });

  } catch (error) {
    console.error('SAVE DATA ERROR:', error);

    return res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   RESTORE JSON BACKUP
========================= */

app.post('/api/restore', (req, res) => {
  try {
    const backup = req.body;

    if (
      !backup ||
      typeof backup !== 'object' ||
      Array.isArray(backup)
    ) {
      return res.status(400).json({
        error: 'Invalid backup JSON'
      });
    }

    /*
      Supports both formats:

      1)
      {
        company: {},
        products: [],
        customers: [],
        suppliers: [],
        sales: [],
        quotations: [],
        purchases: []
      }

      2)
      {
        revision: 3,
        data: {
          company: {},
          products: []
        }
      }
    */

    const data =
      backup.data &&
      typeof backup.data === 'object' &&
      !Array.isArray(backup.data)
        ? backup.data
        : backup;

    const hasERPData =
      data.company ||
      Array.isArray(data.products) ||
      Array.isArray(data.customers) ||
      Array.isArray(data.suppliers) ||
      Array.isArray(data.sales) ||
      Array.isArray(data.quotations) ||
      Array.isArray(data.purchases);

    if (!hasERPData) {
      return res.status(400).json({
        error: 'Invalid NEW WE-CARE ERP backup'
      });
    }

    const saved = writeStore(data);

    console.log(
      'ERP BACKUP RESTORED - Revision:',
      saved.revision
    );

    return res.json({
      ok: true,
      message: 'ERP backup restored successfully',
      revision: saved.revision
    });

  } catch (error) {
    console.error('RESTORE ERROR:', error);

    return res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   FRONTEND FALLBACK
   MUST BE LAST
========================= */

app.get('*splat', (req, res) => {
  res.sendFile(
    path.join(ROOT, 'erp', 'index.html')
  );
});

/* =========================
   START SERVER
========================= */

ensureData();

app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `NEW WE-CARE ERP running on http://${HOST}:${PORT}`
    );
  }
);
