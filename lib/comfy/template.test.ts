import {describe,it,expect} from "vitest";
import {graphHash,manifest,resolveTemplate} from "./template";
import base from "@/workflows/comfy/templates/minimax-h3/graph.t2v.api.json";
const owner="8b3a3cd3-7c7b-4ba8-9ed5-c124f3176986";
const input={prompt:"A cinematic landscape",seed:1};
describe("H3 exported graph binding",()=>{
  it("preserves the validated lab graph and locked turbo settings",()=>{
    const r=resolveTemplate(input,owner);
    expect(r.graph).toEqual({...base,"6":{...base["6"],inputs:{...base["6"].inputs,prompt:input.prompt}}});
    expect(r.params.audio_shift_s).toBe(0.4);
    expect(manifest.preserve_raw).toBe(true);
  });
  it.each([[false,"turbo","t2v"],[false,"full","t2v_full"],[true,"turbo","i2v"]])("selects one graph: image=%s quality=%s",(image,quality,variant)=>{
    const r=resolveTemplate({...input,quality,...(image?{first_frame_path:`${owner}/frame.png`}:{})},owner);
    expect(r.variant).toBe(variant);
    expect(r.graph["10"].inputs.steps).toBe(quality==="full"?20:8);
    expect(r.graph["9"].inputs.sampler_name).toBe(quality==="full"?"res_multistep":"euler");
  });
  it("rejects image+full before admission",()=>expect(()=>resolveTemplate({...input,quality:"full",first_frame_path:`${owner}/frame.png`},owner)).toThrow("not supported"));
  it.each([{},null,[],{...input,steps:99},{...input,unknown:true},{...input,prompt:"ab"},{...input,prompt:"x".repeat(2001)},
    {...input,seconds:0},{...input,seconds:11},{...input,seconds:2.5},{...input,seed:-1},{...input,seed:Infinity},
    {...input,seed:1.5},{...input,aspect:"4:3"},{...input,quality:"v1"},{...input,audio_shift_s:-0.1},
    {...input,audio_shift_s:0.7},{...input,audio_shift_s:0.123},{...input,first_frame_path:"other/frame.png"},
    {...input,first_frame_path:`${owner}/../frame.png`},{...input,first_frame_path:"https://example.com/frame.png"},
    {...input,keep_raw:false},{...input,text_encoder:"arbitrary"}])("rejects unsafe parameters %#",bad=>expect(()=>resolveTemplate(bad,owner)).toThrow());
  it("keeps text punctuation and computes official frame counts",()=>{
    expect(resolveTemplate({...input,prompt:"A/B scene \\ cinematic",seconds:5},owner).graph["6"].inputs.length).toBe(124);
    expect(resolveTemplate({...input,seconds:7},owner).graph["6"].inputs.length).toBe(175);
  });
  it("hashes independent of object key ordering",()=>{
    const r=resolveTemplate(input,owner);expect(graphHash(Object.fromEntries(Object.entries(r.graph).reverse()))).toBe(r.hash);
  });
});
