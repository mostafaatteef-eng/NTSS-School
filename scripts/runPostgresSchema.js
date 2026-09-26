import fs from 'node:fs'; import pg from 'pg';
const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined});
try{const sql=fs.readFileSync('database/schema.sql','utf8');await pool.query(sql);const r=await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");console.log('PostgreSQL schema ready:',r.rows.map(x=>x.tablename).join(', '));}
finally{await pool.end();}
