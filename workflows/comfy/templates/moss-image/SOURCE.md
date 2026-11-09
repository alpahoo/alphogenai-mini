# MOSS-Image text to image: provenance

- Source: official ComfyUI template `templates/image_moss_image_t2i.json`, repository `Comfy-Org/workflow_templates`,
  commit `1ae390968e323dba24a6991d1860ded051f5a79b` (2026-11-03), file SHA-256
  `619bd00f86ad6b060ca7c2e315590d9fcffc37e3fa0d0478fb61695d9b7d90a7`.
- `graph.t2i.api.json` is the core-node path of its "Text to Image (MOSS-Image)" subgraph, written in API format:
  UNETLoader → KSampler (25 steps, CFG 2.5, er_sde, simple, denoise 1) ← CLIPTextEncode ×2, EmptyFlux2LatentImage,
  then VAEDecode → SaveImage. ComfyUI v0.42.0 (the pinned runtime) ships every node used here.
- Deliberate differences from the template, all documented and to be confirmed in the first authorized test:
  1. **No LLM prompt enhancement** (the template's `TextGenerate` branch is on by default). V1 sends the prompt as written.
  2. **Skip-layer guidance off** (template default is also off).
  3. Text encoder `qwen3.5_9b_int8_convrot` instead of the template's `qwen3.5_9b_w4a8_gptq`: same Apache-2.0
     upstream, same int8 loading path already exercised by the H3 runtime. The GPTQ variant stays an option.
  4. VAE `flux2-vae_small` (template default; Apache-2.0, identical to `black-forest-labs/FLUX.2-small-decoder`).
- Excluded: full `flux2-vae`, colour/depth control LoRA, edit LoRA and the community "abliterated" encoder.
  Reasons in `workflows/comfy/runtimes/moss-image@1.json` and `docs/architecture` annex A.
- Text-to-image only. No image input is accepted by this template (the template's `ref_image` only feeds the LLM).
