import {beforeEach,describe,it,expect,vi} from "vitest";
import {GET,POST} from "./route";
import {requireAdmin} from "@/app/api/admin/middleware";
import {createServiceClient} from "@/lib/supabase/service";
import {dispatchRun,pilotState} from "@/lib/comfy/admin";
vi.mock("@/app/api/admin/middleware",()=>({requireAdmin:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({createServiceClient:vi.fn()}));
vi.mock("@/lib/comfy/admin",()=>({dispatchRun:vi.fn(),pilotState:vi.fn(),privateHeaders:{"Cache-Control":"private, no-store"}}));
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
  it("serves readiness only through the admin guard",async()=>{vi.mocked(pilotState).mockResolvedValue({ready:false,reason:"pending",manifest:(await import("@/lib/comfy/template")).manifest});expect((await GET()).status).toBe(200);expect(pilotState).toHaveBeenCalledWith("admin-1");});
});
