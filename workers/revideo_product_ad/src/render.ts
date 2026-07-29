import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderVideo } from "@revideo/renderer";
import type { UGCEditManifest } from "./manifest";

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

const result = await renderVideo({
  projectFile: resolve("src/project.ts"),
  variables: { manifest },
  settings: {
    outFile: output as `${string}.mp4`,
    outDir: resolve("output"),
    workers: 1,
    projectSettings: { size: { x: 1080, y: 1920 } },
    logProgress: true,
    puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  },
});

console.log(JSON.stringify({ success: true, output: result }));
