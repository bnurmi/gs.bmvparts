import fs from 'fs';
import pg from 'pg';
const raw = fs.readFileSync('/home/bnurmi/.hermes/profiles/veronica/secrets/bmvparts-readonly-db.env','utf8');
const env = {};
for (const line of raw.split(/\n/)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  let v = line.slice(i+1).trim();
  if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1,-1).replace(/'\\''/g, "'");
  env[line.slice(0,i)] = v;
}
const pool = new pg.Pool({
  host: env.BMV_DB_HOST,
  port: Number(env.BMV_DB_PORT || 5432),
  database: env.BMV_DB_NAME,
  user: env.BMV_DB_USER,
  password: env.BMV_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 5000,
  max: 1,
});
try {
  const q = async (sql) => (await pool.query(sql)).rows;
  const ident = await q("select current_database() db, current_user usr");
  const tables = await q("select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
  const size = await q("select pg_size_pretty(pg_database_size(current_database())) as size");
  const largest = await q("select relname, n_live_tup::bigint as rows from pg_stat_user_tables order by n_live_tup desc limit 12");
  const schemaTableCounts = await q("select table_schema, count(*)::int as tables from information_schema.tables where table_type='BASE TABLE' group by table_schema order by table_schema");
  console.log(JSON.stringify({db: ident[0].db, user: '[readonly_user]', public_tables: tables[0].n, db_size: size[0].size, schemaTableCounts, largest}, null, 2));
} finally { await pool.end(); }
