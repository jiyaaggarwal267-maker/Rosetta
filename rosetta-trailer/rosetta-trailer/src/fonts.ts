import { continueRender, delayRender, staticFile } from "remotion";

/** Local, vendored fonts only. Rendering waits until every face has loaded. */
const FACES: [family: string, file: string, weight: string][] = [
  ["Bricolage", "bricolage-grotesque-latin-300-normal.woff2", "300"],
  ["Bricolage", "bricolage-grotesque-latin-500-normal.woff2", "500"],
  ["Bricolage", "bricolage-grotesque-latin-700-normal.woff2", "700"],
  ["Bricolage", "bricolage-grotesque-latin-800-normal.woff2", "800"],
  ["Geist", "geist-sans-latin-300-normal.woff2", "300"],
  ["Geist", "geist-sans-latin-400-normal.woff2", "400"],
  ["Geist", "geist-sans-latin-500-normal.woff2", "500"],
  ["Geist", "geist-sans-latin-600-normal.woff2", "600"],
  ["GeistMono", "geist-mono-latin-300-normal.woff2", "300"],
  ["GeistMono", "geist-mono-latin-400-normal.woff2", "400"],
  ["GeistMono", "geist-mono-latin-500-normal.woff2", "500"],
  ["GeistMono", "geist-mono-latin-600-normal.woff2", "600"],
];

let started = false;
export function loadFonts() {
  if (started || typeof document === "undefined") return;
  started = true;
  const handle = delayRender("fonts");
  Promise.all(
    FACES.map(async ([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format('woff2')`, { weight });
      await face.load();
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
    }),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error("font load failed", e);
      continueRender(handle);
    });
}
