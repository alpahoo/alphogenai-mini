import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { GET, POST } from "./route";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const projectId="11111111-1111-4111-8111-111111111111";
const shotId="22222222-2222-4222-8222-222222222222";
const otherShot="33333333-3333-4333-8333-333333333333";
const takeId="44444444-4444-4444-8444-444444444444";
const otherTake="55555555-5555-4555-8555-555555555555";
const runId="66666666-6666-4666-8666-666666666666";
const anotherRun="77777777-7777-4777-8777-777777777777";
const assetId="88888888-8888-4888-8888-888888888888";
type Row=Record<string,unknown>;
let tables: Record<string,Row[]>, writes: string[];
function queryFor(table: string) {
  let cond: [string, unknown][] = [], patch: Row | null = null, inserting: Row | null = null, max=1000;
  const matches=(row:Row)=>cond.every(([k,v])=>k.includes("->>") ? true : row[k]===v);
  const rows=()=>tables[table].filter(matches).slice(0,max);
  const execute=()=>{
    if (inserting) {
      const row={id:takeId,...inserting};
      tables[table].push(row);writes.push("insert:"+table);
      return row;
    }
    if (patch) {
      const target=rows()[0];
      if (target) { Object.assign(target,patch); writes.push("update:"+table); }
      return target ?? null;
    }
    return rows()[0] ?? null;
  };
  const q={
    select:(_?:string)=>q,
    eq:(field:string,value:unknown)=>{cond.push([field,value]);return q;},
    is:(_field:string,_value:unknown)=>q,
    in:(field:string,values:unknown[])=>{ const old=cond.filter(([k])=>k!==field);cond=old;
      // Tests only need exact equality with one value; no wildcard reads.
      if(values.length===1)cond.push([field,values[0]]);return q;},
    order:(_field:string,_opts?:unknown)=>q,
    limit:(n:number)=>{max=n;return q;},
    insert:(r:Row)=>{inserting=r;return q;},
    update:(r:Row)=>{patch=r;return q;},
    maybeSingle:async()=>({data:execute(),error:null}),
    single:async()=>({data:execute(),error:null}),
  };
  return q;
}
function fakeDB(){
  return {
    from:(table:string)=>{if(!(table in tables)) throw Error("Unknown table "+table);return queryFor(table);},
    storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:"https://signed.invalid/short"},error:null})})}
  } as unknown as ReturnType<typeof createServiceClient>;
}
const post=(input:unknown)=>POST(new Request("http://local/api/admin/studio/cinema",{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)
}));
beforeEach(()=>{
 vi.resetAllMocks();writes=[];
 tables={
  cinema_projects:[{id:projectId,user_id:A,title:"Luz",aspect:"9:16"}],
  cinema_scenes:[],cinema_elements:[],
  cinema_shots:[{id:shotId,user_id:A,project_id:projectId,scene_id:"scene",position:1,version:0,action:"Luz",duration:5,first_frame_path:null},
    {id:otherShot,user_id:A,project_id:projectId,scene_id:"scene",position:2,version:0,action:"Luz",duration:5}],
  cinema_takes:[{id:takeId,user_id:A,project_id:projectId,shot_id:shotId,run_id:runId},
    {id:otherTake,user_id:A,project_id:projectId,shot_id:otherShot,run_id:anotherRun}],
  comfy_runs:[{id:runId,user_id:A,status:"done",template_version:"minimax-h3@1"},
    {id:anotherRun,user_id:A,status:"done",template_version:"minimax-h3@1"}],
  comfy_assets:[{id:assetId,owner_id:A,run_id:runId,role:"final",mime:"video/mp4",withdrawn_at:null},
    {id:"asset2",owner_id:A,run_id:anotherRun,role:"final",mime:"video/mp4",withdrawn_at:null}],
 };
 vi.mocked(requireAdmin).mockResolvedValue({user:{id:A,email:"a@example.com"}});
 vi.mocked(createServiceClient).mockReturnValue(fakeDB());
});
describe("Cinema M1 admin access and ownership",()=>{
 it("requires an authenticated administrator before reading any projects",async()=>{
  vi.mocked(requireAdmin).mockResolvedValue({response:new Response("forbidden",{status:403}) as never});
  const res=await GET(new Request("http://local/api/admin/studio/cinema?project="+projectId));
  expect(res.status).toBe(403);
  expect(createServiceClient).not.toHaveBeenCalled();
 });
 it("reads another user's project exactly like a missing one",async()=>{
  vi.mocked(requireAdmin).mockResolvedValue({user:{id:B,email:"b@example.com"}});
  const res=await GET(new Request("http://local/api/admin/studio/cinema?project="+projectId));
  expect(res.status).toBe(404);
 });
 it("refuses an existing run owned by a different user before insertion",async()=>{
  tables.comfy_runs[0].user_id=B;
  const res=await post({action:"take.attach",shot_id:shotId,run_id:runId});
  expect(res.status).toBe(404);
  expect(writes).toEqual([]);
 });
 it("refuses selecting a take of another shot",async()=>{
  const res=await post({action:"take.select",shot_id:shotId,take_id:otherTake,version:0});
  expect(res.status).toBe(404);
  expect(writes).toEqual([]);
 });
 it("refuses stale version before updating selection",async()=>{
  const res=await post({action:"take.select",shot_id:shotId,take_id:takeId,version:8});
  expect(res.status).toBe(409);
  expect(writes).toEqual([]);
 });
 it("allows selection of this shot's completed private take exactly once",async()=>{
  const res=await post({action:"take.select",shot_id:shotId,take_id:takeId,version:0});
  expect(res.status).toBe(200);
  expect(tables.cinema_shots[0].selected_take_id).toBe(takeId);
  expect(tables.cinema_shots[0].version).toBe(1);
  expect(writes).toEqual(["update:cinema_shots"]);
 });
 it("rejects another owner's first-frame path before any write",async()=>{
  const res=await post({action:"shot.update",shot_id:shotId,version:0,first_frame_path:B+"/library/x.png"});
  expect(res.status).toBe(400);expect(writes).toEqual([]);
 });
 it("cannot invoke GPU or budget RPCs through project metadata routes",()=>{
  const code=readFileSync("app/api/admin/studio/cinema/route.ts","utf8");
  expect(code).not.toMatch(/\.rpc\(|dispatchRun\(|admit_comfy_admin_run|COMFY_DISPATCH_SECRET/);
 });
});
