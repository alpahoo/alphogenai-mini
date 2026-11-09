import {beforeEach,describe,it,expect,vi} from "vitest";
import {GET,POST} from "./route";
import {requireAdmin} from "@/app/api/admin/middleware";
import {createServiceClient} from "@/lib/supabase/service";
import {dispatchRun,pilotState,runtimeGateState} from "@/lib/comfy/admin";
vi.mock("@/app/api/admin/middleware",()=>({requireAdmin:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({createServiceClient:vi.fn()}));
vi.mock("@/lib/comfy/admin",()=>({dispatchRun:vi.fn(),pilotState:vi.fn(),runtimeGateState:vi.fn(),privateHeaders:{"Cache-Control":"private, no-store"}}));
const rpc=vi.fn();
const request=(params:unknown={prompt:"A cinematic sunset",seed:1})=>new Request("http://localhost/api/admin/comfy/runs",{method:"POST",body:JSON.stringify({params,idempotency_key:"a3263425-3a14-4170-a22c-8959566db7ac"})});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("COMFY_ADMIN_ENABLED","true");vi.stubEnv("COMFY_DISPATCH_URL","https://test.modal.run");vi.stubEnv("COMFY_DISPATCH_SECRET","test");
  vi.mocked(requireAdmin).mockResolvedValue({user:{id:"admin-1",email:"admin@example.com"}});
  vi.mocked(createServiceClient).mockReturnValue({rpc} as unknown as ReturnType<typeof createServiceClient>);
  rpc.mockResolvedValue({data:"run-1",error:null});vi.mocked(dispatchRun).mockResolvedValue(undefined);});
describe("private admin H3 admission",()=>{
  it("rejects a non-admin before database or dispatch",async()=>{
    vi.mocked(requireAdmin).mockResolvedValue({response:new Response("Forbidden",{status:403}) as never});
    expect((await POST(request())).status).toBe(403);expect(rpc).not.toHaveBeenCalled();expect(dispatchRun).not.toHaveBeenCalled();
  });
  it("is disabled by default",async()=>{vi.stubEnv("COMFY_ADMIN_ENABLED","");expect((await POST(request())).status).toBe(503);expect(rpc).not.toHaveBeenCalled();});
  it("rejects parameter tampering before admission",async()=>{expect((await POST(request({prompt:"A landscape",steps:100}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();});
  it("does not dispatch when the SQL budget/permit refuses",async()=>{rpc.mockResolvedValue({error:{message:"H3_NOT_AUTHORIZED"}});expect((await POST(request())).status).toBe(409);expect(dispatchRun).not.toHaveBeenCalled();});
  it("submits a frozen graph and dispatches only its run id",async()=>{
    const response=await POST(request());expect(response.status).toBe(202);expect(response.headers.get("cache-control")).toContain("no-store");
    expect(rpc).toHaveBeenCalledWith("admit_comfy_admin_run",expect.objectContaining({p_user:"admin-1",p_hash:expect.stringMatching(/^[a-f0-9]{64}$/),p_graph:expect.any(Object)}));
    expect(dispatchRun).toHaveBeenCalledWith("run-1");expect(await response.json()).toEqual({run_id:"run-1",dispatched:true});
  });
  it("preserves the durable run on dispatch failure",async()=>{vi.mocked(dispatchRun).mockRejectedValue(Error("offline"));const response=await POST(request());expect(response.status).toBe(202);expect((await response.json()).dispatched).toBe(false);expect(rpc).toHaveBeenCalledTimes(1);});
  it("serves readiness only through the admin guard",async()=>{vi.mocked(pilotState).mockResolvedValue({ready:false,reason:"pending",manifest:(await import("@/lib/comfy/template")).manifest});expect((await GET(new Request("http://localhost/api/admin/comfy/runs"))).status).toBe(200);expect(pilotState).toHaveBeenCalledWith("admin-1");});
});
const mossRequest=(params:unknown={prompt:"A red bicycle",seed:1},extra:Record<string,unknown>={})=>new Request("http://localhost/api/admin/comfy/runs",{method:"POST",body:JSON.stringify({template:"moss-image",params,idempotency_key:"b3263425-3a14-4170-a22c-8959566db7ac",...extra})});
describe("private admin MOSS admission",()=>{
  beforeEach(()=>vi.stubEnv("COMFY_MOSS_ENABLED","true"));
  it("is disabled unless its own flag is on, even when H3 is enabled",async()=>{vi.stubEnv("COMFY_MOSS_ENABLED","");expect((await POST(mossRequest())).status).toBe(503);expect(rpc).not.toHaveBeenCalled();});
  it("rejects unknown templates and undeclared parameters before admission",async()=>{
    expect((await POST(mossRequest(undefined,{template:"comfy-anything"}))).status).toBe(400);
    expect((await POST(mossRequest({prompt:"A red bicycle",denoise:0.3}))).status).toBe(400);
    expect((await POST(mossRequest({prompt:"A red bicycle",first_frame_path:"admin-1/x.png"}))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("admits through the runtime gate with the frozen graph, never the H3 pilot function",async()=>{
    const res=await POST(mossRequest());expect(res.status).toBe(202);
    expect(rpc).toHaveBeenCalledWith("admit_comfy_runtime_run",expect.objectContaining({p_runtime:"moss-image@1",p_template:"moss-image@1",p_user:"admin-1",p_hash:expect.stringMatching(/^[a-f0-9]{64}$/)}));
    expect(rpc).not.toHaveBeenCalledWith("admit_comfy_admin_run",expect.anything());
    expect(dispatchRun).toHaveBeenCalledWith("run-1");
  });
  it("returns 409 and does not dispatch when the gate refuses",async()=>{rpc.mockResolvedValue({error:{message:"RUNTIME_NOT_AUTHORIZED"}});expect((await POST(mossRequest())).status).toBe(409);expect(dispatchRun).not.toHaveBeenCalled();});
  it("serves MOSS readiness from its own gate",async()=>{
    vi.mocked(runtimeGateState).mockResolvedValue({ready:false,reason:"Licence validation is pending",allowance:null,licence_confirmed:false});
    const res=await GET(new Request("http://localhost/api/admin/comfy/runs?template=moss-image"));
    expect(res.status).toBe(200);expect(runtimeGateState).toHaveBeenCalledWith("admin-1","moss-image@1","COMFY_MOSS_ENABLED");
    expect(pilotState).not.toHaveBeenCalled();
  });
});
