import { resolve } from "node:path";
import { renderVideo } from "@revideo/renderer";
import type { UGCEditManifest } from "./manifest";

export async function renderProductAd(
  manifest: UGCEditManifest,
  outputFile: string
) {
  return renderVideo({
    projectFile: resolve("src/project.ts"),
    variables: { manifest },
    settings: {
      outFile: outputFile as `${string}.mp4`,
      outDir: resolve("output"),
      workers: 1,
      projectSettings: { size: { x: 1080, y: 1920 } },
      logProgress: true,
      puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
    },
  });
}
