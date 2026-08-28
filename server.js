const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const ROOT = __dirname;

// Render Persistent Disk હોય તો ERP_DATA_FILE environment variableમાં
// /var/data/erp-data.json આપવું.
// નહીં હોય તો projectના data folderમાં save થશે.
const DATA_FILE =
  process.env.ERP_DATA_FILE ||
  path.join(ROOT, 'data', 'erp-data.json');

const INITIAL_FILE =
  path.join(ROOT, 'data', 'initial-data.json');

app.use(express.json({ limit: '10mb' }));

// Frontend
app.use(
  express.static(path.join(ROOT, 'erp'), {
    etag: false,
    maxAge: 0
  })
);

/* =========================================================
   DATA FUNCTIONS
========================================================= */

function ensureData() {
  const dataDir = path.dirname(DATA_FILE);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // IMPORTANT:
  // Existing old data will NEVER be overwritten here.
  if (!fs.existsSync(DATA_FILE)) {
    let initialData = {};

    if (fs.existsSync(INITIAL_FILE)) {
      try {
        initialData = JSON.parse(
          fs.readFileSync(INITIAL_FILE, 'utf8')
        );
      } catch (error) {
        console.error(
          'Initial data JSON error:',
          error.message
        );
      }
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
      ),
      'utf8'
    );
  }
}

function readStore() {
  ensureData();

  const raw = fs.readFileSync(
    DATA_FILE,
    'utf8'
  );

  const store = JSON.parse(raw);

  // Safety for old files
  if (
    !store ||
    typeof store !== 'object'
  ) {
    throw new Error(
      'Invalid ERP data store'
    );
  }

  if (!store.data) {
    store.data = {};
  }

  if (!store.revision) {
    store.revision = 1;
  }

  return store;
}

function writeStore(data) {
  ensureData();

  const current = readStore();

  const next = {
    revision:
      Number(current.revision || 0) + 1,

    data: data
  };

  const tempFile =
    DATA_FILE + '.tmp';

  fs.writeFileSync(
    tempFile,
    JSON.stringify(
      next,
      null,
      2
    ),
    'utf8'
  );

  fs.renameSync(
    tempFile,
    DATA_FILE
  );

  return next;
}

/* =========================================================
   HEALTH
========================================================= */

app.get(
  '/api/health',
  (req, res) => {
    res.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );

    res.json({
      ok: true,
      service: 'NEW WE-CARE ERP'
    });
  }
);

/* =========================================================
   GET ERP DATA
========================================================= */

app.get(
  '/api/data',
  (req, res) => {
    try {
      const store = readStore();

      // NEVER cache ERP data
      res.set({
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      if (req.query.meta === '1') {
        return res.json({
          revision: store.revision
        });
      }

      return res.json(store);

    } catch (error) {
      console.error(
        'GET /api/data ERROR:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }
);

/* =========================================================
   SAVE ERP DATA
========================================================= */

app.put(
  '/api/data',
  (req, res) => {
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

      const saved =
        writeStore(req.body);

      console.log(
        'ERP data saved. Revision:',
        saved.revision
      );

      return res.json({
        ok: true,
        revision:
          saved.revision
      });

    } catch (error) {
      console.error(
        'PUT /api/data ERROR:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }
);

/* =========================================================
   RESTORE BACKUP
========================================================= */

app.post(
  '/api/restore',
  (req, res) => {
    try {
      const backup = req.body;

      if (
        !backup ||
        typeof backup !== 'object' ||
        Array.isArray(backup)
      ) {
        return res.status(400).json({
          error:
            'Invalid backup JSON'
        });
      }

      /*
        Supports:

        FORMAT 1

        {
          company: {},
          products: [],
          customers: [],
          suppliers: [],
          sales: [],
          quotations: [],
          purchases: []
        }


        FORMAT 2

        {
          revision: 3,
          data: {
            company: {},
            products: [],
            customers: [],
            suppliers: [],
            sales: [],
            quotations: [],
            purchases: []
          }
        }
      */

      let data = backup;

      if (
        backup.data &&
        typeof backup.data === 'object' &&
        !Array.isArray(
          backup.data
        )
      ) {
        data = backup.data;
      }

      const validERPData =
        data.company ||
        Array.isArray(
          data.products
        ) ||
        Array.isArray(
          data.customers
        ) ||
        Array.isArray(
          data.suppliers
        ) ||
        Array.isArray(
          data.sales
        ) ||
        Array.isArray(
          data.quotations
        ) ||
        Array.isArray(
          data.purchases
        );

      if (!validERPData) {
        return res.status(400).json({
          error:
            'This does not look like a valid NEW WE-CARE ERP backup'
        });
      }

      // Save restored backup
      const saved =
        writeStore(data);

      console.log(
        '================================'
      );

      console.log(
        'ERP BACKUP RESTORED'
      );

      console.log(
        'Revision:',
        saved.revision
      );

      console.log(
        'Products:',
        Array.isArray(data.products)
          ? data.products.length
          : 0
      );

      console.log(
        'Customers:',
        Array.isArray(data.customers)
          ? data.customers.length
          : 0
      );

      console.log(
        'Suppliers:',
        Array.isArray(data.suppliers)
          ? data.suppliers.length
          : 0
      );

      console.log(
        'Sales:',
        Array.isArray(data.sales)
          ? data.sales.length
          : 0
      );

      console.log(
        'Quotations:',
        Array.isArray(data.quotations)
          ? data.quotations.length
          : 0
      );

      console.log(
        'Purchases:',
        Array.isArray(data.purchases)
          ? data.purchases.length
          : 0
      );

      console.log(
        '================================'
      );

      return res.json({
        ok: true,

        message:
          'ERP backup restored successfully',

        revision:
          saved.revision,

        counts: {
          products:
            Array.isArray(data.products)
              ? data.products.length
              : 0,

          customers:
            Array.isArray(data.customers)
              ? data.customers.length
              : 0,

          suppliers:
            Array.isArray(data.suppliers)
              ? data.suppliers.length
              : 0,

          sales:
            Array.isArray(data.sales)
              ? data.sales.length
              : 0,

          quotations:
            Array.isArray(data.quotations)
              ? data.quotations.length
              : 0,

          purchases:
            Array.isArray(data.purchases)
              ? data.purchases.length
              : 0
        }
      });

    } catch (error) {
      console.error(
        'POST /api/restore ERROR:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }
);

/* =========================================================
   FRONTEND FALLBACK
   MUST BE LAST
========================================================= */

app.get(
  '*splat',
  (req, res) => {
    res.set({
      'Cache-Control':
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    return res.sendFile(
      path.join(
        ROOT,
        'erp',
        'index.html'
      )
    );
  }
);

/* =========================================================
   START SERVER
========================================================= */

ensureData();

app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      '================================'
    );

    console.log(
      'NEW WE-CARE ERP STARTED'
    );

    console.log(
      `PORT: ${PORT}`
    );

    console.log(
      `DATA FILE: ${DATA_FILE}`
    );

    console.log(
      '================================'
    );
  }
);
