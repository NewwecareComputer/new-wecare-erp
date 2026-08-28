const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();

/* =========================================================
   SERVER CONFIG
========================================================= */

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const ROOT = __dirname;
const ERP_DIR = path.join(ROOT, 'erp');
const DATA_DIR = path.join(ROOT, 'data');
const INITIAL_FILE = path.join(DATA_DIR, 'initial-data.json');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('=================================================');
  console.error('ERROR: DATABASE_URL is not configured.');
  console.error('Add DATABASE_URL in Render Environment.');
  console.error('=================================================');
  process.exit(1);
}


/* =========================================================
   POSTGRESQL
========================================================= */

const pool = new Pool({
  connectionString: DATABASE_URL,

  // Render PostgreSQL commonly requires SSL.
  ssl: {
    rejectUnauthorized: false
  },

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});


/* =========================================================
   EXPRESS
========================================================= */

app.use(express.json({
  limit: '50mb'
}));

app.use(express.urlencoded({
  extended: true,
  limit: '50mb'
}));


/* =========================================================
   STATIC ERP
========================================================= */

app.use(express.static(ERP_DIR, {
  index: 'index.html',
  maxAge: 0
}));


/* =========================================================
   SESSION STORAGE
========================================================= */

const sessions = new Map();

function createSession(user) {

  const token = crypto.randomBytes(32).toString('hex');

  sessions.set(token, {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name || user.username,
    createdAt: Date.now()
  });

  return token;
}


function getSession(req) {

  const header =
    req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return null;
  }

  const token =
    header.substring(7).trim();

  if (!token) {
    return null;
  }

  return sessions.get(token) || null;
}


function requireLogin(req, res, next) {

  const session =
    getSession(req);

  if (!session) {

    return res.status(401).json({
      ok: false,
      error: 'Login required'
    });
  }

  req.user = session;

  next();
}


function requireAdmin(req, res, next) {

  const session =
    getSession(req);

  if (!session) {

    return res.status(401).json({
      ok: false,
      error: 'Login required'
    });
  }

  if (session.role !== 'admin') {

    return res.status(403).json({
      ok: false,
      error: 'Admin access required'
    });
  }

  req.user = session;

  next();
}


/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

async function initializeDatabase() {

  console.log('Connecting to PostgreSQL...');

  await pool.query('SELECT NOW()');

  console.log('PostgreSQL connection successful.');


  /* =======================================================
     ERP STORE

     Entire ERP JSON is stored in one PostgreSQL row.
     This keeps compatibility with your existing app.js,
     which already works with one "db" object.
  ======================================================= */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_store (
      id INTEGER PRIMARY KEY,
      revision BIGINT NOT NULL DEFAULT 1,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  /* =======================================================
     USERS
  ======================================================= */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin','staff')),
      name VARCHAR(200),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  /* =======================================================
     DEFAULT USERS
  ======================================================= */

  const adminResult = await pool.query(
    `SELECT id FROM erp_users WHERE username = $1`,
    ['admin']
  );

  if (adminResult.rowCount === 0) {

    const passwordHash =
      await bcrypt.hash('admin123', 12);

    await pool.query(
      `
      INSERT INTO erp_users
        (username, password_hash, role, name)
      VALUES
        ($1, $2, 'admin', $3)
      `,
      [
        'admin',
        passwordHash,
        'Administrator'
      ]
    );

    console.log(
      'Default Admin user created: admin'
    );
  }


  const staffResult = await pool.query(
    `SELECT id FROM erp_users WHERE username = $1`,
    ['staff']
  );

  if (staffResult.rowCount === 0) {

    const passwordHash =
      await bcrypt.hash('staff123', 12);

    await pool.query(
      `
      INSERT INTO erp_users
        (username, password_hash, role, name)
      VALUES
        ($1, $2, 'staff', $3)
      `,
      [
        'staff',
        passwordHash,
        'Staff'
      ]
    );

    console.log(
      'Default Staff user created: staff'
    );
  }


  /* =======================================================
     FIRST ERP DATA MIGRATION
  ======================================================= */

  const storeResult = await pool.query(
    `SELECT id, revision FROM erp_store WHERE id = 1`
  );


  if (storeResult.rowCount === 0) {

    console.log(
      'ERP PostgreSQL store is empty.'
    );

    let initialData = {};

    if (fs.existsSync(INITIAL_FILE)) {

      try {

        initialData = JSON.parse(
          fs.readFileSync(
            INITIAL_FILE,
            'utf8'
          )
        );

        console.log(
          'Loaded bundled initial-data.json'
        );

      } catch (error) {

        console.error(
          'Could not read initial-data.json:',
          error.message
        );

        initialData = {};
      }

    } else {

      console.log(
        'No initial-data.json found.'
      );

    }


    /*
      Normalize important ERP arrays/objects.
    */

    initialData =
      normalizeERPData(initialData);


    await pool.query(
      `
      INSERT INTO erp_store
        (id, revision, data)
      VALUES
        (1, 1, $1::jsonb)
      `,
      [
        JSON.stringify(initialData)
      ]
    );


    console.log(
      'Initial ERP data migrated into PostgreSQL.'
    );

  } else {

    console.log(
      'Existing PostgreSQL ERP data found.'
    );

  }

}


/* =========================================================
   NORMALIZE ERP DATA
========================================================= */

function normalizeERPData(data) {

  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    data = {};
  }


  if (!data.company) {
    data.company = {};
  }

  if (!Array.isArray(data.products)) {
    data.products = [];
  }

  if (!Array.isArray(data.customers)) {
    data.customers = [];
  }

  if (!Array.isArray(data.suppliers)) {
    data.suppliers = [];
  }

  if (!Array.isArray(data.sales)) {
    data.sales = [];
  }

  if (!Array.isArray(data.purchases)) {
    data.purchases = [];
  }

  if (!Array.isArray(data.quotations)) {
    data.quotations = [];
  }

  if (!Array.isArray(data.deliveryChallans)) {
    data.deliveryChallans = [];
  }

  if (!Array.isArray(data.warranties)) {
    data.warranties = [];
  }

  if (!Array.isArray(data.cctvProjects)) {
    data.cctvProjects = [];
  }

  if (!Array.isArray(data.brands)) {
    data.brands = [];
  }

  if (
    !data.itemBrandRates ||
    typeof data.itemBrandRates !== 'object' ||
    Array.isArray(data.itemBrandRates)
  ) {
    data.itemBrandRates = {};
  }

  return data;
}


/* =========================================================
   HEALTH
========================================================= */

app.get('/api/health', async (req, res) => {

  try {

    await pool.query('SELECT 1');

    res.json({
      ok: true,
      service: 'NEW WE-CARE ERP',
      database: 'PostgreSQL',
      api: true
    });

  } catch (error) {

    console.error(
      'Health database error:',
      error
    );

    res.status(500).json({
      ok: false,
      service: 'NEW WE-CARE ERP',
      database: 'error',
      error: error.message
    });
  }

});


/* =========================================================
   AUTH LOGIN
========================================================= */

app.post('/api/auth/login', async (req, res) => {

  try {

    const username =
      String(
        req.body?.username || ''
      ).trim().toLowerCase();

    const password =
      String(
        req.body?.password || ''
      );


    if (!username || !password) {

      return res.status(400).json({
        ok: false,
        error:
          'Username and password required'
      });
    }


    const result =
      await pool.query(
        `
        SELECT
          id,
          username,
          password_hash,
          role,
          name,
          active
        FROM erp_users
        WHERE username = $1
        LIMIT 1
        `,
        [username]
      );


    if (result.rowCount === 0) {

      return res.status(401).json({
        ok: false,
        error:
          'Invalid username or password'
      });
    }


    const user =
      result.rows[0];


    if (!user.active) {

      return res.status(403).json({
        ok: false,
        error:
          'This account is disabled'
      });
    }


    const passwordOK =
      await bcrypt.compare(
        password,
        user.password_hash
      );


    if (!passwordOK) {

      return res.status(401).json({
        ok: false,
        error:
          'Invalid username or password'
      });
    }


    const token =
      createSession(user);


    return res.json({

      ok: true,

      token,

      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name || user.username
      }

    });


  } catch (error) {

    console.error(
      'LOGIN ERROR:',
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        'Login failed: ' +
        error.message
    });

  }

});


/* =========================================================
   CURRENT USER
========================================================= */

app.get(
  '/api/auth/me',
  requireLogin,
  (req, res) => {

    res.json({

      ok: true,

      authenticated: true,

      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        name: req.user.name
      }

    });

  }
);


/* =========================================================
   LOGOUT
========================================================= */

app.post(
  '/api/auth/logout',
  (req, res) => {

    const session =
      getSession(req);

    if (session) {

      const header =
        req.headers.authorization || '';

      const token =
        header.startsWith('Bearer ')
          ? header.substring(7).trim()
          : null;

      if (token) {
        sessions.delete(token);
      }
    }

    res.json({
      ok: true,
      message: 'Logged out'
    });

  }
);


/* =========================================================
   GET ERP DATA
========================================================= */

app.get(
  '/api/data',
  requireLogin,
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            revision,
            data,
            updated_at
          FROM erp_store
          WHERE id = 1
          LIMIT 1
          `
        );


      if (result.rowCount === 0) {

        return res.status(404).json({
          ok: false,
          error:
            'ERP data not initialized'
        });
      }


      const row =
        result.rows[0];


      res.set(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );


      if (req.query.meta === '1') {

        return res.json({
          revision:
            Number(row.revision)
        });
      }


      return res.json({

        revision:
          Number(row.revision),

        data:
          normalizeERPData(row.data)

      });


    } catch (error) {

      console.error(
        'GET /api/data ERROR:',
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message
      });

    }

  }
);


/* =========================================================
   SAVE ERP DATA
========================================================= */

app.put(
  '/api/data',
  requireLogin,
  async (req, res) => {

    try {

      /*
        Staff is allowed to modify only Delivery Challans.

        Because your current app.js sends the complete ERP
        object to /api/data, we merge the staff submission
        with the current database data and preserve all
        restricted sections.
      */

      if (
        !req.body ||
        typeof req.body !== 'object' ||
        Array.isArray(req.body)
      ) {

        return res.status(400).json({
          ok: false,
          error:
            'Invalid ERP data'
        });
      }


      const currentResult =
        await pool.query(
          `
          SELECT
            revision,
            data
          FROM erp_store
          WHERE id = 1
          FOR UPDATE
          `
        );


      if (currentResult.rowCount === 0) {

        return res.status(404).json({
          ok: false,
          error:
            'ERP data not initialized'
        });
      }


      const current =
        normalizeERPData(
          currentResult.rows[0].data
        );


      let nextData;


      if (req.user.role === 'staff') {

        /*
          Staff can only change Delivery Challans.
        */

        nextData = {
          ...current,

          deliveryChallans:
            Array.isArray(
              req.body.deliveryChallans
            )
              ? req.body.deliveryChallans
              : current.deliveryChallans
        };

      } else {

        /*
          Admin can save the complete ERP object.
        */

        nextData =
          normalizeERPData(req.body);
      }


      const nextRevision =
        Number(
          currentResult.rows[0].revision
        ) + 1;


      const updateResult =
        await pool.query(
          `
          UPDATE erp_store
          SET
            revision = $1,
            data = $2::jsonb,
            updated_at = NOW()
          WHERE id = 1
          RETURNING revision, updated_at
          `,
          [
            nextRevision,
            JSON.stringify(nextData)
          ]
        );


      return res.json({

        ok: true,

        revision:
          Number(
            updateResult.rows[0].revision
          ),

        updatedAt:
          updateResult.rows[0].updated_at

      });


    } catch (error) {

      console.error(
        'PUT /api/data ERROR:',
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message
      });

    }

  }
);


/* =========================================================
   ADMIN - CHANGE PASSWORD
========================================================= */

app.post(
  '/api/auth/change-password',
  requireLogin,
  async (req, res) => {

    try {

      const oldPassword =
        String(
          req.body?.oldPassword || ''
        );

      const newPassword =
        String(
          req.body?.newPassword || ''
        );


      if (!oldPassword || !newPassword) {

        return res.status(400).json({
          ok: false,
          error:
            'Old password and new password are required'
        });
      }


      if (newPassword.length < 6) {

        return res.status(400).json({
          ok: false,
          error:
            'New password must be at least 6 characters'
        });
      }


      const result =
        await pool.query(
          `
          SELECT
            id,
            password_hash
          FROM erp_users
          WHERE id = $1
          LIMIT 1
          `,
          [req.user.id]
        );


      if (result.rowCount === 0) {

        return res.status(404).json({
          ok: false,
          error:
            'User not found'
        });
      }


      const valid =
        await bcrypt.compare(
          oldPassword,
          result.rows[0].password_hash
        );


      if (!valid) {

        return res.status(401).json({
          ok: false,
          error:
            'Old password is incorrect'
        });
      }


      const newHash =
        await bcrypt.hash(
          newPassword,
          12
        );


      await pool.query(
        `
        UPDATE erp_users
        SET
          password_hash = $1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          newHash,
          req.user.id
        ]
      );


      return res.json({
        ok: true,
        message:
          'Password changed successfully'
      });


    } catch (error) {

      console.error(
        'CHANGE PASSWORD ERROR:',
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message
      });

    }

  }
);


/* =========================================================
   ADMIN - LIST USERS
========================================================= */

app.get(
  '/api/users',
  requireAdmin,
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            id,
            username,
            role,
            name,
            active,
            created_at,
            updated_at
          FROM erp_users
          ORDER BY id
          `
        );


      return res.json({
        ok: true,
        users: result.rows
      });


    } catch (error) {

      console.error(
        'GET USERS ERROR:',
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message
      });

    }

  }
);


/* =========================================================
   ADMIN - CREATE USER
========================================================= */

app.post(
  '/api/users',
  requireAdmin,
  async (req, res) => {

    try {

      const username =
        String(
          req.body?.username || ''
        ).trim().toLowerCase();

      const password =
        String(
          req.body?.password || ''
        );

      const role =
        String(
          req.body?.role || 'staff'
        ).trim().toLowerCase();

      const name =
        String(
          req.body?.name || username
        ).trim();


      if (!username || !password) {

        return res.status(400).json({
          ok: false,
          error:
            'Username and password required'
        });
      }


      if (
        role !== 'admin' &&
        role !== 'staff'
      ) {

        return res.status(400).json({
          ok: false,
          error:
            'Role must be admin or staff'
        });
      }


      if (password.length < 6) {

        return res.status(400).json({
          ok: false,
          error:
            'Password must be at least 6 characters'
        });
      }


      const hash =
        await bcrypt.hash(
          password,
          12
        );


      const result =
        await pool.query(
          `
          INSERT INTO erp_users
            (username, password_hash, role, name)
          VALUES
            ($1, $2, $3, $4)
          RETURNING
            id,
            username,
            role,
            name,
            active
          `,
          [
            username,
            hash,
            role,
            name
          ]
        );


      return res.status(201).json({
        ok: true,
        user: result.rows[0]
      });


    } catch (error) {

      console.error(
        'CREATE USER ERROR:',
        error
      );


      if (error.code === '23505') {

        return res.status(409).json({
          ok: false,
          error:
            'Username already exists'
        });
      }


      return res.status(500).json({
        ok: false,
        error:
          error.message
      });

    }

  }
);


/* =========================================================
   ADMIN - ENABLE / DISABLE USER
========================================================= */

app.put(
  '/api/users/:id',
  requireAdmin,
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);


      if (!Number.isInteger(id)) {

        return res.status(400).json({
          ok: false,
          error:
            'Invalid user ID'
        });
      }


      const active =
        Boolean(req.body?.active);


      const result =
        await pool.query(
          `
          UPDATE erp_users
          SET
            active = $1,
            updated_at = NOW()
          WHERE id = $2
          RETURNING
            id,
            username,
            role,
            name,
            active
          `,
          [
            active,
            id
          ]
        );


      if (result.rowCount === 0) {

        return res.status(404).json({
          ok: false,
          error:
            'User not found'
        });
      }


      return res.json({
        ok: true,
        user:
          result.rows[0]
      });


    } catch (error) {

      console.error(
        'UPDATE USER ERROR:',
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message
      });

    }

  }
);


/* =========================================================
   API 404
========================================================= */

app.use('/api', (req, res) => {

  res.status(404).json({

    ok: false,

    error:
      'API endpoint not found',

    method:
      req.method,

    path:
      req.path

  });

});


/* =========================================================
   FRONTEND FALLBACK
   IMPORTANT:
   Do NOT use app.get('*')
========================================================= */

app.use((req, res, next) => {

  if (req.method !== 'GET') {
    return next();
  }


  const indexFile =
    path.join(
      ERP_DIR,
      'index.html'
    );


  if (
    fs.existsSync(indexFile)
  ) {

    return res.sendFile(
      indexFile
    );

  }


  next();

});


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {

    console.error(
      'SERVER ERROR:',
      error
    );


    if (res.headersSent) {
      return next(error);
    }


    res.status(500).json({
      ok: false,
      error:
        'Internal server error'
    });

  }
);


/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

  try {

    await initializeDatabase();


    app.listen(
      PORT,
      HOST,
      () => {

        console.log(
          '=============================================='
        );

        console.log(
          'NEW WE-CARE ERP'
        );

        console.log(
          'Server running on port:',
          PORT
        );

        console.log(
          'Database: PostgreSQL'
        );

        console.log(
          '=============================================='
        );

      }
    );


  } catch (error) {

    console.error(
      'SERVER START FAILED:',
      error
    );

    process.exit(1);

  }

}


startServer();


/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

async function shutdown(signal) {

  console.log(
    `${signal} received. Shutting down...`
  );

  try {

    await pool.end();

    process.exit(0);

  } catch (error) {

    console.error(
      'Shutdown error:',
      error
    );

    process.exit(1);

  }

}


process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);
