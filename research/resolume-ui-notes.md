# Resolume Arena 7 UI — reference notes (studied 2026-10-08)
Sources: Resolume Arena 7.21.1 screenshots (technomag.fr, dalangshow.com), Resolume manuals (v3/v4/6), community quickstart notes, videomapping.store guide, Bitfocus Companion module docs (column/layer semantics).

## The one-sentence model
A grid of clips: COLUMNS go across (decks of columns), LAYERS go up/down. Each grid cell holds one clip. One clip per layer plays at a time; layers mix together. No timeline — everything is live.

## Layout (top to bottom)
1. **Menu bar**: Arena, Composition, Deck, Group, Layer, Column, Clip, Output, Shortcuts, View.
2. **Column header row**: "Composition" dropdown + ✕ B M S (composition-level), then Column 1..N tabs across. Active/connected column highlighted MINT GREEN. Clicking a column fires one clip per layer (the whole column).
3. **Layer rows** (left gutter + clip cells):
   - Left gutter per layer: layer name tab (selected layer = green highlight), ✕ (clear layer), B (bypass — turns ORANGE when active), S (solo — turns YELLOW when active), M / A / V indicators (audio/video enable), "Add" dropdown (add effect to layer), vertical V (video opacity) slider.
   - Clip cells: thumbnail image + name label below (e.g. "FogAndDust", "NeonRoom2"). PLAYING clip = green highlight/border. Empty cells dark.
   - Grid scrolls horizontally for more columns.
4. **Deck tabs** (below grid): "Footage Shop", "Audio Visual", "Generators", "Wire" — named clip collections; switching decks doesn't interrupt playback. (Deliberately omitted on phone v4 — columns cover the paradigm; decks = future.)
5. **BPM bar**: green square indicator, "BPM 128", − / +, nudge, /2 ×2, TAP, RESYNC, PAUSE, metronome, undo/redo.
6. **Bottom panels** (side by side on desktop):
   - **Composition Monitor** + **Preview Monitor** (output previews).
   - **Composition / Layer panel**: Dashboard (8 ROTARY KNOBS, e.g. RGB/Hue/Distort/Flip/Kaleido/Mirror/Twitch/Trails — any param can be dropped on the dashboard), Composition (Master %, Speed), Audio (Volume, Pan), Video (Opacity), Crossfader, then the EFFECT STACK (Shift RGB, Hue Rotate, Wave Warp…) each row with B (bypass) / P / ✕.
   - **Clip panel**: clip name, Dashboard, Transport (timeline, play/pause/loop), Speed, Duration, Cuepoints, Autopilot, clip file info, Opacity, Width/Height, Blend Mode ("Layer Determined"), Transform (Position X/Y…).
   - **Files / Compositions / Effects / Sources / Record** tabs: media browser.
7. **Status bar**: "Resolume Arena 7.21.1" left, clock right.

## Visual language
- Near-black backgrounds (#141414–#1e1e1e), dark gray panels, light gray text.
- **Mint/pale green (#7fd67f-ish) = active/playing/selected/connected.** This is THE signature color.
- Bypass active = orange/amber. Solo active = yellow. Master below 100% = red M slider.
- Small dense sans-serif type, uppercase section labels, compact rows. Dense, not airy.
- Sliders: thin horizontal bars with − / + steppers and numeric value; vertical V sliders on layers.
- Rotary knobs on the dashboard (8 of them).
- No toasts/modals during performance — state shown via color changes on existing controls.
- Three-tier disclosure: (1) clip grid always visible = the whole show can run here; (2) properties one click away; (3) deep config (MIDI map, prefs, advanced output) behind setup.

## Semantics that matter
- Exclusivity within a layer, sum across layers (same as Ableton session view).
- Clip triggering is BPM-quantized by default (waits for next bar) — Resolume warns about the delay in-context.
- Effects stack on composition / layer / clip levels; each has opacity + bypass.
- Layer groups exist (bypass/solo/clear per group). (Omitted on phone v4.)
- Dashboard = user-assigned macro knobs. Our 8 macros map 1:1.

## Phone divergences (deliberate, documented in report)
- No menu bar; no deck tabs; no Files browser; no layer groups; no separate preview monitor (the visible canvas IS the monitor; output mode = fullscreen).
- Bottom sheet carries grid → BPM bar → tabbed panels (Composition | Layer | Clip | Map). Sheet is the phone compromise; the ORDER (grid first, panels below) is faithful.
- Map tab has no Resolume equivalent — kept in the same visual language.
- Clip cells show source-name labels (no thumbnails — our sources are procedural).
- Long-press replaces right-click for clip assign.

## Addendum — Joshua's OWN Resolume Arena 7.1.0 (2026-10-07, primary reference)
File: research/resolume-arena-7.1.0-reference.webp. This supersedes generic web
research wherever they differ.

- His setup is AUDIO-driven: pink waveform clips ("Beat 002" playing on Layer 1,
  "Bass 001–006" on Layer 2, "Synth 001–006" on Layer 3). Clip cells show
  waveform thumbnails; the PLAYING clip glows teal-green.
- Accent color is TEAL (#2dd4bf-ish): connected column header (Column 2), selected
  layer name tab (Layer 1), playing clip glow, tab underlines, slider fills.
- Column headers: "Column 1".."Column 9" across the top of the grid.
- Layer left gutter: ✕ B S buttons, then M (pink), A (teal), V (green) toggles,
  "Add" button, then the layer name tab (teal when selected).
- Transport bar under grid: BPM 120, −/+, −|/|+, /2 *2, TAP, RESYNC, PAUSE,
  metronome, undo/redo, A/B crossfader, RECORD at right.
- Deck tabs under transport: his are "AV", "empty", "empty".
- Bottom panels: Output Monitor (live visual) + Preview Monitor (checkerboard) at
  left; Composition panel with COLLAPSIBLE sections (▸ Dashboard, ▸ Composition,
  ▸ Audio, ▸ Video, ▸ Transform — Position X/Y with −/+ steppers, Scale 150.42%,
  Rotation 0°, Anchor 0); Clip panel with Transport (waveform timeline, play/pause),
  Speed, Duration 7.500s, Cuepoints, Autopilot, clip file cards (Beat 002.wav pink,
  Beat 002.mov teal), Opacity, Width/Height with −/+, Blend Mode dropdown
  ("Layer Determined"), Transform; right browser: Files/Compositions/Effects/Sources
  tabs, Video|FFGL / Audio|VST toggle, search, effect list (Add Subtract >
  Blue/Green/Red, Auto Mask, Bendoscope, Blow > Bright Lines/Solid, Blur,
  Bright.Contrast, ChromaKey, Circles, Color Pass, Colorize > Blue/Pink/Rainbow
  Palette, Crop, Cube Tiles).
- Sliders: horizontal with TEAL fill bars. Numeric params have −/+ steppers.
- Dropdowns: Blend Mode (Alpha), Behaviour (Cut), Curve (Linear).
- "Drop effect or mask here" zones. Status bar: "Resolume Arena 7.1.0".
