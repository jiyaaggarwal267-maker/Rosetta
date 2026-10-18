// Renders the trailer: node scripts/render.mjs [out.mp4] [from-to]
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";

const [out = "out/rosetta_cinematic_trailer.mp4", range] = process.argv.slice(2);
const root = path.resolve(".");
const browserExecutable = process.env.CHROME_PATH || null;
const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });
const composition = await selectComposition({ serveUrl, id: "RosettaTrailer", browserExecutable });
const t0 = Date.now();
let last = -1;
await renderMedia({
  serveUrl,
  composition,
  codec: "h264",
  crf: 18,
  pixelFormat: "yuv420p",
  audioCodec: "aac",
  audioBitrate: "256k",
  outputLocation: out,
  browserExecutable,
  imageFormat: "jpeg",
  jpegQuality: 92,
  x264Preset: "medium",
  timeoutInMilliseconds: 180000,
  concurrency: process.env.CONCURRENCY ? Number(process.env.CONCURRENCY) : 4,
  frameRange: range ? range.split("-").map(Number) : undefined,
  onProgress: ({ renderedFrames, progress }) => {
    const p = Math.floor(progress * 100);
    if (p !== last && p % 5 === 0) {
      last = p;
      console.log(`${p}%  frames ${renderedFrames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  },
});
console.log("DONE", out, ((Date.now() - t0) / 1000).toFixed(0), "s");
