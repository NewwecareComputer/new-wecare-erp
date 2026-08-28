const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'erp-data.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(ROOT, 'erp')));

function ensureData() {
  const dir = path.dirname(DATA_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const bundled = require('./data/initial-data.json');

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({
        revision: 1,
        data: bundled
      }, null, 2)
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


/* HEALTH */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'NEW WE-CARE ERP'
  });
});


/* GET DATA */

app.get('/api/data', (req, res) => {
  try {
    const store = readStore();

    if (req.query.meta === '1') {
      return res.json({
        revision: store.revision
      });
    }

    res.set('Cache-Control', 'no-store');

    res.json(store);

  } catch (e) {
    console.error('Read data error:', e);

    res.status(500).json({
      error: e.message
    });
  }
});


/* SAVE DATA */

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

    const store = writeStore(req.body);

    res.json({
      ok: true,
      revision: store.revision
    });

  } catch (e) {

    console.error('Save data error:', e);

    res.status(500).json({
      error: e.message
    });
  }
});


/* RESTORE BACKUP */

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

    const data =
      backup.data &&
      typeof backup.data === 'object'
        ? backup.data
        : backup;

    if (
      !data.company &&
      !data.products &&
      !data.customers
    ) {
      return res.status(400).json({
        error: 'Invalid NEW WE-CARE ERP backup'
      });
    }

    const saved = writeStore(data);

    console.log(
      'ERP backup restored successfully. Revision:',
      saved.revision
    );

    return res.json({
      ok: true,
      message: 'ERP backup restored successfully',
      revision: saved.revision
    });

  } catch (e) {

    console.error('Restore error:', e);

    return res.status(500).json({
      error: e.message
    });
  }
});


/* FRONTEND - MUST BE LAST */

app.get('/*splat', (req, res) => {
  res.sendFile(
    path.join(
      ROOT,
      'erp',
      'index.html'
    )
  );
});


/* START */

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
