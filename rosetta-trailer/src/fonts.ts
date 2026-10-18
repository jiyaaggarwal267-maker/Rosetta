import { FONT_CSS } from "./fontcss";

/**
 * Fonts are embedded as data URLs (scripts/embed_fonts.py), so nothing is
 * fetched over the network and no frame ever waits on a download. The CSS is
 * injected once per browser tab, before anything renders.
 */
let injected = false;
export function loadFonts() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.setAttribute("data-rosetta-fonts", "");
  style.textContent = FONT_CSS;
  document.head.appendChild(style);
  // Warm them up straight away (instant: the data is already in memory).
  for (const f of ["800 10px Bricolage", "500 10px Bricolage", "400 10px Geist", "400 10px GeistMono"]) {
    document.fonts.load(f).catch(() => {});
  }
}
