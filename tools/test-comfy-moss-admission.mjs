// Free local PostgreSQL integration test for the MOSS runtime migration. No remote DB or Modal access.
// npm install --prefix tmp/h3-db @electric-sql/pglite@0.5.15 --no-save
import {PGlite} from "../tmp/h3-db/node_modules/@electric-sql/pglite/dist/index.js";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create table profiles(id uuid primary key,plan text);
create table jobs(id uuid primary key default gen_random_uuid(),user_id uuid,prompt text,status text,plan text,current_stage text,engine_used text,target_duration_seconds integer default 5,metadata jsonb,created_at timestamptz default now(),error_message text);
create table engines(id text primary key,name text,type text constraint engines_type_check check(type in ('api','modal_local')),status text,max_duration integer not null,gpu text,priority integer);
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text); alter table storage.objects enable row level security;
grant usage on schema public,storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;`);
for (const m of ["20261108_comfy_admin_h3.sql","20261109_comfy_moss_image.sql"])
  await db.exec(readFileSync(new URL(`../supabase/migrations/${m}`,import.meta.url),"utf8"));

const owner="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
await db.query("insert into auth.users values($1),($2)",[owner,other]);
await db.query("insert into profiles values($1,'premium')",[owner]);
const graph={"1":{class_type:"Test",inputs:{}}};
const moss=(key,user=owner,template="moss-image@1")=>db.query("select admit_comfy_runtime_run('moss-image@1',$1,$2,$3,'A red bicycle',$4,$5,$6) id",[template,user,key,{aspect:"1:1"},graph,"e".repeat(64)]).then(r=>r.rows[0].id);
const h3=(key)=>db.query("select admit_comfy_admin_run($1,$2,'A cinematic scene',$3,$4,$5,null) id",[owner,key,{seconds:5},graph,"f".repeat(64)]).then(r=>r.rows[0].id);
const finishOk=id=>db.query("select finish_comfy_admin_run($1,true,null,12) ok",[id]).then(r=>r.rows[0].ok);

// Bucket and registry
assert.deepEqual((await db.query("select public,allowed_mime_types from storage.buckets where id='comfy-outputs'")).rows[0],{public:false,allowed_mime_types:["video/mp4","image/png"]});
assert.equal((await db.query("select status from engines where id='comfy:moss-image'")).rows[0].status,"coming_soon");
await assert.rejects(db.query("insert into comfy_runtime_gates(runtime,reserve_usd,expected_outputs) values('h3-video@1',1,2)"),/check/);

// Closed by default, then only for the allowed user with confirmed licence.
await assert.rejects(moss("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),/RUNTIME_NOT_AUTHORIZED/);
await db.query("update comfy_runtime_gates set enabled=true,allowed_user_id=$1,expires_at=now()+interval '1 hour',remaining_runs=2,budget_usd=0.40 where runtime='moss-image@1'",[owner]);
await assert.rejects(moss("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),/RUNTIME_NOT_AUTHORIZED/); // licence not confirmed
await db.query("update comfy_runtime_gates set licence_confirmed_at=now() where runtime='moss-image@1'");
await assert.rejects(moss("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",other),/RUNTIME_NOT_AUTHORIZED/);
await assert.rejects(moss("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner,"minimax-h3@1"),/TEMPLATE_RUNTIME_MISMATCH/);
// The H3 pilot gate is untouched by the MOSS gate.
await assert.rejects(h3("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),/H3_NOT_AUTHORIZED/);

const id=await moss("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
assert.equal(await moss("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),id, "idempotent");
await assert.rejects(moss("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),/ACTIVE_JOB/);
const row=(await db.query("select runtime,template_version,reserved_cost_usd,reference_path from comfy_runs where id=$1",[id])).rows[0];
assert.deepEqual(row,{runtime:"moss-image@1",template_version:"moss-image@1",reserved_cost_usd:"0.20",reference_path:null});
const gate=(await db.query("select remaining_runs,committed_usd from comfy_runtime_gates where runtime='moss-image@1'")).rows[0];
assert.deepEqual(gate,{remaining_runs:1,committed_usd:"0.20"});
const job=(await db.query("select engine_used,metadata->>'output_kind' kind from jobs")).rows[0];
assert.deepEqual(job,{engine_used:"comfy:moss-image",kind:"image"});

// Claim/finish: one PNG output is complete for MOSS.
assert.equal((await db.query("select claim_comfy_admin_run($1) ok",[id])).rows[0].ok,true);
assert.equal((await db.query("select claim_comfy_admin_run($1) ok",[id])).rows[0].ok,false);
await assert.rejects(finishOk(id),/MISSING_OUTPUTS/);
await db.query("insert into comfy_assets(run_id,owner_id,role,storage_key,mime) values($1,$2,'raw','k1','image/png')",[id,owner]);
assert.equal(await finishOk(id),true);
assert.equal((await db.query("select status from jobs")).rows[0].status,"done");

// Budget exhausted after the second run's reserve.
const id2=await moss("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
await assert.rejects(moss("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),/RUNTIME_NOT_AUTHORIZED/); // no run left: the gate refuses before any job check
// Closing the gate fences a queued run at claim time.
await db.query("update comfy_runtime_gates set enabled=false where runtime='moss-image@1'");
assert.equal((await db.query("select claim_comfy_admin_run($1) ok",[id2])).rows[0].ok,false);
assert.deepEqual((await db.query("select status,error_code from comfy_runs where id=$1",[id2])).rows[0],{status:"failed",error_code:"AUTHORIZATION_EXPIRED"});
assert.equal((await db.query("select error_message from jobs where metadata->>'comfy_run_id'=$1",[id2])).rows[0].error_message,"Authorization expired");

// H3 behaviour after the replaced functions: still two outputs required, H3 texts unchanged.
await db.query("update comfy_admin_gate set enabled=true,rights_confirmed_at=now(),allowed_user_id=$1,expires_at=now()+interval '1 hour',remaining_runs=1,budget_usd=0.75",[owner]);
const h=await h3("ffffffff-ffff-4fff-8fff-ffffffffffff");
assert.equal((await db.query("select claim_comfy_admin_run($1) ok",[h])).rows[0].ok,true);
await db.query("insert into comfy_assets(run_id,owner_id,role,storage_key) values($1,$2,'raw','h-raw')",[h,owner]);
await assert.rejects(finishOk(h),/MISSING_OUTPUTS/);
await db.query("insert into comfy_assets(run_id,owner_id,role,storage_key) values($1,$2,'final','h-final')",[h,owner]);
assert.equal(await finishOk(h),true);

// Grants: browsers cannot read gates nor call the admission function.
await db.exec("set role authenticated;");
await assert.rejects(db.query("select * from comfy_runtime_gates"),/permission denied/);
await assert.rejects(db.query("select admit_comfy_runtime_run('moss-image@1','moss-image@1',$1,$2,'x','{}','{}','x')",[owner,"99999999-9999-4999-8999-999999999999"]),/permission denied/);
await db.exec("reset role");
await db.close();
console.log("PASS: MOSS runtime gate closed by default, licence gate, owner-only, template/runtime match, idempotency, active-job lock, 0.20 reserve, one-output finish, claim fencing, H3 behaviour preserved, service-only grants.");
