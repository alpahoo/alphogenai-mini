import {beforeEach,describe,it,expect,vi} from "vitest";
import {GET} from "./route";
import {requireAdmin} from "@/app/api/admin/middleware";
import {createServiceClient} from "@/lib/supabase/service";
vi.mock("@/app/api/admin/middleware",()=>({requireAdmin:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({createServiceClient:vi.fn()}));
const sign=vi.fn(),download=vi.fn(),filters:string[]=[];
let asset:unknown,status:string;
beforeEach(()=>{vi.clearAllMocks();filters.length=0;asset={storage_key:"private/run/final.mp4",run_id:"run",role:"final"};status="done";
  vi.mocked(requireAdmin).mockResolvedValue({user:{id:"owner",email:"admin@example.com"}});
  vi.mocked(createServiceClient).mockReturnValue({from:(table:string)=>{
    const q={select:()=>q,eq:(key:string,value:string)=>{filters.push(`${key}=${value}`);return q;},is:(key:string)=>{filters.push(`${key}=null`);return q;},single:async()=>({data:table==="comfy_assets"?asset:{status}})};return q;
  },storage:{from:()=>({createSignedUrl:sign,download})}} as unknown as ReturnType<typeof createServiceClient>);
  sign.mockResolvedValue({data:{signedUrl:"https://private.example/signed"},error:null});
});
const get=()=>GET(new Request("http://localhost"),{params:Promise.resolve({id:"asset"})});
describe("H3 private media",()=>{
  it("denies non-admins before signing",async()=>{vi.mocked(requireAdmin).mockResolvedValue({response:new Response("Denied",{status:403}) as never});expect((await get()).status).toBe(403);expect(sign).not.toHaveBeenCalled();});
  it("scopes assets to the caller and excludes withdrawals",async()=>{const res=await get();expect(res.status).toBe(200);expect(filters).toContain("owner_id=owner");expect(filters).toContain("withdrawn_at=null");expect(sign).toHaveBeenCalledWith("private/run/final.mp4",600);expect(res.headers.get("cache-control")).toContain("no-store");});
  it("does not sign a withdrawn/missing asset",async()=>{asset=null;expect((await get()).status).toBe(404);expect(sign).not.toHaveBeenCalled();});
  it("signs an attachment with a server-built file name on download",async()=>{const res=await GET(new Request("http://localhost?download=1"),{params:Promise.resolve({id:"asset"})});expect(res.status).toBe(200);expect(sign).toHaveBeenCalledWith("private/run/final.mp4",600,{download:"alphogen-run-corrected.mp4"});});
  it.each(["queued","running","failed","cancelled","expired"])("does not sign a %s run",async state=>{status=state;expect((await get()).status).toBe(404);expect(sign).not.toHaveBeenCalled();});
  it.each([["webp","image/webp"],["jpeg","image/jpeg"]])("converts a PNG original to %s for download without signing a URL",async(format,mime)=>{
    const sharp=(await import("sharp")).default;
    const png=await sharp({create:{width:8,height:8,channels:3,background:"#3355ff"}}).png().toBuffer();
    asset={storage_key:"private/run/raw.png",run_id:"run12345",role:"raw",mime:"image/png"};
    download.mockResolvedValue({data:new Blob([new Uint8Array(png)]),error:null});
    const res=await GET(new Request(`http://localhost?format=${format}`),{params:Promise.resolve({id:"asset"})});
    expect(res.status).toBe(200);expect(res.headers.get("content-type")).toBe(mime);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="alphogen-run12345-original.${format==="jpeg"?"jpg":"webp"}"`);
    expect(res.headers.get("cache-control")).toContain("no-store");expect(sign).not.toHaveBeenCalled();
  });
  it.each([["truncated",(png:Buffer)=>png.subarray(0,Math.floor(png.length/2))],["corrupted",(png:Buffer)=>{const b=Buffer.from(png);b.fill(0xab,40,b.length-12);return b;}],["not an image",()=>Buffer.from("plain text")]])(
    "returns a controlled 422 for a %s original, without details or a partial file",async(_name,damage)=>{
    const sharp=(await import("sharp")).default;
    const png=await sharp({create:{width:64,height:64,channels:3,background:"#3355ff"}}).png({compressionLevel:0}).toBuffer();
    const stored=damage(png);const before=Buffer.from(stored);
    asset={storage_key:"private/run/raw.png",run_id:"run12345",role:"raw",mime:"image/png"};
    download.mockResolvedValue({data:new Blob([new Uint8Array(stored)]),error:null});
    const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
    for(const format of ["jpeg","webp"]){
      const res=await GET(new Request(`http://localhost?format=${format}`),{params:Promise.resolve({id:"asset"})});
      expect(res.status).toBe(422);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(res.headers.get("content-disposition")).toBeNull();
      expect(res.headers.get("cache-control")).toContain("no-store");
      const body=await res.json();
      expect(body).toEqual({error:"Image could not be converted"});
    }
    expect(Buffer.compare(stored,before)).toBe(0);
    expect(sign).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/vips|libspng|png:|Input buffer/i);
    warn.mockRestore();
  });
  it("refuses format conversion of videos and unknown formats",async()=>{
    expect((await GET(new Request("http://localhost?format=webp"),{params:Promise.resolve({id:"asset"})})).status).toBe(400);
    asset={storage_key:"k",run_id:"run",role:"raw",mime:"image/png"};
    expect((await GET(new Request("http://localhost?format=gif"),{params:Promise.resolve({id:"asset"})})).status).toBe(400);
    expect(download).not.toHaveBeenCalled();
  });
  it("names PNG downloads with the right extension",async()=>{asset={storage_key:"k.png",run_id:"run",role:"raw",mime:"image/png"};
    await GET(new Request("http://localhost?download=1"),{params:Promise.resolve({id:"asset"})});
    expect(sign).toHaveBeenCalledWith("k.png",600,{download:"alphogen-run-original.png"});});
});
