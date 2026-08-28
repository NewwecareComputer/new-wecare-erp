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


// ========================================
// MIDDLEWARE
// ========================================

app.use(express.json({
  limit: '10mb'
}));


// ========================================
// SERVE ERP FRONTEND
// ========================================

app.use(express.static(ERP_DIR, {
  index: 'index.html',
  maxAge: 0
}));


// ========================================
// ENSURE DATA STORAGE
// ========================================

function ensureData() {

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true
    });
  }

  if (!fs.existsSync(DATA_FILE)) {

    let bundled = {};

    try {

      if (fs.existsSync(INITIAL_FILE)) {

        bundled = JSON.parse(
          fs.readFileSync(
            INITIAL_FILE,
            'utf8'
          )
        );

      }

    } catch (error) {

      console.error(
        'INITIAL DATA ERROR:',
        error
      );

      bundled = {};

    }

    const initialStore = {
      revision: 1,
      data: bundled
    };

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        initialStore,
        null,
        2
      ),
      'utf8'
    );
  }
}


// ========================================
// READ ERP STORE
// ========================================

function readStore() {

  ensureData();

  try {

    const content = fs.readFileSync(
      DATA_FILE,
      'utf8'
    );

    return JSON.parse(content);

  } catch (error) {

    console.error(
      'READ STORE ERROR:',
      error
    );

    return {
      revision: 1,
      data: {}
    };

  }
}


// ========================================
// WRITE ERP STORE
// ========================================

function writeStore(data) {

  const current = readStore();

  const next = {
    revision:
      Number(current.revision || 0) + 1,

    data: data
  };

  const temporaryFile =
    DATA_FILE + '.tmp';

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(
      next,
      null,
      2
    ),
    'utf8'
  );

  fs.renameSync(
    temporaryFile,
    DATA_FILE
  );

  return next;
}


// ========================================
// HEALTH CHECK
// ========================================

app.get(
  '/api/health',
  function (req, res) {

    res.json({
      ok: true,
      service: 'NEW WE-CARE ERP'
    });

  }
);


// ========================================
// GET ERP DATA
// ========================================

app.get(
  '/api/data',
  function (req, res) {

    try {

      const store = readStore();

      res.set(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );

      res.set(
        'Pragma',
        'no-cache'
      );

      res.set(
        'Expires',
        '0'
      );


      // Only revision
      if (req.query.meta === '1') {

        return res.json({
          revision: store.revision
        });

      }


      // Complete ERP data
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


// ========================================
// SAVE ERP DATA
// ========================================

app.put(
  '/api/data',
  function (req, res) {

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

      const store = writeStore(
        req.body
      );

      return res.json({
        ok: true,
        revision: store.revision
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


// ========================================
// FRONTEND FALLBACK
//
// IMPORTANT:
// Do NOT use app.get('*')
// because newer Express/path-to-regexp
// versions reject '*'
// ========================================

app.use(
  function (req, res, next) {

    if (
      req.method === 'GET' &&
      !req.path.startsWith('/api/')
    ) {

      const indexFile =
        path.join(
          ERP_DIR,
          'index.html'
        );

      if (fs.existsSync(indexFile)) {

        return res.sendFile(
          indexFile
        );

      }

    }

    return next();

  }
);


// ========================================
// API 404
// ========================================

app.use(
  '/api',
  function (req, res) {

    res.status(404).json({
      error: 'API endpoint not found',
      path: req.path
    });

  }
);


// ========================================
// GENERAL ERROR HANDLER
// ========================================

app.use(
  function (error, req, res, next) {

    console.error(
      'SERVER ERROR:',
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      error: error.message || 'Server error'
    });

  }
);


// ========================================
// START SERVER
// ========================================

ensureData();

app.listen(
  PORT,
  HOST,
  function () {

    console.log(
      'NEW WE-CARE ERP running on http://' +
      HOST +
      ':' +
      PORT
    );

  }
);
