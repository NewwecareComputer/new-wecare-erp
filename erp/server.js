const express=require('express');
const path=require('path');
const crypto=require('crypto');
const bcrypt=require('bcryptjs');
const {Pool}=require('pg');
const app=express();
app.use(express.json({limit:'10mb'}));
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;
function cookieOpts(){return 'Path=/; HttpOnly; SameSite=Lax; Max-Age=86400'+(process.env.NODE_ENV==='production'?'; Secure':'')}
function parseCookies(req){const out={};for(const p of (req.headers.cookie||'').split(';')){const i=p.indexOf('=');if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1));}return out}
async function init(){
 if(!pool){console.warn('DATABASE_URL not set: PostgreSQL is not configured.');return}
 await pool.query(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','staff')), active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW());`);
 const r=await pool.query('SELECT COUNT(*)::int c FROM users');
 if(r.rows[0].c===0){
  const a=await bcrypt.hash('admin123',12),s=await bcrypt.hash('staff123',12);
  await pool.query('INSERT INTO users(username,password_hash,name,role) VALUES($1,$2,$3,$4),($5,$6,$7,$8)', ['admin',a,'Administrator','admin','staff',s,'Delivery Staff','staff']);
  console.log('Default users created. Change passwords after first login.')
 }
 await ensureDataTable();
}

async function findUser(username){if(pool){const r=await pool.query('SELECT id,username,password_hash,name,role,active FROM users WHERE username=$1',[username]);return r.rows[0]}return username==='admin'?{id:1,username:'admin',password_hash:await bcrypt.hash('admin123',10),name:'Administrator',role:'admin',active:true}:username==='staff'?{id:2,username:'staff',password_hash:await bcrypt.hash('staff123',10),name:'Delivery Staff',role:'staff',active:true}:null}
async function sessionUser(req){
 const sid=parseCookies(req).sid;
 if(!sid||!pool)return null;
 const hash=crypto.createHash('sha256').update(sid).digest('hex');
 const r=await pool.query(`SELECT u.id,u.username,u.name,u.role,u.active,s.expires_at FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1`,[hash]);
 const row=r.rows[0];
 if(!row||!row.active||new Date(row.expires_at).getTime()<Date.now()){if(row)await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[hash]);return null}
 return {id:row.id,username:row.username,name:row.name,role:row.role};
}
app.post('/api/auth/login',async(req,res)=>{try{const {username,password}=req.body||{};if(!username||!password)return res.status(400).json({error:'Username and password required'});if(!pool)return res.status(503).json({error:'PostgreSQL is required for login'});const r=await pool.query('SELECT id,username,password_hash,name,role,active FROM users WHERE username=$1',[String(username).trim()]);const u=r.rows[0];if(!u||!u.active||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:'Invalid username or password'});const token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex');await pool.query('DELETE FROM auth_sessions WHERE expires_at < NOW()');await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[hash,u.id]);res.setHeader('Set-Cookie',`sid=${token}; ${cookieOpts()}`);res.json({user:{id:u.id,username:u.username,name:u.name,role:u.role}})}catch(e){console.error(e);res.status(500).json({error:'Login service error'})}});
app.get('/api/auth/me',async(req,res)=>{try{const u=await sessionUser(req);if(!u)return res.status(401).json({error:'Not logged in'});res.json({user:u})}catch(e){res.status(500).json({error:'Authentication service error'})}});
app.post('/api/auth/logout',async(req,res)=>{try{const sid=parseCookies(req).sid;if(sid&&pool){const hash=crypto.createHash('sha256').update(sid).digest('hex');await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[hash])}}catch(e){}res.setHeader('Set-Cookie','sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');res.json({ok:true})});
async function requireAuth(req,res,next){try{const u=await sessionUser(req);if(!u)return res.status(401).json({error:'Authentication required'});req.user=u;next()}catch(e){console.error(e);res.status(500).json({error:'Authentication service error'})}}
app.get('/api/auth/users',requireAuth,async(req,res)=>{if(req.user.role!=='admin')return res.status(403).json({error:'Admin only'});if(!pool)return res.json([]);const r=await pool.query('SELECT id,username,name,role,active,created_at FROM users ORDER BY id');res.json(r.rows)});
app.post('/api/auth/users',requireAuth,async(req,res)=>{if(req.user.role!=='admin')return res.status(403).json({error:'Admin only'});if(!pool)return res.status(503).json({error:'PostgreSQL is required for user management'});const {username,password,name,role='staff'}=req.body||{};if(!username||!password||!name||!['admin','staff'].includes(role))return res.status(400).json({error:'username, password, name and valid role are required'});const h=await bcrypt.hash(password,12);try{const r=await pool.query('INSERT INTO users(username,password_hash,name,role) VALUES($1,$2,$3,$4) RETURNING id,username,name,role,active',[username.trim(),h,name.trim(),role]);res.status(201).json(r.rows[0])}catch(e){if(e.code==='23505')return res.status(409).json({error:'Username already exists'});throw e}});
app.delete('/api/auth/users/:id',requireAuth,async(req,res)=>{if(req.user.role!=='admin')return res.status(403).json({error:'Admin only'});if(!pool)return res.status(503).json({error:'PostgreSQL is required for user management'});const id=Number(req.params.id);if(!id||id<=2)return res.status(400).json({error:'Default users cannot be deleted'});await pool.query('DELETE FROM users WHERE id=$1',[id]);res.json({ok:true})});
app.use(express.static(path.join(__dirname)));

async function ensureDataTable(){
  if(!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS erp_data(id INTEGER PRIMARY KEY CHECK(id=1), data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW(), updated_by INTEGER REFERENCES users(id));`);
}
async function getERPData(){
  if(!pool) return null;
  const r=await pool.query('SELECT data FROM erp_data WHERE id=1');
  return r.rows[0]?.data || null;
}
app.get('/api/data',requireAuth,async(req,res)=>{try{const data=await getERPData();res.json({data})}catch(e){console.error(e);res.status(500).json({error:'Could not load ERP data'})}});
app.put('/api/data',requireAuth,async(req,res)=>{
  try{
    if(!pool) return res.status(503).json({error:'PostgreSQL is required for shared ERP data'});
    const incoming=req.body?.data;
    if(!incoming || typeof incoming!=='object') return res.status(400).json({error:'Invalid ERP data'});
    if(req.user.role==='staff'){
      const current=await getERPData() || {};
      const safe={...current,deliveryChallans:Array.isArray(incoming.deliveryChallans)?incoming.deliveryChallans:(current.deliveryChallans||[])};
      await pool.query(`INSERT INTO erp_data(id,data,updated_at,updated_by) VALUES(1,$1,NOW(),$2) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW(),updated_by=EXCLUDED.updated_by`,[JSON.stringify(safe),req.user.id]);
    }else{
      await pool.query(`INSERT INTO erp_data(id,data,updated_at,updated_by) VALUES(1,$1,NOW(),$2) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW(),updated_by=EXCLUDED.updated_by`,[JSON.stringify(incoming),req.user.id]);
    }
    res.json({ok:true});
  }catch(e){console.error(e);res.status(500).json({error:'Could not save ERP data'})}
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
init().then(()=>app.listen(process.env.PORT||3000,()=>console.log(`ERP server running on port ${process.env.PORT||3000}`))).catch(e=>{console.error(e);process.exit(1)});
