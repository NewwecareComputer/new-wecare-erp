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

app.use(express.json({ limit: '20mb' }));

// Prevent browser/proxy caching API data
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

app.use(express.static(path.join(ROOT, 'erp'), {
  etag: false,
  lastModified: false,
  maxAge: 0
}));

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
  ensureData();

  const current = readStore();

  const next = {
    revision: Number(current.revision || 0) + 1,
    data: data
  };

  const tempFile = DATA_FILE + '.tmp';

  fs.writeFileSync(
    tempFile,
    JSON.stringify(next, null, 2),
    'utf8'
  );

  fs.renameSync(tempFile, DATA_FILE);

  return next;
}


/* =========================
   HEALTH
========================= */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'NEW WE-CARE ERP'
  });
});


/* =========================
   GET DATA
========================= */

app.get('/api/data', (req, res) => {
  try {
    const store = readStore();

    if (req.query.meta === '1') {
      return res.json({
        revision: store.revision
      });
    }

    return res.json(store);

  } catch (error) {
    console.error('GET DATA ERROR:', error);

    return res.status(500).json({
      error: error.message
    });
  }
});


/* =========================
   SAVE DATA
========================= */

app.put('/api/data', (req, res) => {
  try {
    if (
      !req.body ||
      typeof req.body !== 'object'
    ) {
      return res.status(400).json({
        error: 'Invalid ERP data'
      });
    }

    const saved = writeStore(req.body);

    console.log(
      'ERP data saved. Revision:',
      saved.revision
    );

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
   RESTORE BACKUP
========================= */

app.post('/api/restore', (req, res) => {
  try {
    const backup = req.body;

    if (
      !backup ||
      typeof backup !== 'object'
    ) {
      return res.status(400).json({
        error: 'Invalid backup JSON'
      });
    }

    /*
      Supports:

      1.
      {
        company: {},
        products: [],
        customers: [],
        ...
      }

      2.
      {
        revision: 3,
        data: {
          company: {},
          products: [],
          customers: [],
          ...
        }
      }
    */

    let data;

    if (
      backup.data &&
      typeof backup.data === 'object' &&
      !Array.isArray(backup.data)
    ) {
      data = backup.data;
    } else {
      data = backup;
    }

    /*
      Basic validation
    */

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
        error:
          'This does not look like a valid NEW WE-CARE ERP backup'
      });
    }

    /*
      IMPORTANT:
      Directly replace current server data.
    */

    const saved = writeStore(data);

    /*
      Verify immediately after writing.
    */

    const verify = readStore();

    console.log(
      '======================================'
    );

    console.log(
      'ERP BACKUP RESTORED'
    );

    console.log(
      'Revision:',
      verify.revision
    );

    console.log(
      'Products:',
      Array.isArray(verify.data.products)
        ? verify.data.products.length
        : 0
    );

    console.log(
      'Customers:',
      Array.isArray(verify.data.customers)
        ? verify.data.customers.length
        : 0
    );

    console.log(
      'Suppliers:',
      Array.isArray(verify.data.suppliers)
        ? verify.data.suppliers.length
        : 0
    );

    console.log(
      'Sales:',
      Array.isArray(verify.data.sales)
        ? verify.data.sales.length
        : 0
    );

    console.log(
      'Quotations:',
      Array.isArray(verify.data.quotations)
        ? verify.data.quotations.length
        : 0
    );

    console.log(
      'Purchases:',
      Array.isArray(verify.data.purchases)
        ? verify.data.purchases.length
        : 0
    );

    console.log(
      '======================================'
    );

    return res.json({
      ok: true,
      message: 'ERP backup restored successfully',
      revision: saved.revision,

      counts: {
        products: Array.isArray(data.products)
          ? data.products.length
          : 0,

        customers: Array.isArray(data.customers)
          ? data.customers.length
          : 0,

        suppliers: Array.isArray(data.suppliers)
          ? data.suppliers.length
          : 0,

        sales: Array.isArray(data.sales)
          ? data.sales.length
          : 0,

        quotations: Array.isArray(data.quotations)
          ? data.quotations.length
          : 0,

        purchases: Array.isArray(data.purchases)
          ? data.purchases.length
          : 0
      }
    });

  } catch (error) {
    console.error(
      'RESTORE ERROR:',
      error
    );

    return res.status(500).json({
      error: error.message
    });
  }
});


/* =========================
   FRONTEND
   MUST BE LAST
========================= */

app.get('*splat', (req, res) => {
  res.sendFile(
    path.join(
      ROOT,
      'erp',
      'index.html'
    )
  );
});


/* =========================
   START
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
