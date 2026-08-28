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

app.use(express.json({ limit: '20mb' }));

/* =========================================================
   STATIC ERP
========================================================= */

app.use(express.static(ERP_DIR, {
  index: 'index.html',
  maxAge: 0
}));


/* =========================================================
   FILE DATA STORAGE
========================================================= */

function ensureData() {

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {

    let bundled = {};

    if (fs.existsSync(INITIAL_FILE)) {

      try {

        bundled = JSON.parse(
          fs.readFileSync(INITIAL_FILE, 'utf8')
        );

      } catch (err) {

        console.error(
          'initial-data.json error:',
          err.message
        );

        bundled = {};
      }
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

  try {

    return JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
    );

  } catch (err) {

    console.error(
      'readStore error:',
      err.message
    );

    return {
      revision: 1,
      data: {}
    };
  }
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

  fs.renameSync(
    tempFile,
    DATA_FILE
  );

  return next;
}


/* =========================================================
   HEALTH
========================================================= */

app.get('/api/health', (req, res) => {

  res.json({
    ok: true,
    service: 'NEW WE-CARE ERP',
    api: true
  });

});


/* =========================================================
   AUTH - LOGIN
========================================================= */

app.post('/api/auth/login', (req, res) => {

  try {

    const username =
      String(req.body?.username || '').trim();

    const password =
      String(req.body?.password || '');

    if (!username || !password) {

      return res.status(400).json({
        ok: false,
        error: 'Username and password required'
      });
    }


    /*
      TEMPORARY BUILT-IN LOGIN

      Admin:
      admin / admin123

      Staff:
      staff / staff123
    */

    if (
      username === 'admin' &&
      password === 'admin123'
    ) {

      return res.json({
        ok: true,
        user: {
          username: 'admin',
          role: 'admin',
          name: 'Administrator'
        }
      });
    }


    if (
      username === 'staff' &&
      password === 'staff123'
    ) {

      return res.json({
        ok: true,
        user: {
          username: 'staff',
          role: 'staff',
          name: 'Staff'
        }
      });
    }


    return res.status(401).json({
      ok: false,
      error: 'Invalid username or password'
    });

  } catch (err) {

    console.error(
      'LOGIN ERROR:',
      err
    );

    res.status(500).json({
      ok: false,
      error: 'Login failed'
    });
  }

});


/* =========================================================
   AUTH - CURRENT USER
========================================================= */

app.get('/api/auth/me', (req, res) => {

  /*
    Frontend can call this endpoint.

    No server-side session is required in this
    simple version.
  */

  res.json({
    ok: false,
    authenticated: false,
    user: null
  });

});


/* =========================================================
   AUTH - LOGOUT
========================================================= */

app.post('/api/auth/logout', (req, res) => {

  res.json({
    ok: true,
    message: 'Logged out'
  });

});


/* =========================================================
   GET ERP DATA
========================================================= */

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

    return res.json(store);

  } catch (err) {

    console.error(
      'GET /api/data ERROR:',
      err
    );

    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }

});


/* =========================================================
   SAVE ERP DATA
========================================================= */

app.put('/api/data', (req, res) => {

  try {

    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body)
    ) {

      return res.status(400).json({
        ok: false,
        error: 'Invalid ERP data'
      });
    }

    const store = writeStore(req.body);

    return res.json({
      ok: true,
      revision: store.revision
    });

  } catch (err) {

    console.error(
      'PUT /api/data ERROR:',
      err
    );

    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }

});


/* =========================================================
   API 404
========================================================= */

app.use('/api', (req, res) => {

  res.status(404).json({
    ok: false,
    error: 'API endpoint not found',
    method: req.method,
    path: req.path
  });

});


/* =========================================================
   FRONTEND FALLBACK
   IMPORTANT:
   DO NOT USE app.get('*')
========================================================= */

app.use((req, res, next) => {

  if (req.method === 'GET') {

    const indexFile =
      path.join(ERP_DIR, 'index.html');

    if (fs.existsSync(indexFile)) {

      return res.sendFile(indexFile);
    }
  }

  next();
});


/* =========================================================
   START
========================================================= */

ensureData();

app.listen(
  PORT,
  HOST,
  () => {

    console.log(
      'NEW WE-CARE ERP running on http://' +
      HOST +
      ':' +
      PORT
    );

  }
);
