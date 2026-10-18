# ROSETTA — cinematic trailer

A 60-second, 1920 × 1080, 30 fps movie-style trailer for Rosetta, built entirely from code: React + SVG + Canvas motion graphics rendered with [Remotion](https://www.remotion.dev), and a soundtrack synthesised from scratch in Python. No stock footage, no AI-generated images, no samples.

**Output:** `out/rosetta_cinematic_trailer.mp4` (H.264, yuv420p, AAC 256 kbps)
**Spec:** [`../videobrief2.md`](../videobrief2.md)

## The film

| Time | Scene | What happens |
| --- | --- | --- |
| 0:00–0:08 | The Signal | A cursor in the dark types `git push origin main`; a pulse runs through a network that breaks into ENGINEERING, MANAGEMENT and BUSINESS. *One code change. Three different questions.* |
| 0:08–0:18 | The Breakdown | Three questions hit one commit; lines tangle, messages duplicate, the frame glitches. Freeze, 0.4 s of silence. *The problem isn't code. It's the gap.* |
| 0:18–0:28 | The Reveal | One violet point becomes a network, the broken lines converge, and **ROSETTA** lands on the downbeat. The letterbox opens. |
| 0:28–0:40 | One change, six perspectives | A walkthrough of the website: the Explain box, the commit's real diff, the processing core, then the same change written for Engineer, Senior developer, Intern, Manager, Client and CMO. |
| 0:40–0:50 | Beyond summaries | Rosetta's "How it works" panel morphs BEFORE into AFTER and traces a walkthrough path. Then Ask Why: the manager's question goes to the engineer and the answer comes back in manager words. |
| 0:50–0:56 | The Impact | *Engineers build. Teams understand. Businesses see value.* On the beat, over glimpses of real screens. |
| 0:56–1:00 | Title | The network collapses into the wordmark. *Code has value. Make it understood.* Fade to black at 60.0 s. |

All product content is Rosetta's own: the sample "Spread traffic across three servers" commit, its real diff lines, its real per-reader summaries and before/after flowchart, the real six reading levels, and the dark-theme UI tokens and fonts (Bricolage Grotesque, Geist, Geist Mono).

## Preview and re-render

```bash
npm install             # Remotion downloads its own headless Chrome on first run
npm run studio          # live preview in the browser, scrub the timeline
npm run audio           # regenerate public/audio/soundtrack.wav (Python 3 + NumPy)
npm run render          # → out/rosetta_cinematic_trailer.mp4 (one pass, remotion CLI)
node scripts/stills.mjs 660 1710      # review stills → out/stills/
node scripts/render.mjs out/part.mp4 600-900   # render a frame range
```

Grain tiles are generated once with `npm run grain` (Python + Pillow); they're already in `public/grain/`.

## Changing timing

Every cue lives in **`src/timeline.json`**, in frames at 30 fps. Both the picture (`src/scenes/*`) and the soundtrack (`scripts/make_audio.py`) read it, so moving a cue moves its sound with it. After editing, run `npm run audio`, then `npm run render`.

## How it's built

```
src/
  timeline.json      every cue, shared by picture and sound
  theme.ts           palette, fonts, the six readers' text
  anim.ts            easing curves, impact envelopes, seeded camera shake
  fonts.ts           local fonts, render waits until loaded
  fx/                grain, vignette, letterbox, flash, camera rig, light beams,
                     hero type (bloom, light sweep, chromatic split), masked
                     reveals, particles (canvas), glitch slices
  ui/                Rosetta UI recreations: app window, Explain box, commit
                     card, reader cards, before/after flowchart, message bubbles
  scenes/            S1Signal … S7Final, one file per scene
  Trailer.tsx        the seven scenes, global grain/vignette/letterbox, audio
scripts/
  make_audio.py      the soundtrack (drones, hits, braaams, risers, whooshes,
                     glitches, key taps, a 120 bpm score in D minor → D major)
  check_audio.py     QA: duration, peak, clipping, silence window, hit timing
  render.mjs / stills.mjs / sheet.py   rendering and review
```

All randomness is seeded (`random()` from Remotion, a fixed NumPy seed), and nothing loads from the network, so every render is identical.

## Sound

Original and procedural: every sound is synthesised from oscillators, filtered noise and envelopes, mixed through one convolution reverb, soft-limited to a −1 dBFS ceiling (no clipping). Big hits are timed to their frame; the 0:16 freeze is true silence. There's no voiceover: no legitimately usable voice assets were available, so the typography and sound carry the film.
