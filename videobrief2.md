# VIDEOBRIEF 2 — ROSETTA: *THE LANGUAGE BETWEEN CODE AND BUSINESS*

The single source of truth for the Rosetta cinematic trailer. Everything is built in `rosetta-trailer/`.

| Spec | Value |
|---|---|
| Genre | Cinematic technological thriller / premium product reveal. **Not** a corporate explainer |
| Duration | Exactly 60.0 s (1800 frames) |
| Aspect / resolution | 16:9, 1920 × 1080 |
| Frame rate | 30 fps |
| Delivery | `rosetta-trailer/out/rosetta_cinematic_trailer.mp4`, H.264 yuv420p, AAC stereo |
| Engine | Remotion 4 + React + SVG + Canvas 2D; soundtrack synthesised procedurally (Python + NumPy) |
| Source footage | None. No stock, no AI-generated images or video, no photography, no human figures. Everything is typography, geometry, vector UI and code |

Emotional arc: **SILENCE → TENSION → CHAOS → REVEAL → INTELLIGENCE → CLIMAX → RESOLUTION.**
The first 15–20 s are suspense and curiosity; a massive transition reveals Rosetta; the second half grows elegant, powerful and hopeful. Every second deliberately directed.

**Director's addendum:** the trailer should feel like a cinematic **walkthrough of the Rosetta website**: the product scenes show recreations of Rosetta's real screens (the Explain box and its loading story, the change card with its confidence badge, the six reading levels, the before/after flowchart, Ask Why, the question thread), floating in a dark 3D space with film camera moves, light and sound. Not a screen recording: the real UI, directed like a film.

---

## 1. Visual language

### Palette
| Token | Hex | Use |
|---|---|---|
| void | `#05060B` | Background, all blackouts |
| navy | `#0B1020` | Deep fields, panel shadows |
| violet | `#8B5CF6` | Primary light: the Rosetta signal, reveal, connections |
| cyan | `#22D3EE` | Secondary light: data, processing, answers |
| text | `#F8FAFC` | Hero typography |
| muted | `#94A3B8` | Secondary labels |
| crimson | `#EF4444` | Conflict only (scene 2) — restrained |
| Rosetta UI | abyss `#0A1931`, surface `#102642` / `#142F4F`, steel `#4A7FA7`, mist `#B3CFE5`, paper `#F6FAFD`, risk green `#6FC2A0`, amber `#E6B85C` | The recreated website screens use Rosetta's real dark-theme tokens, so they look like the product |

### Typography
Rosetta's own typefaces (all OFL, vendored locally, no network fonts):
- **Bricolage Grotesque** — cinematic display (oversized headlines, the ROSETTA wordmark)
- **Geist** — thin secondary labels and UI text
- **Geist Mono** — terminal, code, diff lines, data labels

Oversized headlines, clean tracking, masked reveals (never plain fades on hero type), thin secondary labels, selective monospace.

### Effects (used selectively — minimalism makes impacts stronger)
Procedural particles · volumetric-style light beams · film grain · bloom/glow · controlled chromatic aberration (impacts only) · camera push-ins/pull-outs · depth parallax · impact camera shake · directional motion blur on fast moves · light sweeps across type · dynamic masks · procedural glitch (scene 2 only) · vignette.

---

## 2. Timeline (frames @ 30 fps)

All timings live in `rosetta-trailer/src/timeline.json`, read by both the video and the soundtrack generator, so picture and sound stay locked.

### SCENE 1 — THE SIGNAL · 0:00–0:08 (f 0–240) · mystery, tension
- Black. Sub-bass drone slowly emerges, distant ticking, faint electrical pulse.
- ~0:02 a blinking terminal cursor; `git push origin main` types (key taps), executes.
- A luminous pulse travels through a branching network of geometric nodes; the network splits into three disconnected paths labelled `ENGINEERING` · `MANAGEMENT` · `BUSINESS`.
- **ONE CODE CHANGE.** then **THREE DIFFERENT QUESTIONS.**
- Low-frequency cinematic hit exactly as the paths separate. Camera: slow push-in, then a sudden impact zoom.

### SCENE 2 — THE COMMUNICATION BREAKDOWN · 0:08–0:18 (f 240–540) · pressure, chaos
- One commit in the centre. Three question panels, each on a sharp percussion hit:
  MANAGER "Will this delay our launch?" · CMO "What's the customer impact?" · CLIENT "What did we actually build?"
- Connecting lines multiply, tangle; messages duplicate; flashes `MISUNDERSTOOD` · `REPEATED` · `DISCONNECTED`.
- Aggressive layered riser → 0:16 everything freezes, **all sound cut ~0.4 s** → **THE PROBLEM ISN'T CODE.** → pause → **IT'S THE GAP.** with a deep bass impact, then silence.

### SCENE 3 — THE ROSETTA REVEAL · 0:18–0:28 (f 540–840) · awe, discovery — the most cinematic moment
- Darkness. A single violet point expands into a geometric communication network; the disconnected lines from scene 2 reverse and converge; a giant energy pulse.
- On the musical downbeat (0:22): **ROSETTA** — huge type, scale animation, glowing edges, light sweep, particle displacement, slow camera. Then `THE COMMUNICATION LAYER` / `BETWEEN CODE AND BUSINESS`. Held to feel monumental; nothing else crowds it.
- Braaam, sub impact, reverse swell, metallic resonance, then the hybrid electronic-orchestral score begins.

### SCENE 4 — ONE CHANGE. SIX PERSPECTIVES. · 0:28–0:40 (f 840–1200) · intelligence, precision
- A GitHub-style commit card: `Commit detected` with real diff lines. A neon connection flows into the Rosetta core: `ANALYZING DIFF` · `UNDERSTANDING CONTEXT` · `TRANSLATING IMPACT` (the website's real loading story runs alongside).
- The core expands into six role cards with the same change written for each reader.
- **ONE CHANGE.** · **SIX PERSPECTIVES.** · **ZERO REPETITION.**
- Processing clicks, harmonic pulses, mechanical transitions, notification tones.

### SCENE 5 — BEYOND SUMMARIES · 0:40–0:50 (f 1200–1500) · sophistication
- Rosetta's "How it works" panel: **BEFORE** flow vs **AFTER** flow; changed nodes and connections highlight, a walkthrough path lights up. **NOT JUST SUMMARIES.**
- A manager's question `Will this delay our launch?` travels to the engineer along a glowing link (Rosetta routes questions the code can't answer to a human); the engineer's reply travels back and morphs into a manager-friendly answer. **TWO-WAY UNDERSTANDING.**
- Crisp digital moves, elegant whooshes, rising tonal pulse, confirmation chime. Never implies Rosetta predicts launches by itself.

### SCENE 6 — THE IMPACT · 0:50–0:56 (f 1500–1680) · acceleration, confidence
- Montage on the beat: **ENGINEERS BUILD.** · **TEAMS UNDERSTAND.** · **BUSINESSES SEE VALUE.** — each on a strong beat, with glimpses of Rosetta screens for continuity.

### SCENE 7 — FINAL TITLE · 0:56–1:00 (f 1680–1800) · resolution
- Camera pulls back from the network; all nodes converge into the **ROSETTA** wordmark. **CODE HAS VALUE.** / **MAKE IT UNDERSTOOD.** A final luminous pulse across the logo; massive, clean final impact; fade to black at exactly 60 s. No outro, no credits.

---

## 3. Sound design (critical)

Original, procedurally synthesised (no samples, licence-clean), 48 kHz stereo, mixed and mastered (no clipping, controlled dynamics, clear final impact).

- **Atmosphere:** evolving sub-bass drones, electrical ambience, distant pulses, dark textures.
- **Transitions:** whooshes, reverse swells, rising sweeps, synthesised impacts, digital glitches, low-frequency drops.
- **Trailer impacts:** braaams, layered percussion, sub drops, metallic resonance, short dramatic silences.
- **Technology:** keyboard typing, terminal execution, data transmission, processing pulses, UI confirmations.
- **Music progression:** 0–8 s mysterious drone · 8–18 s rising tension and percussion · 18–28 s massive reveal and musical shift · 28–40 s driving electronic-orchestral rhythm · 40–50 s futuristic arpeggios · 50–56 s climactic acceleration · 56–60 s heroic resolution.
- Every major visual impact lands on its audio transient. No voiceover (no legitimately available voice assets); typography and sound carry the film.

## 4. Motion standards
Custom easing, springs where appropriate, smooth camera interpolation, staggered timing, motion continuity between scenes, beat-synchronised edits. No linear movement everywhere, no default fades on every object, no spinning logos, no text too fast to read, no particles over important content. Deterministic, render-safe animation only (seeded randomness, no runtime network).

## 5. Content accuracy

Rosetta (from the product): analyses GitHub commits and diffs; explains each change at six reading levels; draws before-and-after flowcharts with step-by-step walkthroughs; checks every explanation against the code; routes questions the code can't answer to the engineer and rewrites the answer for the asker (human in the loop); reuses cached explanations; works from GitHub (paste a link, sync or webhook).

Production decisions made to stay truthful:
- **The six readers are Rosetta's real six:** Engineer, Senior developer, Intern, Manager, Client, CMO. (The draft's "Stakeholder — executive overview" isn't a Rosetta reading level, so the senior developer takes that slot.)
- **The commit shown is one of Rosetta's own sample commits** ("Spread traffic across three servers", the round-robin change), with its real diff lines, its real per-reader summaries and its real before/after flowchart, so the walkthrough is authentic rather than an invented "auth security" change.
- **Ask Why is shown as it works:** the question is routed to the engineer, the engineer answers, Rosetta rewrites the answer for the manager. No claim that Rosetta predicts launch dates.
- No pricing or architecture scenes.

## 6. Deliverables
1. `rosetta-trailer/out/rosetta_cinematic_trailer.mp4`
2. Source: `rosetta-trailer/src/` (one file per scene, shared effects, timeline constants)
3. Original audio: `rosetta-trailer/public/audio/soundtrack.wav` and its generator `scripts/make_audio.py`
4. `rosetta-trailer/README.md`: preview and re-render

## 7. Quality control
Exactly 60 s · all seven scenes · ROSETTA spelled correctly · audio present and in sync · captions readable, nothing overflowing or cut off · no AI imagery · smooth transitions · problem and solution clear · cinematic, not instructional · the MP4 plays start to finish.
