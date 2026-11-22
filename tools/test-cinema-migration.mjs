// Cinema M1 PostgreSQL acceptance on an isolated in-memory PGlite instance.
// No Supabase network, production writes, GPU or paid API activity.
import { PGlite } from "../tmp/h3-db/node_modules/@electric-sql/pglite/dist/index.js";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const PB = "44444444-4444-4444-8444-444444444444";
const S = "55555555-5555-4555-8555-555555555555";
const SB = "66666666-6666-4666-8666-666666666666";
const SH = "77777777-7777-4777-8777-777777777777";
const SH2 = "88888888-8888-4888-8888-888888888888";
const SHB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RUN = "99999999-9999-4999-8999-999999999999";
const RUN2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const takeSql = "insert into cinema_takes(user_id,project_id,shot_id,run_id) values($1,$2,$3,$4)";
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $auth$
      select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
    $auth$;
    grant usage on schema auth,public to authenticated;
    grant execute on function auth.uid() to authenticated;
    -- Minimal shape of the H3 table: the primary key and the owner, plus the column the Studio tombstone rewrites.
    create table public.comfy_runs(id uuid primary key,user_id uuid not null references auth.users(id),params_effective jsonb not null default '{}'::jsonb);
  `);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261122_cinema_m1.sql",import.meta.url),"utf8"));
  await db.query("insert into auth.users(id) values ($1),($2)",[A,B]);
  await db.query("insert into cinema_projects(id,user_id,title) values($1,$2,'Luz'),($3,$4,'Other')",[P,A,PB,B]);
  await db.query("insert into cinema_scenes(id,user_id,project_id,position,title) values ($1,$2,$3,0,'First scene'),($4,$5,$6,0,'Other scene')",[S,A,P,SB,B,PB]);
  await db.query("insert into cinema_shots(id,user_id,project_id,scene_id,position,action) values($1,$2,$3,$4,0,'First plan'),($5,$2,$3,$4,1,'Second plan')",[SH,A,P,S,SH2]);
  await db.query("insert into cinema_shots(id,user_id,project_id,scene_id,position,action) values($1,$2,$3,$4,0,'Other plan')",[SHB,B,PB,SB]);
  await db.query("insert into comfy_runs(id,user_id) values($1,$2),($3,$2),($4,$5)",[RUN,A,RUN2,RUN_B,B]);
  await db.query("insert into cinema_takes(id,user_id,project_id,shot_id,run_id) values($1,$2,$3,$4,$5)",[T,A,P,SH,RUN]);
  await db.query("update cinema_shots set selected_take_id=$1 where id=$2",[T,SH]);
  assert.equal((await db.query("select selected_take_id from cinema_shots where id=$1",[SH])).rows[0].selected_take_id,T);
  // The selected take must refer to its own shot; a different plan cannot select it.
  await assert.rejects(db.query("update cinema_shots set selected_take_id=$1 where id=$2",[T,SH2]),/foreign key/i);
  // Cross-user scene, cross-project ownership and duplicate position must be rejected.
  await assert.rejects(db.query("insert into cinema_shots(user_id,project_id,scene_id,position) values($1,$2,$3,2)",[A,P,SB]),/foreign key/i);
  await assert.rejects(db.query("insert into cinema_scenes(user_id,project_id,position) values($1,$2,0)",[A,P]),/unique/i);
  const saved=await db.query("update cinema_shots set version=version+1 where id=$1 and version=0 returning version",[SH]);
  assert.equal(saved.rows[0].version,1);
  assert.equal((await db.query("update cinema_shots set version=version+1 where id=$1 and version=0 returning id",[SH])).rows.length,0);

  // Ownership of take, shot AND run is enforced by the database, also for the service role (the role the API uses).
  await db.exec("set role service_role");
  await assert.rejects(db.query(takeSql,[A,P,SH2,RUN_B]),/foreign key/i);   // A's plan, B's run
  await assert.rejects(db.query(takeSql,[B,PB,SHB,RUN]),/foreign key/i);    // B's plan, A's run
  await assert.rejects(db.query(takeSql,[B,PB,SH2,RUN_B]),/foreign key/i);  // B writing into A's plan
  await assert.rejects(db.query(takeSql,[B,P,SH2,RUN_B]),/foreign key/i);   // B claiming A's project
  assert.equal((await db.query(takeSql+" returning id",[A,P,SH2,RUN2])).rows.length,1); // own run on own plan: accepted
  assert.equal((await db.query(takeSql+" returning id",[B,PB,SHB,RUN_B])).rows.length,1);
  await db.exec("reset role");
  assert.equal((await db.query("select count(*)::int as n from cinema_takes")).rows[0].n,3);
  // A run cannot change owner while a take points to it.
  await assert.rejects(db.query("update comfy_runs set user_id=$1 where id=$2",[B,RUN]),/foreign key/i);

  // Studio deletion keeps a tombstone row (params replaced): the take stays and reads as unavailable.
  await db.query("update comfy_runs set params_effective='{\"deleted_at\":\"2026-11-22T00:00:00Z\"}'::jsonb where id=$1",[RUN]);
  const kept=await db.query("select t.id, r.params_effective->>'deleted_at' as deleted_at from cinema_takes t join comfy_runs r on r.id=t.run_id and r.user_id=t.user_id where t.id=$1",[T]);
  assert.equal(kept.rows.length,1); assert.ok(kept.rows[0].deleted_at);
  // A run referenced by a take is never hard-deleted.
  await assert.rejects(db.query("delete from comfy_runs where id=$1",[RUN]),/foreign key/i);

  // New Data API tables are not exposed by default, even when an owner policy exists.
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select * from cinema_projects"),/permission denied/i);
  await db.exec("reset role");
  // In an isolated test only, grant SELECT to validate the owner RLS predicate.
  await db.exec("grant select on cinema_projects to authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
  await db.exec("set role authenticated");
  const seen=await db.query("select id from cinema_projects");
  assert.deepEqual(seen.rows.map(row=>row.id),[P]);
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[B]);
  await db.exec("set role authenticated");
  const other=await db.query("select id from cinema_projects");
  assert.deepEqual(other.rows.map(row=>row.id),[PB]);
  await db.exec("reset role");

  // Deleting a project removes its scenes, plans and takes and keeps every run (A's two runs and B's run).
  await db.query("delete from cinema_projects where id=$1",[P]);
  for (const table of ["cinema_scenes","cinema_shots","cinema_takes"])
    assert.equal((await db.query(`select count(*)::int as n from ${table} where project_id=$1`,[P])).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int as n from comfy_runs")).rows[0].n,3);
  assert.equal((await db.query("select count(*)::int as n from cinema_takes where project_id=$1",[PB])).rows[0].n,1);
  console.log("PASS: Cinema migration created in PGlite; composite ownership FKs (project, plan and run owner, also as service role), per-shot take FK, tombstoned run keeps its take, runs survive project deletion, ordering uniqueness, CAS, grants and owner RLS.");
} finally {
  await db.close();
}
