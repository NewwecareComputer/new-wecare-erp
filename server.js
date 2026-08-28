const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const ROOT = __dirname;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Set it in Render Environment Variables.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10
});

app.use(express.json({limit:'20mb'}));
app.use(express.static(path.join(ROOT,'erp')));

const initial = require('./data/initial-data.json');

async function initDb(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_store (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision BIGINT NOT NULL DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const r = await pool.query('SELECT id FROM erp_store WHERE id=1');
  if (!r.rowCount) {
    await pool.query(
      'INSERT INTO erp_store(id,revision,data) VALUES(1,1,$1::jsonb)',
      [JSON.stringify(initial)]
    );
    console.log('PostgreSQL initialized from data/initial-data.json');
  }
}

async function getStore(){
  const r=await pool.query('SELECT revision,data FROM erp_store WHERE id=1');
  if(!r.rowCount) throw new Error('ERP database is not initialized');
  return r.rows[0];
}

app.get('/api/health', async (req,res)=>{
  try {
    await pool.query('SELECT 1');
    const s=await getStore();
    res.json({ok:true,database:'postgresql',revision:Number(s.revision),service:'NEW WE-CARE ERP'});
  } catch(e) { res.status(500).json({ok:false,error:e.message}); }
});

app.get('/api/data', async (req,res)=>{
  try {
    const s=await getStore();
    res.set('Cache-Control','no-store, no-cache, must-revalidate');
    if(req.query.meta==='1') return res.json({revision:Number(s.revision)});
    res.json({revision:Number(s.revision),data:s.data});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.put('/api/data', async (req,res)=>{
  try {
    if(!req.body || typeof req.body!=='object') return res.status(400).json({error:'Invalid ERP data'});
    const expected = req.get('x-erp-revision');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur=await client.query('SELECT revision FROM erp_store WHERE id=1 FOR UPDATE');
      const rev=Number(cur.rows[0].revision);
      if(expected && Number(expected)!==rev){
        await client.query('ROLLBACK');
        return res.status(409).json({error:'ERP data changed on another device',revision:rev});
      }
      const next=rev+1;
      await client.query(
        'UPDATE erp_store SET revision=$1,data=$2::jsonb,updated_at=NOW() WHERE id=1',
        [next,JSON.stringify(req.body)]
      );
      await client.query('COMMIT');
      res.set('Cache-Control','no-store');
      res.json({ok:true,revision:next});
    } catch(e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    } finally { client.release(); }
  } catch(e) { res.status(500).json({error:e.message}); }
});

/* One-time migration of an existing browser's old localStorage ERP data.
   It is deliberately explicit so one device cannot silently overwrite live data. */
app.post('/api/import', async (req,res)=>{
  try {
    if(req.get('x-erp-import-key') !== process.env.ERP_IMPORT_KEY)
      return res.status(403).json({error:'Import key required'});
    if(!req.body || typeof req.body!=='object')
      return res.status(400).json({error:'Invalid ERP data'});
    const s=await getStore();
    const next=Number(s.revision)+1;
    await pool.query('UPDATE erp_store SET revision=$1,data=$2::jsonb,updated_at=NOW() WHERE id=1',
      [next,JSON.stringify(req.body)]);
    res.json({ok:true,revision:next,message:'ERP data imported to PostgreSQL'});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('*',(req,res)=>res.sendFile(path.join(ROOT,'erp','index.html')));

initDb()
  .then(()=>app.listen(PORT,HOST,()=>console.log(`NEW WE-CARE ERP live on ${HOST}:${PORT}`)))
  .catch(e=>{console.error('Database startup failed:',e);process.exit(1);});
