import {beforeEach,describe,it,expect,vi} from "vitest";
import {GET} from "./route";
import {requireAdmin} from "@/app/api/admin/middleware";
import {createServiceClient} from "@/lib/supabase/service";
vi.mock("@/app/api/admin/middleware",()=>({requireAdmin:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({createServiceClient:vi.fn()}));
const sign=vi.fn(),filters:string[]=[];
let asset:unknown,status:string;
beforeEach(()=>{vi.clearAllMocks();filters.length=0;asset={storage_key:"private/run/final.mp4",run_id:"run",role:"final"};status="done";
  vi.mocked(requireAdmin).mockResolvedValue({user:{id:"owner",email:"admin@example.com"}});
  vi.mocked(createServiceClient).mockReturnValue({from:(table:string)=>{
    const q={select:()=>q,eq:(key:string,value:string)=>{filters.push(`${key}=${value}`);return q;},is:(key:string)=>{filters.push(`${key}=null`);return q;},single:async()=>({data:table==="comfy_assets"?asset:{status}})};return q;
  },storage:{from:()=>({createSignedUrl:sign})}} as unknown as ReturnType<typeof createServiceClient>);
  sign.mockResolvedValue({data:{signedUrl:"https://private.example/signed"},error:null});
});
const get=()=>GET(new Request("http://localhost"),{params:Promise.resolve({id:"asset"})});
describe("H3 private media",()=>{
  it("denies non-admins before signing",async()=>{vi.mocked(requireAdmin).mockResolvedValue({response:new Response("Denied",{status:403}) as never});expect((await get()).status).toBe(403);expect(sign).not.toHaveBeenCalled();});
  it("scopes assets to the caller and excludes withdrawals",async()=>{const res=await get();expect(res.status).toBe(200);expect(filters).toContain("owner_id=owner");expect(filters).toContain("withdrawn_at=null");expect(sign).toHaveBeenCalledWith("private/run/final.mp4",600);expect(res.headers.get("cache-control")).toContain("no-store");});
  it("does not sign a withdrawn/missing asset",async()=>{asset=null;expect((await get()).status).toBe(404);expect(sign).not.toHaveBeenCalled();});
  it.each(["queued","running","failed","cancelled","expired"])("does not sign a %s run",async state=>{status=state;expect((await get()).status).toBe(404);expect(sign).not.toHaveBeenCalled();});
});
