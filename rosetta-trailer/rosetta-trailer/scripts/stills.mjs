// Renders review stills: node scripts/stills.mjs 60 172 660 ...
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const frames = process.argv.slice(2).map(Number);
const root = path.resolve(".");
const browserExecutable = process.env.CHROME_PATH || null;
const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });
const composition = await selectComposition({ serveUrl, id: "RosettaTrailer", browserExecutable });
for (const frame of frames) {
  await renderStill({ serveUrl, composition, frame, output: `out/stills/f${String(frame).padStart(4, "0")}.jpg`, imageFormat: "jpeg", jpegQuality: 85, browserExecutable });
  console.log("still", frame);
}
