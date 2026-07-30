import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { UGCEditManifest } from "./manifest";
import { renderProductAd } from "./render-product-ad";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const manifestPath = argument("--manifest");
if (!manifestPath) {
  throw new Error("Usage: npm run render -- --manifest ./manifest.json [--output product-ad.mp4]");
}

const output = argument("--output") ?? "product-ad.mp4";
if (!output.endsWith(".mp4")) throw new Error("The output filename must end in .mp4.");
const manifest = JSON.parse(
  await readFile(resolve(manifestPath), "utf8")
) as UGCEditManifest;
if (!Array.isArray(manifest.shots) || manifest.shots.length !== 3) {
  throw new Error("The edit manifest must contain exactly three shots.");
}

const result = await renderProductAd(manifest, output);

console.log(JSON.stringify({ success: true, output: result }));
