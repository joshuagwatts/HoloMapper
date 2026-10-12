# HoloMapper v1 — verification record

Date: 2026-10-07. Everything below was actually run, not claimed.

## Files
- `holomapper.html` — the VJ engine (self-contained, zero network deps at runtime)
- `remote.html` — phone remote control surface (zero build step, no CDN)
- `bridge.py` — laptop server: HTTP + WebSocket relay, QR pairing page (stdlib only)
- `qrcode.js` — vendored qrcodejs (MIT, davidshimjs) for offline QR rendering
- `checks/` — screenshots referenced below

## 1. JS syntax
- Extracted all `<script>` blocks browser-faithfully (split on `</script>`, take
  after last `<script>`) from both HTML files → `node --check`:
  - engine: 16 blocks — **OK**
  - remote: 2 blocks — **OK**
  - `python3 -m py_compile bridge.py` — **OK**
- Note: a naive regex extractor breaks on the vendored QR lib; use the
  split-based method above.

## 2. Engine renders (headless Chromium 152, SwiftShader WebGL2)
- Headless CLI `--screenshot` is broken in this environment (exit 0, no file),
  and `--dump-dom` returns empty. Workaround: Chrome remote-debugging port +
  raw-socket CDP client (`Page.captureScreenshot`). Also required: bootstrap
  `file://` → `location.replace(http://127.0.0.1:8090/…)` with
  `--allow-file-access-from-files` (Chromium 152 blocks about:blank → 127.0.0.1
  with ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS).
- `checks/shot_engine.png` (1280x800, served by bridge.py): **real visuals** —
  Tunnel + Nebula + Flow Field compositing with feedback trails, full UI
  (top bar, 4 layer cards, Post FX / Master / Dashboard / MIDI / Plugin
  sections, status bar with BPM, MIDI status, audio meters, FPS).
- No GL error banner; all 9 shaders (3 sources + plugin + combine + feedback +
  kaleido + glitch + grade) compiled and linked under SwiftShader.

## 3. Handler audit
- Grep audit: every static `id="…"` referenced by JS exists (engine 64 ids /
  55 refs, remote 13/13 — **zero dangling**); all 23 engine buttons + 5 remote
  buttons have wired handlers (**none unwired**).
- Dynamic controls (layer-card sliders, macro rows, MIDI list) are built by
  JS builder functions with inline `addEventListener` — exercised in screenshots.

## 4. Bridge relay (live, `python3 -u bridge.py --no-browser --port 8090`)
- Banner prints pairing URL, remote URL, engine URL, and all LAN interfaces.
- `/api/info` → correct JSON; `/setup` → 200 with QR; `/` index → 200.
- Raw-socket WS test (two clients): engine hello → `welcome` (+remoteUrl);
  remote hello → `peer online=true`; remote→engine relay of
  macro/param/tap/preset/blackout; engine→remote `state` relay;
  engine disconnect → `peer online=false`. **ALL PASS.**
- Bug found & fixed during this: `nonlocal buf` missing in the WS frame
  reader (`UnboundLocalError`); also `SO_REUSEADDR` typo.

## 5. Remote UI — 4 viewports (CDP screenshots, `?mock=1`)
- `checks/shot_r375.png` (375x667 iPhone SE-ish): single column, gig bar →
  macros → faders → trails. **No overlap, no clipping, no h-scroll.**
- `checks/shot_r414.png` (414x896 large phone): full page incl. preset
  buttons + hint line. **Clean.**
- `checks/shot_r768.png` (768x1024 iPad portrait): two-column grid
  (gig bar + macros span, layers/fx side-by-side). **Clean.**
- `checks/shot_r1024.png` (1024x1366 iPad landscape): same 2-col, wider.
  **Clean.**
- Touch requirements implemented: `touch-action:none` on knobs/faders,
  44px+ targets (64px gig buttons, 48px faders, 74px knobs),
  `user-scalable=no`, `overscroll-behavior:none`, no hover-dependent UI,
  vertical-drag knobs like vj-remote, double-tap resets to 50%.

## 6. Remote → engine end-to-end (real engine in headless Chrome + bridge)
- `setPrmOn(true)` in engine → status "phone link live".
- Python WS client as phone: received `peer` + `state` (macros/blackout).
- Sent `{type:"macro",i:3,value:0.77}` → engine `S.macros[3].val` == 0.77 **PASS**
- Sent `{type:"param",id:"L0.op",value:0.33}` → engine `S.params['L0.op']` == 0.33 **PASS**
- Sent `{type:"blackout",on:true}` → engine `S.blackout` == true **PASS**
- `{type:"tap"}` forwarded **PASS**

## 7. Knob-drag self-test (synthetic PointerEvents, `remote.html?selftest=1`)
- Dispatched pointerdown/move/up on macro knob 0 → logged
  `SEND {"type":"macro","i":0,"value":1}` (80px drag = +0.5, clamped) —
  the exact message the engine applies. Fader synthetic input →
  `SEND {"type":"param","id":"L1.op","value":0.25}`. **PASS.**

## 8. Pairing UX
- `checks/shot_pair.png`: engine "Pair phone" modal renders a real QR
  encoding the bridge remote URL + instructions + all interfaces. **Verified
  rendering** (2 QR children in DOM, correct URL text).
- `checks/shot_setup.png`: bridge `/setup` page — QR + URL + steps. **Verified.**
- Reconnect: both sides re-announce `{"role":…}` on every (re)connect with
  backoff (remote: 1/2/5/10s; engine: 1.5/3/8s); remote shows
  red/amber/green dot + "looking for HoloMapper…" + manual URL fallback
  (persisted to localStorage).

## Known limits / not verified here
- Web MIDI + microphone need real hardware + user gesture (headless denies
  both; the UI reports this plainly instead of faking it).
- SwiftShader renders at ~1fps; real-GPU performance not measured here.
- QR scannability eyeballed from renders, not scanned with a phone camera.
- `.exe` packaging, node-graph editor, video/NDI inputs: deliberately v2.

## v1.1 — Cloner 3D layer source (2026-10-07)
C4D-style mograph cloners as a 5th per-layer source ("Cloner 3D"), WebGL2 GPU
instancing, fully integrated into the existing param system.

**What was added**
- `holomapper.html` only (still self-contained, zero network deps). New script
  blocks: "CLONER 3D — GL" (procedural mesh geometry, instanced shaders,
  layout engine, render pass) and "CLONER 3D — UI" (discreteRow/toggleRow/
  buildClonerUI). Plus: 70 new params per layer (`L{i}.cl*`, 280 total),
  depth renderbuffers on the 4 layer FBOs (2D sources untouched — they never
  enable DEPTH_TEST), cloner branch in renderLayer, cloner program in
  compileAll, PARAM_HOOKS mechanism, SYNC_FN overrides for selects/checkboxes.
- Cloner modes: Grid (count XYZ 1..12, spacing/axis), Radial (count 2..256,
  radius, arc, plane XY/XZ/YZ), Linear (count 2..256, step vector XYZ).
- Meshes: icosahedron (subdivided), torus knot (parametric p=2,q=3), box,
  tetrahedron — generated in JS, flat/smooth toggle, wireframe overlay
  (2nd instanced LINES draw only when enabled).
- Effectors: Plain (pos/rot/scale group toggles, 9 axis sliders, strength,
  falloff Infinite/Linear/Sphere/Box + invert + size + animated offset),
  Random (seed + re-roll, 9 per-axis amounts), Shader (3D noise field:
  scale/speed/displace/scale-amt), Sound (bass/mid/high/beat source select,
  gain punch, lift), Delay (per-instance time lag on the Plain target).
- Render: key + rim lighting, per-instance hue-range color, fog toggle +
  density, orbit camera (auto-orbit toggle, azimuth/elevation/distance).
- Integration: every param is MIDI-learnable (CTRLS pre-registered for all 4
  layers), macro-assignable with depth, in preset snapshots, and settable via
  the phone-remote `param` protocol. Conditional mode subgroups retoggle on
  ANY setParam source (MIDI/phone/preset), not just direct UI clicks.

**Verification (all actually run)**
- JS: `node --check` on browser-faithful extraction of all 18 script blocks — OK.
- Render: headless Chromium 152 + SwiftShader. `checks/cloner_grid.png` —
  6x6 grid of smooth-shaded icosahedrons, per-instance color variation,
  visible key lighting and perspective, full cloner UI in the layer card.
  `checks/cloner_radial_wire.png` — 96 wireframe torus knots in a radial
  ring (proves instancing + wireframe overlay + radial layout).
  `checks/cloner_trails_melt.png` — feedback trails at 85% smearing the
  cloners (proves the 3D layer composites through the normal pipeline and
  the feedback engine melts it like everything else). Zero GLSL errors,
  zero errbanner, in all runs.
- Handlers: audit script — 280/280 cloner params present in PARAMS, CTRLS,
  and preset snapshots; MIDI bind + CC fire verified on a dropdown (mode
  0->2 with correct subgroup retoggle) and a toggle; phone-remote
  `prmHandle` verified on continuous + discrete cloner ids; macro assign on
  a cloner param verified; preset save/apply round-trip restores mode,
  spacing, wireframe with UI in sync.
- Bug found & fixed during verification: conditional mode subgroups only
  retoggled on direct select changes, not on MIDI/phone/preset-driven
  setParam — fixed via the PARAM_HOOKS mechanism (also flags instance
  buffer rebuilds for layout params from any source).

**Deliberately not in v1.1**
- Node-graph editor, video/webcam/NDI inputs (still v2 per the v1 plan).
- Real-GPU perf measurement (SwiftShader only; thousands of instances in
  one instanced draw call by construction).

## HoloMapper Mobile (mobile.html) — 2026-10-07 night
New file `mobile.html` (~116KB, self-contained, zero network deps): full engine
standalone on the phone GPU + projection-mapping output stage.
- Engine core copied VERBATIM from holomapper.html v1.1 (script blocks
  00,01,02,03,04,05,06,07,08,09,10,12 — params, all 5 sources incl. Cloner 3D,
  layer combine, feedback/kaleido/glitch/grade chain, audio, MIDI core,
  presets, row builders). Duplication vs refactor is accepted tech debt.
  NOT copied: desktop panel builders, desktop static wiring, phone-remote
  pairing (prm*), vendored QR lib. Mobile redefines: snapshot/applySnapshot
  (mapping state added), buildLayers/buildPostFx/buildMaster/buildDashboard/
  buildPerform, init/loop/wiring.
- Mobile UI: Play tab (8 touch macro knobs w/ double-tap reset + tap-to-rename,
  tap tempo, blackout, beat-sync, audio+meters, quality selector, 4 collapsible
  layer cards incl. full Cloner 3D UI), FX tab (feedback/kaleido/glitch/grade/
  strobe/master, shader plugin editor, MIDI learn section), Map tab (surfaces).
- Mapping stage: post chain renders to mapSrcT, then per-surface homography warp
  shader to screen (JS DLT solve + 3x3 inverse). Per surface: enable, opacity,
  flip H/V, per-edge feather px, rect/ellipse alpha mask (drag move + corner
  resize, invert), test pattern (grid+rings+crosshair+corner emphasis).
  Corners draggable via 56px touch handles (z-50, above topbar/tabbar/panel),
  tap-to-select + nudge pad (fine/med/coarse), "hide panel" for full-canvas
  calibration, 2D overlay draws outlines + warped mask shapes. Corners stored
  normalized (y-up) so resize/orientation preserves calibration. Output mode:
  fullscreen + UI hidden + floating exit + triple-tap exit.
- Fixed during verification: (1) test-pattern grid was inverted (pink wash) —
  corrected smoothstep direction; (2) smoothstep(0.004,0.0,…) reversed edges
  (UB) in crosshair — fixed to (0.0,0.004); (3) topbar overflow on 390px —
  preset controls moved into Play panel; (4) corner handles hidden under
  topbar/tabbar/panel — handles layer raised to z-50, mapWrap pointer-events
  none (mask mode re-enables on overlay canvas only).

### Verification (all actually run)
- `node --check` on all 15 script blocks: OK.
- Headless Chromium 152 + SwiftShader, 0 console errors across all runs.
- Screenshots: mob_play_390.png (engine rendering behind Play UI, knobs, layers),
  mob_map_390.png / mob_mapopen_390.png (map UI, handles visible incl. over
  tabbar), mob_test_390.png (test pattern: grid+rings+crosshair correct),
  mob_play_1024.png / mob_fx_1024.png / mob_map_1024.png (tablet: 8-knob row,
  FX groups, no overlap/clipping at either size).
- Corner drag via synthetic PointerEvents: surface corner updated
  [0,0] -> [0.1026,0.0355] (asserted from S.map).
- Mask drag via synthetic PointerEvents: mask center moved
  [0.5,0.5] -> [0.63,0.45] (asserted).
- Preset round-trip incl. mapping state: save -> mutate corners -> apply ->
  corners restored exactly. OK.
- Output mode: body.output toggles, exit button appears, triple-tap path wired
  (fullscreen request guarded for iOS Safari which lacks the API).
- Cloner 3D in mobile: 36 instances built, renders (same verbatim render path
  as desktop v1.1; default camera framing identical to desktop).
- Handler audit: every `$('id')` referenced in JS exists in the shell (grep:
  none missing); every control created with its listener inline; static buttons
  all wired in wireMobile/wireOutput.
- Screenshots: checks/mob_play_390.png, mob_map_390.png, mob_mapopen_390.png,
  mob_test_390.png, mob_play_1024.png, mob_fx_1024.png, mob_map_1024.png,
  mob_cloner_390.png.

### Known limitations / honest notes
- Headless SwiftShader runs at 1-3 fps; real-device GPU is untested here and is
  ground truth (same caveat as v1.1). Default internal res 960x540 for thermal
  headroom; 1280x720 / 640x480 selectable.
- requestFullscreen is not supported on iPhone Safari — output mode still hides
  all UI there, but won't take over the screen chrome; triple-tap + floating
  exit still work.
- Web MIDI on mobile: kept as a collapsed section (works on Android Chrome);
  not foregrounded.
- mobile.html and holomapper.html share localStorage (holomapper.state.v1) when
  served from the same origin: presets carry over; S.map is ignored by desktop.
- No pinch-to-move-corner gesture (drag + nudge only); multi-surface
  projector edge-blend tuning is manual via feather sliders.

## Mobile UI v2 shell rebuild (2026-10-07 — Joshua's verdict on v1 shell: "all the above")
Rebuilt mobile.html UI shell only (style block, body shell, final script block).
Engine (shaders, layers, post chain, cloner, params/presets/audio/MIDI) and mapping
math (homography, masks, surfaces) untouched — verified by diff of non-shell regions.

### What changed (design)
- Play-first bottom sheet: canvas is the hero; sheet peeks (grab handle + Play/FX/Map
  tabs + BLACKOUT/TAP gig bar + M1-M4 knobs) and drags/taps open for full controls.
- remote.html design language adopted: same palette, section cards, 12px uppercase
  section headers, gig-bar big buttons, CSS conic-gradient dial knobs.
- Progressive disclosure: Play = gig bar + 8 macros + layer quick-select chips
  (L1-L4 with source name + ON/OFF bypass toggle) + expanders (All layers & sources,
  Presets, Audio & engine). FX = Post FX chain / Master / Shader plugin / MIDI
  sections. Map tab keeps its structure with the new spacing/type treatment.
- Type scale: text-size-adjust:100% (kills Android font boosting), 12px minimum
  labels, real header hierarchy, no truncation on important controls.

### What changed (real-Chrome technical)
- 100vh -> 100dvh (vh fallback) on #gl and sheet max-height; viewport meta gains
  interactive-widget=resizes-content; visualViewport.resize listener added
  alongside window resize/orientationchange (mapping calibration preserved —
  corners are stored normalized).
- Knobs rebuilt on remote.html's proven pattern: pointerdown/move/up/cancel with
  setPointerCapture, touch-action:none, 350ms double-tap reset (replaces dblclick,
  which never fired on touch), 60ms fire throttle, drag math initialized from the
  touch point (no first-move jump). Macro label editing via prompt kept.

### Verification (faithful mobile emulation: CDP setDeviceMetricsOverride
mobile:true, touch emulation on, 360x740@dpr2.5 / 390x844@dpr3 / 1024x1366@dpr2)
- node parse of all 15 script blocks: OK. Zero console errors on load and after
  all interactions.
- Screenshots inspected at all three sizes (checks/v2_play_peek_360.png,
  v2_play_open_360.png, v2_fx_360.png, v2_map_360.png, v2_play_peek_390.png,
  v2_play_open_390.png, v2_map_390.png, v2_play_open_1024.png, v2_map_1024.png):
  no overlap/clipping/horizontal overflow; hierarchy and spacing read clean.
- Synthetic TouchEvent (Input.dispatchTouchEvent) knob drag: 0.50 -> 1.00,
  monotonic intermediate values, sheetBody scrollTop and window.scrollY unchanged.
- Double-tap reset: initial CDP test failed only due to round-trip latency pushing
  taps past the 350ms window; deterministic in-page PointerEvent dispatch passes
  (0.90 -> 0.50). Single tap does not reset. Logic confirmed correct for real HW.
- Corner-handle touch drag updates homography corners; preset save/load round-trip
  restores macro values AND mapping corners; engine still renders behind the UI.
- 12/12 functional checks pass (11 direct + 1 logic-confirmed).

### Complaint-by-complaint
1. Ugly/cramped -> bottom-sheet play-first layout, remote design language,
   generous whitespace, section hierarchy.
2. Layout broken -> 100dvh, interactive-widget=resizes-content, visualViewport
   resize handling, text-size-adjust.
3. Knobs won't drag -> rebuilt on remote's proven pointer-capture pattern with
   touch-action:none; verified smooth monotonic drags via real touch sequences.
4. Text sizing off -> text-size-adjust:100%, 12px label floor, no truncation.

### Still unknowable headless
Real-device touch feel/timing, actual Android Chrome toolbar interplay, and
phone GPU frame rates (SwiftShader did 1-3fps; his phone is ground truth).
Note: mobile.html carries a verbatim copy of the v1.1 engine — the parallel
v1.2 spectral-renderer work on holomapper.html will need a port pass to reach
mobile.html (accepted tech debt, flagged for the parent).

## v1.2 — Spectral renderer + ShaperBox modulators + mesh library (2026-10-07)

### What was built (holomapper.html only)
**Spectral renderer (Octane look via honest approximations):**
- ACES filmic tone mapping on cloner layer output (toggle + exposure).
- "Spectral" material mode: 3-band dispersion (per-band IOR perturbation of env reflections) + dispersion strength.
- Thin-film iridescence: view-angle hue shift + film thickness param.
- Material params: metallic, roughness, IOR, absorption color/density, env intensity — all `L{i}.cl*` params, MIDI/macro/preset/modulator-routable.
- Procedural analytic-studio IBL (key/rim/fill gradients + 2 bright strips), no HDR files.
- Half-res mip-chain bloom (bright-pass → 2× blur → additive) on the cloner layer.
- Ground plane toggle (default off): soft blob shadows + animated caustic shimmer.

**Mesh library (14 total):** icosahedron, torus knot, box, tetrahedron, torus, cone, cylinder, capsule, helix tube, extruded 5-point star, cut gem, diamond, procedural flower, GPU particles. All work with flat/smooth shading, wireframe, per-instance color, one instanced draw call.

**Flowers:** parametric petals (3–16), length/width/curl, bud, stem; bloom open/close ("the money param") done shader-side via Rodrigues rotation on petal pivots.

**Particles:** camera-facing quads, box/sphere/disc emission, stateless vertex-shader sim (seed attributes, no transform feedback), velocity + curl turbulence, life loop, color-over-life, drag, audio burst; one instanced draw call.

**Modulators A–F per layer:** drawable curve editor (click-add, drag-move, dblclick-delete, smoothing, sine/tri/saw/sqr/random presets, beat grid), BPM sync (1/8–4 bars from tap-tempo), free Hz, audio-follow (bass/mid/high), phase offset, bipolar toggle, up to 4 routings each to `L{i}.cl*` params with depth. Depth/rate MIDI-learnable + macro-assignable; curves persist in presets.

### Bugs found & fixed during verification
1. **ensureClonerGL body duplicated** by an edit (stray `}`) — `node --check` caught it.
2. **Mesh param map baked at n=4** — `clDiscMap(4)` couldn't reach meshes 4–13; fixed to `clDiscMap(14)`.
3. **Bloom blacked the layer (real bug, fixed):** `renderCombine`/`renderFeedback`/`renderKaleido`/`renderGlitch`/`renderGrade`/`renderLayer` all called `drawQuad(P)` BEFORE `setTex`/uniforms — a 1-frame stale-bind lag that worked until bloom rebound texture unit 0, making combine sample the bloom texture instead of the layer. Fixed all 6 sites to bind-then-draw via new `quadDraw()` helper.
4. **Particles crashed** (`CLGEO[13]` undefined) — particle mode now uses the quad mesh at `CLGEO[12]`.
5. **sanitizeMods dropped rate/phase/bip** — added to the sanitized mod object (engine reads these from params via `eff()`, so params remain source of truth).

### Verification results
- `node --check` on all 18 script blocks: PASS.
- GLSL: all 15 programs compile (cloner, clground, bloombp/blur/add included); zero console errors across all runs.
- Screenshots (in `checks/`): `v12_gem_spectral.png` (faceted gems, spectral material), `v12_metal_bloom.png` (metallic icosahedrons + bloom), `v12_flowers.png` (flower field, half bloom), `v12_particles.png` (1465 sprites, sphere emission + bloom), `v12_ground.png` (caustics + blob shadows), `v12_curve_editor.png` (drawable curve UI), `v12_mod_a.png` / `v12_mod_b.png` (modulator driving Plain Pos Y — grid visibly moves between frames).
- Handler audit: all 60 new params present in both PARAMS and CTRLS (0 missing).
- Preset round-trip: params + full curve point arrays + sync/targets restore exactly.
- Macro smoke test: M1 → `L0.clMA_Depth` modulates `eff()` correctly (0.2 → 1.0).
- Perf: instances remain ONE `drawElementsInstanced` per layer; bloom adds 4 small fullscreen passes; ground adds 1. SwiftShader ~1–3fps (his GPU is ground truth).

### Known limits / honest framing
- Not real spectral path tracing: dispersion is 3 discrete bands perturbing reflection vectors; iridescence is an analytic thin-film approx; IBL is procedural, not captured.
- Test screenshots are dim/small under SwiftShader — real-GPU look is his to judge.
- Modulator curve edits don't live-redraw the canvas until mouseup (draw() called on drag; fine).
- `mobile.html` still carries the v1.1 engine — v1.2 needs a port pass (accepted tech debt).

## Resolume-deck UI rebuild (2026-10-07 night)
Rebuilt the holomapper.html shell as a Resolume Arena-style deck. Engine untouched
(all shaders, layer pipeline, Cloner 3D + spectral renderer + modulators, param /
MIDI / macro / preset / audio systems intact).

What changed:
- Left panel: 4 layer strips (color tabs, L1-L4 select, S solo, B bypass, X clear,
  opacity mini-slider, blend dropdown) x 8 fireable clip slots each. Click a clip
  to fire its source; right-click for the assign-source popup; empty slots dashed.
- Layer source is now a real param `L{i}.src` (discrete 5, MIDI-learnable). Firing
  goes through setParam; PARAM_HOOKS mirrors into S.layers[i].src (render loop
  untouched) and refreshes clip highlights.
- Right panel: selection-driven properties — LAYER view (source dropdown, blend,
  solo/bypass, full param stack with macro assigns, cloner UI when src=Cloner 3D),
  CLIP view (source assign, Fire, Clear). Post FX / Master / MIDI / Shader Plugin
  sections unchanged below.
- Topbar: master slider, tap/BPM/BeatSync, MIDI learn, audio+meters, presets,
  res select, help, PERFORM, fullscreen, phone remote/pair (two-row wrap).
- Bottom: 8 macro sliders + labels + BLACKOUT + fps (dashboard moved from right panel).
- Clip state: S.clips[4][8] (null or 0-4), S.fired[4]. Presets snapshot/restore both;
  old presets (no clip data) get defaults + source derived from layers[].src.
- All 32 clip-fire buttons registered in CTRLS (MIDI-learnable clip triggering).
- PERFORM mode: fixed a latent layout bug (grid auto-placement put #main/#stage
  into 0px tracks when panels hid — perform was always black). Added explicit
  grid-row/grid-column placement; verified full-bleed canvas + macro bar.

Verification (all actually run):
- node --check on all 18 script blocks: pass. Zero console errors on load.
- CDP interaction tests: deck renders 4 strips / 32 clips; clip click fires source
  through the param system (S.params + S.layers + highlight + selection all sync);
  right-click assign menu sets clip source; preset save->mutate->load restores
  clips+fired+source; old-format preset loads with backward-compat defaults;
  CTRLS['clip0.3'].set(1) fires via the MIDI path; keyboard 1-4/B/M all work;
  source dropdown in props is MIDI-learnable (CTRLS['L2.src'] registered).
- Bug found by testing: firing a clip whose source duplicated an earlier slot
  jumped the highlight to the first matching slot (syncFiredToSrc used indexOf
  unconditionally). Fixed: keep the fired clip if it still holds the source.
- Screenshots (checks/): deck_full.png (full deck, Resolume layout language),
  deck_fired.png (fired Cloner clip highlighted, props in sync),
  deck_perform.png (perform mode: full-bleed canvas + M1-M8/MASTER bar).
- Handler audit: no dangling $('...') ids; every new control wired.

## Mobile v3 — compact deck + v1.2 engine port (2026-10-08, ~00:25 CDT)

What changed in mobile.html (only file touched):
- UI rebuilt as a compact deck mirroring holomapper.html: single-row scrollable
  topbar (brand, master mini, Tap+BPM, Sync, MIDI learn, presets, res select,
  PERFORM, output-mode), 4 layer strips each with L-tab/S/B/clear, opacity
  mini-slider, blend select, and a row of 8 fireable clip slots (clip rows
  scroll horizontally under 640px), bottom macro bar with 8 slim sliders +
  BLACKOUT, props as a right slide-over (tap any layer strip to open),
  Deck/FX/Map tabs in a 37dvh panel. Same palette/type as desktop.
- Engine ported from holomapper.html v1.2 verbatim: spectral cloner renderer
  (ACES, dispersion, iridescence, IBL, bloom, ground plane), 14 meshes +
  flowers + particles, 6 ShaperBox modulators/layer (S.mods), clip-state
  system (S.clips, S.fired, L{i}.src param). Mapping block carried from mobile
  v2 with renderGradeTex rewritten to the v1.2 quadDraw ordering. Overlays
  (mapWrap/handles/mapcv) moved inside #stage so they track the canvas.
- Kept big: clip slots (62px), corner handles (56px), transport/output buttons
  (52px) — these are the thumb targets. Everything else compact.

Verification (all actually run):
- node --check on all 15 script blocks: pass. Zero errbanner on load.
- CDP mobile-emulation (390x844 @2x, 1024x1366 @2x): deck renders 4 strips /
  32 clips with fired highlights; props slide-over opens on layer tap with the
  full param stack (Spectral material, Flower mesh, Modulators A-F + 6 curve
  canvases); FX tab shows post-FX chain/master/plugin/audio/MIDI; Map tab
  shows surfaces, corners/mask/test-pattern seg, pins instructions; output
  mode goes fullscreen with pins toggle + exit; 1024px view reads as the
  desktop's sibling.
- Functional: clip click fires source through the param system (src 4->0,
  S.params['L0.src']=0); cycling all 14 meshes + flower + particles produced
  zero GL errors; modulator A routed to L0.op moved eff(0.2)->0.54->1.0 over
  time; corner drag in output+pins mode moved corner A [0,0]->[0.103,0];
  preset snapshot->mutate->applySnapshot restored L0.op=0.33, clips, and map
  surfaces.
- Bugs found by testing and fixed: (1) wireHandles()/wireMask() were not
  called in the v3 shell — corner drag silently did nothing. (2) Desktop CSS
  had flex-wrap:wrap on #topbar — it stacked into 3 rows; forced nowrap so it
  is one scrollable row. (3) .ptab{display:flex} overrode the hidden attribute
  — Deck and Map panes stacked; added .ptab[hidden]{display:none}.
- Screenshots (checks/): v3_deck_390.png, v3_props_390.png, v3_fx_390.png,
  v3_map_390.png, v3_outpins_390.png, v3_deck_1024.png, v3_cloner_390.png.

Known limits:
- 1 fps in headless SwiftShader is the software renderer, not the engine —
  real GPU is ground truth for look/perf.
- Clip assign on mobile is via long-press (contextmenu) since there is no
  right-click; desktop keyboard shortcuts (1-4, B, M, Esc-exit-props) are
  wired but touch has no keyboard.
- Screenshots verify layout, not the spectral look — needs his eyes on the
  live Pages URL in Chrome.

## v4 — Resolume-faithful mobile shell (2026-10-08)
Reference-first rebuild. Primary reference: Joshua's OWN Resolume Arena 7.1.0
screenshot (research/resolume-arena-7.1.0-reference.webp, copied from the file he
sent); secondary: web research notes (research/resolume-ui-notes.md). Engine
(v1.2), mapping math, output mode, pins, presets, MIDI, audio: untouched except
two surgical transport additions (RESYNC/PAUSE). UI shell only.

What changed (mobile.html only):
- Clip grid is now the hero, Resolume's paradigm: column headers C1–C8 across the
  top (tap = fire the whole column, one clip per layer; connected column glows
  teal), 4 layer rows with left gutters (L1–L4 tab, ✕ B S, per-layer opacity
  slider). Playing clip = teal glow; empty slots = dark dashed wells; selected
  layer tab = teal. Clip assign still via long-press.
- Transport bar under the grid, mirroring his: TAP, BPM (teal), /2, *2, RESYNC
  (resets beat phase), PAUSE (freeze-frame of the shared clock), BLACKOUT,
  beat-sync checkbox. BLACKOUT sits right after PAUSE so it needs no scroll.
- Bottom panels retabbed to Composition | Layer | Clip | FX | Map (his
  Composition/Layer/Clip + our FX/Map). Composition tab: ▸ Dashboard with 8
  ROTARY KNOBS (his dashboard is knobs; drag vertically, double-tap resets,
  MIDI-learnable, labels + % readouts) and ▸ Presets. Layer/Clip tabs render the
  same prop builders as before (incl. all 6 drawable modulator curve editors
  under Cloner). FX tab: post-FX chain, Master, shader plugin, audio, MIDI —
  all inside collapsible ▸ sections like his. Map tab unchanged.
- Visual language: near-black panels, teal (#2dd4bf) for active/playing/
  selected/connected, amber bypass / yellow solo (his colors), dense 10–11px
  labels, teal slider fills, −/+ steppers kept where they were.
- Removed: Deck/FX/Map tab scheme, macrobar (macros live in the dashboard now),
  props slide-over (replaced by Layer/Clip tabs).

Bugs found by testing and fixed:
1. snapshot()/applySnapshot() shell wrappers infinitely recursed ("Maximum call
   stack size exceeded") — `const snapshotEngine = snapshot` self-captured
   because the later function declaration shadows the engine binding at
   script-instantiation time. This pattern was latently broken since the v3
   shell (v3 presets never actually worked). Fixed with distinctly-named
   snapshotFull()/applySnapshotFull(); colFired now persists in presets too.
2. midiStatus() targeted the removed topbar #midistat → null.textContent threw
   on init. Now targets #midistat2 with a guard.
3. Map corner handles were visible on every tab: positionHandles() set inline
   display:block, which survived showTab's class toggle. Now owns the 'on'
   class and clears inline style.
4. Selected layer strip had a purple outline (base CSS .lstrip.sel) — now teal.

Verification (puppeteer-core + Chromium 152/SwiftShader, harness kept at
checks/hmv4check.mjs):
- node --check on all 15 script blocks: pass. Zero page errors on load.
- 34/34 functional checks pass at 390x844 AND 1024x1366: 32 clip cells, 8
  column buttons, 8 dashboard knobs, canvas sized, default tab Composition,
  column fire (fired=[2,2,2,2], colFired=2, 4 teal highlights), single fire
  clears column, layer/clip tab switching + props render, pause toggle,
  resync, macro knob label sync, preset round-trip (fired/macros/colFired
  restored), FX postfx rows, Map surfaces, 6 modulator curve canvases in the
  Layer tab, output mode hides UI, pins button shows 4 corner handles,
  exit restores UI.
- Screenshots (checks/): v4_phone_390x844.png, v4_phone_390x844_fired.png,
  v4_tablet_1024x1366.png, v4_tablet_1024x1366_fired.png, v4_outpins_390.png.
- Honest comparison vs his 7.1.0 screenshot — matches: teal selection
  language, grid paradigm (columns across, layers down, ✕BS gutter), transport
  row contents/order, tabbed Composition/Layer/Clip panels, collapsible ▸
  sections, dashboard knobs, near-black density. Doesn't match (deliberate):
  no thumbnails (our sources are procedural — name labels instead), no deck
  tabs (one clip bank; columns cover the paradigm), no Files browser, no A/B
  crossfader or RECORD, no menu bar, no separate preview monitor (the visible
  canvas IS the monitor), Map tab has no Resolume equivalent (kept in the same
  visual language).

Known limits:
- 2–3 fps in headless SwiftShader is the software renderer — real GPU is
  ground truth for look/perf, as always.
- Knob drag is vertical-pointer; on his phone this needs his thumb-verdict.
- PAUSE freezes the shared clock (full freeze-frame incl. modulators) — the
  honest equivalent of Resolume's transport pause.
- Not pushed (per task). Files in place: mobile.html, research/, checks/.

## Node graph editor ("dive-in") — v1.3 (2026-10-08)
TouchDesigner-style per-layer node graphs in holomapper.html only. Texture
routing now; value wires later. Scope: desktop-first, mobile plays graphs via
presets.

What was built:
- 4 per-layer graphs (S.graphs[i] = {nodes, wires, seq, rev}). Default graph
  per layer: Source("Layer Input") -> Output, plus 6 LFO nodes (A-F, tied to
  the existing ShaperBox modulators) and 1 Audio Follow node (live bus
  monitor). LFO/Audio/Output nodes are locked (can't delete).
- 11 node types: Source (Layer Input/Tunnel/Flow Field/Nebula/Plugin/
  Cloner 3D), Feedback (own ping-pong pair), Kaleidoscope, Glitch, Grade,
  Bloom (node-local half-res chain), Transform, Blend (2 inputs, 6 modes),
  Output, LFO x6, Audio Follow.
- Evaluation: topological order per layer (cached, dirty-flagged via g.rev),
  each node renders to its own RGBA16F target (lazy pool, disposed on res
  change / node delete). Output node feeds the compositor (layerT[i]).
  renderLayer() dispatches to evalGraph; any eval failure falls back to the
  fixed pipeline (renderLayerInto).
- Node params are REAL params (L{i}.N{nid}.{key}) registered in PARAMS ->
  MIDI-learnable + macro-assignable via the existing paramRow/discreteRow/
  toggleRow builders, in the editor's own right props panel.
- Editor: fullscreen overlay, pan (drag bg), zoom (wheel to cursor, +/-/Fit),
  subtle grid, palette (double-click canvas or + Node; 8 creatable types),
  out->in and in->out wire drag, click wire to select, cycle rejection with
  message, Delete/Ctrl+D/ESC, node drag. Dive in: double-click layer name in
  deck, "Nodes" topbar button, or N key. ESC / <- Deck returns.
- Persistence: graphs serialize in presets (snapshot/applySnapshot);
  old presets (no graphs) get the default graph; graphs survive reload via
  localStorage.

Verification (headless Chromium + SwiftShader, /tmp/nodetest.mjs etc.):
- node --check + acorn (ecmaVersion 2024): all 19 script blocks parse.
- Pixel identity: default graph renders BIT-IDENTICALLY to the fixed
  pipeline — 0 differing pixels of 921,600, for all 5 source types
  (tunnel/flow/nebula/plugin/cloner). Output node uses a texelFetch copy
  (PROG.copyexact) so no filtering epsilon.
- Functional 12/12: default graphs on all layers; feedback insertion changes
  pixels; cycle + self-wire rejected; delete re-evaluates; preset
  save->mutate->load restores graph exactly; node params in PARAMS; deck
  (fireClip/bypass) intact; zero page errors (only pre-existing favicon 404).
- UI 9/9 with real mouse: N/ESC, dblclick layer name, dblclick canvas ->
  palette, palette creates node, mouse wire-drag creates wire, Delete removes
  wire, Ctrl+D duplicates, Back button exits.
- Old preset (graphs deleted) -> default graph rebuilt with params.
  Graph + param edits persist across page reload.
- Screenshots (checks/): shot-graph-default.png (default graph + LFO rack),
  shot-graph-fx.png (Source->Feedback->Bloom->Output), shot-lfo-props.png
  (LFO A drawable curve editor open), shot-wire-drag.png (wire mid-drag),
  shot-deck.png (deck unchanged, composition rendering).

Bugs found & fixed during verification:
- drawModCurve(cv,cfg) takes a canvas, not (ctx,W,H) — two call sites fixed.
- MOD_WAVES is an object keyed by name, not an array — select fixed.
- LFO editor referenced pre+'Bipolar'; real id is pre+'Bip'.
- openNodes set display:block (collapsed flex layout) -> display:flex.
- Nested <script> from assembly (fixed), topo cache stale on wire replace
  (g.rev counter), node targets leaked on delete (now disposed).
- Test-only: puppeteer 25 uses {count:2} for dblclick; favicon 404 is
  pre-existing on both builds.

Known limits:
- No value wires yet: LFO/Audio nodes have no ports (says "value routing:
  later" on the node). Modulator routes still use the existing target system.
- FX nodes have no per-node bypass (delete/disconnect is the bypass).
- One wire per input port (new wire replaces old) — TouchDesigner-style.
- Output node with no input renders black.
- mobile.html/remote.html/bridge.py untouched. Not pushed (per task).

Try first: double-click a layer name (L1) -> drag Feedback between Source
and Output -> select it -> push Trails. Then double-click LFO A and draw a
curve.

## 2026-10-08 — Desktop deck UI rebuild v5 (Resolume Arena 7 faithful)

Reference-first rebuild of holomapper.html shell against the Arena 7 manual
research + Joshua's actual 7.1.0 and 7.27.1 screenshots. Engine/params/MIDI/
presets/audio/node-graph evaluation untouched. mobile.html, remote.html,
bridge.py untouched. NOT pushed.

### What changed
- Layer 1 now renders at the BOTTOM of the clip grid (display i=3..0);
  engine composite order unchanged.
- Clip cells split: thumbnail = TRIGGER (quantized to Beat Snap), name
  handle = SELECT without triggering. Column tabs C1-C8 fire one clip per
  layer (quantized, MIDI-learnable).
- Per-layer strip: X (eject), B (bypass, orange), S (solo, yellow), opacity
  slider, blend dropdown. Blue = selected, teal glow = fired column.
- Transport toolbar: beat-phase canvas, BPM +/-, TAP, RESYNC, nudge hold
  buttons, /2 *2, Beat Snap selector (none/beat/bar/2/4 bars, default bar),
  PAUSE, AUTO (autopilot), BLACKOUT. Spacebar = blackout; T = tap.
- Dashboard: 8 rotary dials top the Composition panel. Drag ANY parameter
  label onto a dial to assign (per-param depth + invert checkbox);
  double-click renames, right-click clears, MIDI-learn works.
- Deck tabs (SOURCES, HOLOWATTS, +) across the top of the grid — his
  paradigm. Switching decks swaps the clip bank only; playback (fired
  sources, layers, clock) is never interrupted. Double-click renames,
  right-click deletes, + adds. Persisted in presets/localStorage.
- Autopilot: columns autoplay LEFT to RIGHT, one per Beat Snap quantum.
  Toggle in transport; continues from last fired column; manual column
  fires just move the playhead.
- Clip cells show a teal FX dot when the layer's node graph has FX nodes
  beyond the default src->output path (honest mapping of his
  "effects stack on sources": the layer node graph IS the effect stack;
  clip-level FX chains parked as a named next step).
- Visual language: #1a1b1e base, 1px flat borders, semantic color only
  (blue select, teal playing, orange bypass, yellow solo, red
  master-down/blackout, green MIDI-learn tint). 11px dense sans.
- Master clock (beatT0/pausedBeats/beatsNow); tap re-anchors; pause freezes
  clock only. Quantized trigger queue processed in loop().

### Verification
- node --check on all 19 script blocks: PASS.
- Headless harness (hmv5check.mjs): 37/37 PASS — layer order, clip
  trigger vs select, column fire, snap queue->boundary fire, bypass/solo/
  eject colors, MIDI-learn green tint, spacebar blackout, tap/resync/
  pause, preset round-trip (bpm/bypass/snap/decks), dial drag-assign +
  invert + vertical drag, node dive-in/out, zero page errors at
  1600x900 and 1920x1080.
- Decks/autopilot suite: 14/14 PASS — default SOURCES+HOLOWATTS tabs,
  switch-without-interrupting-playback, independent banks, add deck,
  autopilot toggle + left-to-right advance on bar boundaries.
- Preset round-trip with decks: 6/6 (deck name/idx/clips/autopilot/snap).
- PERFORM mode: fixed a regression (grid auto-placement collapse when
  siblings hide) — full-screen output + macro overlay verified.

### Bugs found & fixed during build
- #transport was nested inside #gridzone (not a #main child) -> lower zone
  collapsed to 32px; dials unhittable. Moved to sibling.
- Dial drag "failure" was the collapsed layout, not the handler — trusted
  mouse + synthetic events both drive dials correctly once hittable.
- PERFORM black: #lowerzone/#main auto-placed into empty rows when
  siblings display:none. Added body.perform single-row rules for #app,
  #main, #lowerzone.

### Deliberate divergences (from his 7.27.1 screenshot)
- 4 layers, not 36: the ENGINE is 4 layers (combine shader u_l0..u_l3,
  PARAMS L0-L3, node graphs x4, MIDI maps). 36-layer engine = separate
  project; not faked.
- No crossfader A/B bus, no per-layer M/V toggles: no engine crossfader;
  opacity covers the V fader. Cut rather than half-shipped.
- No LINK button: no Ableton Link implementation. No STOP: generative
  sources have no stop concept (PAUSE = clock pause).
- Clip "thumbnails" are source-name labels (procedural sources, no
  bitmaps). Preview monitor is checkerboard + label (matches his empty
  preview). Browser has Effects/Sources only (no file library).
- Clip-level FX chains: parked. Layer node graph is the effect stack;
  clips show an FX dot when the layer graph is non-trivial.

### Screenshots (checks/)
- v5_deck_1600.png, v5_comp_1600.png, v5_deck_1920.png, v5_nodes.png
- v5_decks_auto_1600.png (deck tabs + AUTO lit + fired column),
  v5_comp_1600b.png (dashboard close-up), v5_perform_1600.png

Try first: click C3 to fire a column on the bar line, then hit AUTO and
watch it walk left to right. Double-click a layer name to dive into its
node graph.

## v1.4 — Shader imports as first-class sources (2026-10-08, REDESIGNED per Joshua)
- SUPERSEDES the per-layer plugin-slot draft from earlier today: Plugin is back to ONE global editable `#plugcode` scratchpad (`S.pluginCode` string, `PROG.plugin`); imports are separate first-class sources.
- Dynamic source registry: built-ins 0–4 (Tunnel, Flow Field, Nebula, Plugin, Cloner 3D) + imports 5+. `S.imports=[{name,code,uniforms}]`, `PROG.imports[]` compiled programs (shared across layers, uniforms set per draw). Helpers: `srcCount()`, `srcName()`, `srcOptions()`, `srcIdxMap()/srcIdxFmt()` (proportional normalized mapping).
- Drop .txt/.glsl/.frag/.fs anywhere (or "Load .txt" button) → each file becomes a named source (filename minus extension) in the SOURCES browser + a new clip in the current deck (selected layer, first empty slot; row-full → Sources only + toast why). The clip auto-fires so he sees it immediately. Dedupe: identical code reuses the existing source.
- 5-source assumptions fixed everywhere: layer src param map/fmt, PARAM_HOOKS, fireClipNow/applyState/init divisors (applyState now prefers absolute `layers[].src` when valid, so old presets don't shift when imports are added), renderLayerInto dispatch, clip cells, clip menu, clip props select, layer props select, Sources browser (with × per import → `removeImport()` remaps clips/layers/params), node src node (opts + `*srcCount()`), nodeTitle, validClips (any non-negative int), preview label.
- `shaderTranslate()`: strips `#version`, `texture2D(`→`texture(`, `gl_FragColor`→`O`; `mainImage` wrapped with iResolution/iTime defines + iTimeDelta/iFrame/iMouse uniforms (per-frame in renderLayerInto, iMouse tracked on #gl).
- Failure: bad compile → dismissible toast with compiler log, nothing touched, never black-screens. iChannel shaders get a plain-English unsupported message.
- Persists in presets AND localStorage (code included); imports recompile on init/preset-load.
- Verified 32/32 headless (checks/import_check.mjs): drop→Sources panel + deck clip + auto-fire; fire after reload; reload→imports+programs+knob values survive; preset save/mutate/load restores imports + SH params; removeImport remaps; broken drop → error toast, live shaders untouched. Screenshots: checks/txtdrop_dragover.png, checks/import_loaded.png.
- Known limits: no iChannel texture inputs; import names capped at 40 chars; no import rename UI yet.

## v1.4 — Preview monitor goes live (2026-10-08)
- Name-click (`.cname` → selectClip) now renders the clip's source FOR REAL in the preview monitor; box-click (`.cthumb` → fireClip) still fires to output (verified unchanged, quantized).
- `updatePreview(t)` runs every frame from `loop()` after renderGrade: when `S.sel.kind==='clip'`, renders the selected clip's source through the layer's node graph (`evalGraph(i,t,srcOv,pvT)` — src override applies to "Layer Input" src nodes only, explicit src nodes keep their setting) or the fixed pipeline (`renderLayerInto(i,t,pvT,src,ignByp=true)`) into a dedicated 480×270 RGBA8 FBO, then readPixels → vertical flip → putImageData → drawImage onto the 2D #pv (320×180). Empty/no selection → static checkerboard + label (only redrawn on transition).
- Never disturbs output: writes only pvT; NRUN `fbRead` snapshotted/restored around preview eval so feedback trails stay coherent; bloom/cloner scratch is frame-local. Layer bypass ignored in preview (Resolume behavior — preview shows the clip regardless).
- Verified 14/14 headless (checks/preview_check.mjs): real-DOM name clicks, preview non-checkerboard + animates, follows across layers, box-click fires (regression), empty clip → stable checkerboard + "(empty)" label, graph path, fbRead stable, zero page errors. Screenshot: checks/preview_live.png (PREVIEW MONITOR — L1 · CLIP 1 (TUNNEL) rendering live).
- Perf note: one extra graph eval at 480×270 + one 518KB readPixels per frame while a clip is selected; negligible next to the main render.

## v1.4 — Auto-knobs from shader uniforms (2026-10-08)
- On import (and preset/state load), `scanShaderUniforms()` finds `uniform float <name>;` declarations, excluding reserved: iResolution, iTime, iTimeDelta, iFrame, iMouse, iDate, iSampleRate, iChannel0–3, engine `u_*`.
- Each becomes a real param `SH<srcIdx>.<uname>` (0–1, default 0.5), rendered as sliders in the Clip tab when that shader's clip is selected — via the standard `paramRow` builder, so MIDI-learn and dashboard macro-assign come free. Uniforms uploaded every frame before the shader draws. Persisted in presets + localStorage like any param; `removeImport()` drops/shifts SH params with the index.
- Verified inside checks/import_check.mjs: 3 knobs appear, CTRLS-registered + learnable, dragging changes the render both directions, preset round-trip preserves values, uniform-less shader shows no knobs section.
- Known limit (stated in UI + here): float uniforms only — vec uniforms are parked, not half-built.

Try first: drag any Shadertoy .txt onto the app — it lands in SOURCES and fires on L1 instantly; click its clip NAME to watch it in the preview monitor, then drag its uniform knobs in the Clip tab.

## Tab toggles deck <-> node view (2026-10-08, checks/tab_check.mjs)
- Gesture: click clip (name or box) + Tab -> node view lands on that clip's layer graph; Tab again -> deck. Ableton-style, same window (unlike Resolume Wire).
- Dive resolution: selected clip > fired clip on selected layer > plain layer graph. Empty selected slot falls through to fired/layer.
- Breadcrumb: `Clip L2 · C4 (Flow Field) — Node Graph` + crumb hint `Tab: back to deck`; nebar updated to `ESC / Tab: deck`; back button title `(ESC / Tab)`.
- Source node in follow mode shows dive clip's source (`Source · Flow Field`) via neDive context, cleared on closeNodes; explicit src nodes unaffected.
- Guards: Tab not hijacked in input/textarea/select/contentEditable (existing deck guard + neKey typing guard); neKey is capture-phase so node-view Tab never reaches deck handler.
- Kept: N / double-click layer name / Nodes button (plain layer dive, no clip context), ESC exit.
- Verification: 16/16 (name-click dive, fired-clip dive, no-clip layer dive, ESC, text-input guard incl. focus actually moving presetName->btnSavePreset, N preserved, Tab x4 stability, zero page errors). node --check + acorn clean on all 19 blocks.
- Screenshot: checks/tab_dive_crumb.png.
- Known limits: dive does not change live output (editor overlay only); Tab on a focused button is hijacked by design (Ableton-style).

## Content wave verification (2026-10-08 — checks/content_wave_check.mjs)
- The previous builder was killed by a VM restart mid-task; its partial work was assessed first: file syntactically valid (node --check + acorn 19/19 clean), no half-written edits found. FX kit, webcam, clip params, and node details were all substantially implemented — the work needed verification, not rebuilding.
- Harness fixes by this agent: `#neview` -> `#nodeed` (node editor root is created dynamically; tab_check.mjs already used #nodeed), preview-label regex case (`/Clip 1/` not `/CLIP 1/`), added `--use-fake-ui-for-media-stream` (without it headless Chromium denies getUserMedia with NotAllowedError even for the fake device — code was correct, harness was wrong).
- **34/34 PASS, zero page errors.** Post-chain FX pixel changes (mirror/automask/colorize/bloom); node-graph mirror/automask/colorize in FX palette + pixel change; webcam live via fake device (render + flip param), denial path (toast + NO CAMERA slate, never black); registry (webcam always last: 5 with no imports, shifts to 6 with an import, back to 5 after removeImport; Sources panel lists import + Webcam); Clip tab params for built-in (Speed/Hue/Param1/2/Audio), cloner (Mode/Mesh/Count/Scale), webcam (H-Flip + Enable camera), import auto-knobs (SH5.myKnob); node details panel shows dive clip info + params with no node selected; Tab dive/return; preview label follows selection; preset round-trip restores new FX state.
- Tab regression (checks/tab_check.mjs): 16/16 PASS.
- Screenshots: checks/fx_mirror.png, checks/fx_automask.png, checks/fx_colorize.png, checks/fx_webcam.png (live fake feed), checks/fx_webcam_denied.png (slate), checks/clip_params_builtin.png, checks/clip_params_webcam.png, checks/clip_params_knobs.png, checks/node_details.png.
- Known limits: webcam needs HTTPS/localhost or Electron for getUserMedia (browsers block it on file://); import names capped at 40 chars; float uniforms only (vec parked, stated in UI); iChannel unsupported (plain-English message on drop).

## Perf/stability audit (2026-10-08 — checks/perf_audit.mjs, perf_soak.mjs, perf_pixdiff.mjs)
- Baseline frame breakdown (45 frames, typical load: 4 layers firing, autopilot on, FX nodes, clip selected): updatePreview **2864ms/frame** dominated everything (full layer-graph eval + 518KB readPixels EVERY frame while a clip is selected). autopilotTick 2.74ms/frame traced to quantum-boundary DOM sync (syncDeckSel on column fire) — per-event, not per-frame; left alone. Post chain did 6 fullscreen passthrough draws when FX bypassed.
- Fixes (all pixel-neutral, verified 0.000% diff): post-chain FX now return their output texture and skip the draw when bypassed (loop() threads `pc` through renderGrade); strobe uniforms moved before quadDraw in renderGrade (real 1-frame-lag bug); preview throttled to every 3rd frame via dedicated `pvTick` counter (the fps `frames` counter resets every 0.5s — not usable), skipped while node editor open; allocation hoists (renderCombine op/bl/en arrays, evalGraph wire cache per graph revision, updatePreview savedFb/2D-ctx, pollAudio closure-free); opt-in Auto resolution (Auto step-down 1920→1280→960 on sustained slow frames, step-up on fast frames; manual modes untouched, Auto NOT default).
- Deliberately NOT done: node-graph static skip (inapplicable — everything is time-driven via u_time); feedback bypass draw (owns temporal ping-pong state); autopilot DOM sync (per-event, not jank); preview FBO kept full-res (readPixels cost is the call, not the size — throttling was the lever).
- After: updatePreview amortized 2864→1400ms/frame (-51%); readPixels 1.02→0.33 calls/frame, 530KB→169KB/frame (-68%); drawArrays 30.2→17.7/frame (-41%); bindFramebuffer 41.9→27.4 (-35%); zero page errors.
- Pixel-diff (perf_pixdiff.mjs, frozen performance.now, before-version from GitHub main verified pre-fix): **0.000%**, 3/3 pass. Screenshot: checks/perf_after.png.
- Soak (perf_soak.mjs, 60s, ~60 actions: random fires, selectClip, node dive/return, preset snapshot/apply, postBypass toggles): **5/5** — zero page errors, zero GL errors (getError()=0), heap 10MB→10MB, FBO created +1/deleted 0 (bounded), engine alive (shFrame 66→70). Harness note: the stock `frames` counter resets every 0.5s for the fps meter, so the liveness check uses monotonic `shFrame` instead.
- Regressions after perf work: import 32/32 (two expectations updated: srcCount is 6/7 now, not 5/6 — the check predated the webcam source; the reloaded-fire check now waits on the quantize boundary instead of a fixed 1.2s sleep), preview 14/14, tab 16/16, content_wave 34/34. node --check + acorn clean on all 19 script blocks.
- SwiftShader runs ~1fps headless — all timings are RELATIVE; his real GPU is ground truth.

## Clip inspector window (2026-10-08 — checks/clip_inspector_check.mjs)
- NEW: clicking any clip (name OR box) opens a dedicated **Clip** inspector — a separate window/panel, not a tab. The COMPOSITION/LAYER/CLIP tab strip is untouched.
- Placement: right-side slide-over docked inside #lowerzone (absolute, overlays the browser/props area, `translateX(103%)` hidden → `.open` slides in). Why: the deck lives above in #gridzone, so the deck grid is never reflowed or covered (verified: deck width 1600→1600 on open); fixed overlay = zero layout shift; transient by design (dismiss on X/ESC/deck-background click).
- Content: header (Clip title + close X), identity `CLIP L2 · C4`, source name, live FIRED/QUEUED/SELECTED badges; Source section (full source selector incl. imports + webcam); Parameters section built by the SAME `buildClipParamSection`/`paramRow` builders as the Clip tab (MIDI-learn + macro-assign free); Trigger section (quantize info + Fire button, disabled on empty slots).
- Behavior: name-click selects + opens; box-click fires (quantized) + opens; another clip switches the inspector; empty slot opens a clean empty state (source selector + hint, Fire disabled — documented choice); X/ESC closes (ESC not hijacked in node view — diving closes the inspector); deck-background click dismisses; badges sync via syncDeckSel without rebuilding (slider drags survive); buildDeck/preset/source changes refresh the inspector; entering node view or perform mode closes it. Autopilot/column/MIDI fires never open it (hook is at the DOM click handler, not fireClip).
- Verification: **24/24 PASS, zero page errors** — open/switch/fire/badges/X/ESC/empty-state/dismiss/import-knobs (SH5.mySpeed data-ctrl present, MIDI-learnable)/preset round-trip/no-reflow. Screenshot: checks/clip_inspector.png.
- Known limits: inspector sliders snapshot param values at open (same as Clip tab — no live cross-sync while open); ESC in node view keeps its existing closeNodes meaning; the panel covers the Effects/Sources browser while open (dismiss to reach it).

## Version stamp + FPS meter + auto quality scaling (2026-10-09 — checks/quality_check.mjs, quality_pixdiff.mjs)
- Motivation: Joshua reported "super slow and laggy" on his real laptop; the earlier perf audit was headless/SwiftShader (relative numbers only). His machine is ground truth — the app now adapts on-device, and the version is always visible (ends "what am I running?" confusion).
- **Version stamp**: `const APP_VERSION='1.2.0'` at the top of the first script block (one-line bump per release); shown in the top bar next to the HoloMapper brand (`#appver`, `v1.2.0`).
- **FPS meter**: rolling 1s average + effective render scale, always visible in the top bar: `60 fps · 1.0x`.
- **Quality selector** (replaces the old resSel resolution picker): Auto (default) / High / Medium / Low. Controls the internal render-scale multiplier; the display canvas always stays at the full 1280x720 base (final composite never shrinks).
  - High=1.0x (1280x720 targets), Medium=0.75x (960x540), Low=0.5x (640x360).
  - Auto: steps down 1.0→0.75→0.5 when fps < 45 sustained ~3s; steps back up when fps > 57 sustained ~10s; 5s cooldown after every step + split thresholds = hysteresis, no thrash. Manual pins the scale, skips auto logic.
  - Old S.res/autoRes/AUTO_STEPS removed; S.quality ('auto' default) persists via saveState/localStorage; presets no longer touch quality (device preference, not preset state; old snap.res ignored).
  - The effective scale is visible next to the fps meter and in the Quality control's tooltip.
- Verification: **27/27** (checks/quality_check.mjs) — version stamp, fps ticks, Low/Med/High target sizes (640x360 / 960x540 / 1280x720) with canvas pinned at 1280x720, Auto stepped 1.0→0.5 on sustained ~1fps headless, persistence across reload, Tab toggle + clip inspector regression, zero page errors. **Pixel-diff at 1.0x vs pre-quality baseline: 0.000%** (3/3, frozen time). Screenshot: checks/quality_topbar.png (v1.2.0 stamp, `1 fps · 0.75x`, Medium selector).
- Known limits: auto starts at full scale each load and adapts within seconds (no persisted auto-scale); the dt accumulator caps at 0.5s/frame so sub-2fps slideshows adapt slower — irrelevant on real GPUs.

## Imported-shader knob expansion (2026-10-09 — checks/knob_expansion_check.mjs)
- Motivation: Joshua — "specifically with the imported shaders even [no parameters or knobs]". The scanner only saw `uniform float`, so most Shadertoy-style shaders showed zero knobs.
- **Uniform-type mapping** (`scanShaderUniforms` now returns `{name,type,init}` descriptors):
  | GLSL | knob | param id | range | default |
  |---|---|---|---|---|
  | `float` | slider | `SH<idx>.<name>` | 0–1 | 0.5 (or initializer, clamped 0–1) |
  | `int` | stepped slider | `SH<idx>.<name>` | 0–10 | 0 (or clamped init) |
  | `bool` | toggle | `SH<idx>.<name>` | off/on | off (or init) |
  | `vec2/3/4` | per-component sliders | `SH<idx>.<name>.x/.y/.z/.w` | 0–1 | 0.5 (or init components) |
  Reserved i*/u_* uniforms never knobbed. Old string-format `uniforms` arrays normalize via `normUniform()` (treated as float) — old presets/localStorage load unchanged.
- **Initializer defaults**: an initializer sets the knob default, clamped into the knob's range (float 2.0 → 1.0; vec3(1.0,0.5,0.0) → per-component). NOTE: `uniform float x = 2.0;` is invalid GLSL ES (uniforms can't have initializers — verified `'uniform': cannot initialize this type of qualifier`); in practice initializer defaults arrive via the const-float conversion below. Compile-failure behavior for genuinely broken shaders is unchanged.
- **const float / #define → uniform conversion** (`convertConstFloats`, runs before compile): global `const float NAME = <literal>;` becomes `uniform float NAME;` with the literal as knob default; simple `#define NAME <float-literal>` (float-looking literal only) likewise. Skipped when: not global scope, used as array size/index (`[...]`), used as a loop bound, used in another const's initializer, reserved name, or (for #define) any `#if`/`#ifdef` present in the file. If the converted source fails to compile, import falls back to the original source (no const knobs) — a compiling shader can never break.
- **Always-on Time Speed**: every import gets `SH<srcIdx>.timeSpeed` (0–2x, default 1x) scaling the iTime the shader sees (`u_time` is `#define`d as iTime). The one knob every import gets regardless.
- **Honest empty state**: zero-tunable-uniform shaders show Time Speed + "No tunable uniforms found — add `uniform float myParam;` or `const float myParam = 0.5;` to your shader and re-import to get knobs." Never a blank panel.
- `paramRow` gained an optional step arg (int knobs use 0.1). All knobs MIDI-learnable + macro-assignable through the existing builders. Re-import dedup compares converted + raw forms (no duplicates); updated code creates a new entry.
- Verification: **36/36** (checks/knob_expansion_check.mjs) — typed knobs registered with correct defaults, all MIDI-learnable, knobs drive the render, const/#define conversion with literal defaults, unsafe array-size const skipped with shader still compiling, preset round-trip of knob values, re-import dedup/update, zero page errors. Regressions: import 32/32 (two stale expectations updated for the new behavior), tab 16/16, content-wave 34/34. Screenshots: checks/knobs_typed.png (speed/octaves/invert/tint.xyz/center.xy/Time Speed), checks/knobs_empty.png (Time Speed + empty-state note).
- Known limits: `uniform` initializers are a compile error in GLSL ES (unchanged loader behavior); int range is fixed 0–10; `#define` function-like macros never converted.

## Mobile v5 — touch-first redesign (2026-10-10/11 — checks/mobile_v5_check.mjs)
- Joshua: "UI sucks I can't scroll around... doesn't have to feel so much like holo mapper." Rebuilt mobile.html chrome ONLY (engine blocks untouched; holomapper.html md5-verified unchanged).
- New shell: bottom tab bar (Play/Clips/FX/Mix/Map, 62px targets, safe-area insets), dark glowing HoloWatts vibe (violet→cyan→pink, not broadcast console).
- Play: live preview, 4 layer chips (hue glow, fired dots), 8 big clip fire buttons w/ NEW beat quantize (QUANT toggle, default ON; pendingFire executes on next beat-index in loop()), transport (TAP/BPM/÷2/×2/SYNC/PAUSE/BLACKOUT), beat-sync checkbox, master fade slider.
- Clips: column fire row (C1-C8 horizontal scroll), layer chips, vertical scrollable 2-col clip cards (tap fires, long-press reassigns via clipmenu).
- FX: 5 big toggle cards w/ chunky sliders — Trails (Amount/Zoom), Kaleido (Slices/Spin), RGB Split (Amount), Color (Saturation/Contrast, always-on), Strobe (Rate). NOTE: mobile engine is v1.2-era — desktop's Mirror/Auto Mask/Colorize/Bloom are NOT in this engine; porting them is a separate engine task, not faked.
- Mix: 4 layer rows (opacity slider + solo/bypass), master, 8 big macro sliders, presets (save/load/delete), setup (resolution, MIDI learn, audio + meters).
- Map: projection mapping fully kept (surfaces, corner handles, mask, nudge, test pattern, hide-panel FAB).
- Scroll fix: every tab is its own native scroll container (overflow-y:auto, -webkit-overflow-scrolling:touch, overscroll-behavior:contain, touch-action:pan-y); canvas keeps touch-action:none for map handles; buttons manipulation; sliders pan-y. No global touchmove preventDefault anywhere.
- Safe overrides for kept engine callers: buildPostFx→buildFxCards, buildMaster→noop, buildPerform→noop, renderMidiList→status line, buildDashKnobs→buildMixMacros, syncDeckSel/buildDeck→syncNewUI, selectLayer/selectClip (no tab-hop).
- Quantize robustness fix found by the harness: beat-phase wrap detection failed when frames < beats (headless 2fps); replaced with beat-index comparison — fires on first frame of a new beat at any framerate.
- Verification: node --check + acorn clean (15 blocks); **28/28 PASS** phone viewport (390×844, mobile UA, touch) — tap fires clip + pixels change, quantize pending→beat fire, swipe scrolls (scrollTop delta), all 5 tabs switch, FX toggle changes pixels, macro + opacity sliders drive params, preset save/load round-trip, zero page errors. Screenshots: checks/mv5_{play,clips,fx,mix,map}.png.
- Known limits: headless SwiftShader ~2fps — real phone GPU is ground truth for feel/scroll physics (flag, don't assert); MIDI list UI demoted to status line (bindings still work); plugin editor hidden (kept as hidden textarea so saved plugin code still compiles); node graph editing stays desktop-phase.

## Prism Cam FX port (2026-10-10/11 — checks/prism_fx_check.mjs, mobile.html only)
- Ported 24 of Jaiye's Prism Cam FX (github.com/Dawnjaiye/Dawnjaiye, docs/index.html FS_FX uber-shader) into mobile.html. Credit comment at top of SRC_PRISM + this entry — it's Jaiye's code.
- ARCHITECTURE: one new SRC_PRISM fullscreen pass between glitch and grade (postT[1] -> postT[2] -> grade), NOT a replacement of mobile's engine. Each FX = own uniforms + S.postBypass['px_'+key] toggle + amount param (P.px_*), following mobile's existing per-FX pass conventions. u_bypass copies through when nothing is on.
- Ported: swirl, bulge, wave, pixelate, VHS, hue cycle, posterize, duotone, invert, contour(edge), scanlines, grain, vignette, spin, tunnel, pulse, flow, drift, starfield, rays, shake, prism, plasma, halftone. GLSL math kept identical to Jaiye's; adapted to mobile naming (u_tex/v_uv/O).
- Skipped (already covered): kaleido, trails/echo, rgb split, glitch, feedback. Mirror not ported (not in scope list; trivial to add later).
- Vignette + grain MOVED from the grade pass into the prism pass (P.vig/P.grain param ids kept — old presets carry over; maps now 0..1 direct, defaults 0.3/0.2). Cards default ON to preserve the old look; all other 22 default OFF. Master panel no longer has dup sliders.
- FX tab now grouped like Prism Cam: Warp / Time / Color / Look / Motion — 29 cards total (5 existing + 24 new), group headers, still native-scroll.
- Perf: one extra fullscreen pass always in chain (single texture fetch when bypassed); per-effect branches are `if(u>0.001)`-guarded like Jaiye's. Headless SwiftShader ~1-2fps as before — his phone is ground truth.
- Verification: node --check + acorn clean (15/15). Phone viewport 390x844: **24/25 PASS** — 24/24 FX toggle->uniform flips via real DOM clicks, 13/13 static-FX pixel diffs (decoded in-page, stage-clipped), slider->uniform, 29 cards, 5 groups, FX tab scrolls, preset round-trip, zero page errors. The 1 "fail" (plasma on-vs-off pixel diff) is scene-drift noise at 2fps SwiftShader — plasma's uniform wiring passed and the screenshot shows it rendering clearly.
- Screenshots: checks/px_fx_tab.png (grouped FX tab), px_swirl_on.png, px_halftone_on.png, px_plasma_on.png.
- holomapper.html untouched (mtime 2026-10-09, pre-session).
- Known limits: default-on Grain/Vignette cards preserve old look; old mobile presets' vig/grain values render slightly differently (new formulas); starfield's 60-iteration loop is the heaviest single effect on weak GPUs.

## Factory reset button (2026-10-10 — checks/reset_check.mjs)
- NEW: **RESET EVERYTHING** in Mix tab > Setup (bottom of the section, `.dbtn#btnResetAll`). Idle = quiet dark button ("Reset everything to default"); first tap arms it (red gradient, pulsing glow, label "TAP AGAIN TO CONFIRM — clears everything"); second tap within 5s clears all persisted keys + `location.reload()`. Tapping anywhere else or the 5s timeout disarms.
- Keys cleared: `holomapper.state.v1` (all params/FX/clips/layers/resolution), `holomapper.midi.v1` (bindings), `holomapper.presets.v1` (saved presets), `holomapper.mobile.seen` (first-run flag — its absence re-triggers the factory first-run path, which is the correct factory behavior).
- Verification: **16/16 PASS** — non-default state built (fired clip, swirl prism FX on, macro moved, res changed, preset saved), arm clears nothing, elsewhere-tap disarms, confirm reloads to true defaults (bpm 120, res 960x540 first-run, swirl bypassed, macro 0.5, preset gone, fired synced to factory [0,2,1,3] as init() does on every boot), zero page errors. Screenshot: checks/reset_armed.png.
- Known limits: none — destructive action is two-tap gated and the reload guarantees no stale in-memory state.

## Mobile v6 — desktop-paradigm deck (2026-10-11 — checks/mobile_v6_check.mjs, mobile.html only)
- Joshua: "Holomapper mobile should look a lot like the desktop version and operate similarly but adding the new features with the cam connection as a source and make it fit for a phone." Supersedes v5 phone-idiom chrome. Engine blocks kept; UI shell rebuilt; holomapper.html untouched (mtime 2026-10-09, no v6 markers — its camFlip hits are its own pre-existing webcam code).
- Deck: 4 layer strips x 8 clips, horizontal strip scrolling, 48px+ targets. Name tap = select + inspector bottom sheet; box tap = fire (beat-quantized, QUANT default ON). Column fire row C1-C8. Transport: TAP/BPM/÷2/×2/SYNC/PAUSE/BLACKOUT + autopilot (columns L→R). Inspector sheet: identity, live preview monitor, 6 source chips, params (incl. camera facing/flip), Fire/Clear. FX browser sheet: all 29 (5 original + 24 Prism Cam) grouped Warp/Time/Color/Look/Motion, big toggle cards + chunky sliders. Mix sheet: layers + 8 MIDI-learnable macro sliders + master. Setup sheet: presets, MIDI learn, audio, resolution, factory reset (kept). MAP sheet kept (projection mapping). Desktop semantic colors (teal/amber/red), native scrolling, no global touchmove preventDefault. Node-graph editing stays desktop-only.
- NEW camera source (index 5): getUserMedia → hidden video → per-frame texImage2D, shared camTex across layers; rear preferred (facingMode environment) with front/rear toggle + mirror-flip param; denial → toast + "NO CAMERA" slate (never black); HTTPS note in UI for the file:// limitation. Engine edits: LAYER_SRC/SRC_DEF/clDiscMap/PARAM_HOOKS/validClips/applySnapshot extended ÷5; SRC_CAM shader + PROG.cam; renderLayer refactored → renderSourceInto(sidx,i,t,T) with camera branch (preview monitor reuses it).
- Real bug found by the harness: preview monitor readPixels hit GL 1282 INVALID_OPERATION — pvT was RGBA16F (makeTarget uses float when EXT_color_buffer_float) and WebGL2 forbids RGBA/UNSIGNED_BYTE readback from float targets. Fix: makeTarget gained optional 4th `byte` param; buildPreview uses makeTarget(192,108,0,true) → RGBA8. No other callers changed; the one readPixels in the file is the preview.
- Verification: node --check + acorn clean (15/15 blocks); **35/35 PASS** phone viewport (390×844, mobile UA, touch, fake camera device): zero page errors; name-tap selects + opens inspector; box-tap fires quantized (queue persists at 60s beats, lands when quant off); column fire sets colFired + lights button; camera goes live on fake device, fires, renders non-black (direct renderSourceInto(5)→readPixels pixel check); denial path verified 4/4 in a dedicated run (checks/cam_deny.mjs, --deny-permission-prompts): camState='denied', plain-English toast, "NO CAMERA" slate renders (not black), zero page errors; all 5 FX groups reachable + toggle flips uniform + pixel diff; macro slider drives param; preset save/load round-trip; factory reset still arms/confirms; layer strips scroll horizontally (scrollLeft delta). Screenshots: checks/v6shots/{shot_deck,shot_inspector,shot_camera,shot_fx}.png — shot_camera shows the fake-camera feed live in the inspector preview.
- Test artifacts worth knowing: (1) favicon 404 console error filtered in harness (self-contained file, no favicon link). (2) At 1fps SwiftShader the render-loop preview cadence (every 6th frame) is too slow for wall-clock waits — the camera pixel check renders directly instead. (3) Quantize queue check uses 60s beats — at 30 BPM the queue could legitimately land on a beat boundary inside the 400ms read window even on real hardware. (4) One unexplained Chromium target crash mid-run, never reproduced — treated as flake. (5) /tmp wiped mid-session by a VM event — harness paths moved to checks/v6shots/.
- Known limits: headless SwiftShader ~1fps — his phone GPU is ground truth for feel; camera untested on real device hardware (permission flow, rear/front switching); `gl.getTexLevelParameter` is undefined on this Chromium's WebGL2 (unused — noted only).

## Layer V fader + mix modes on strips (2026-10-11 — checks/fader_desktop.mjs, fader_mobile.mjs)
- Joshua: "big opacity fader on the left side, and then the mix modes... bring that back." Resolume's strip idiom, both platforms.
- Desktop (holomapper.html): `.lstrip` grid is now `[54px fader | 196px gut | clips]`; each strip's left edge has a full-height vertical fader (writing-mode:vertical-lr, % readout, blend select beneath). Drives the existing `L{i}.op` param — same data-ctrl, CTRLS registration, MIDI-learn; the small `.lop` slider in `lrow2` is GONE (replaced, not duplicated). `SYNC_FN['L{i}.op']` keeps the % readout live when MIDI/macros drive it.
- Mobile (mobile.html): strips are `[56px fader | body(head + h-scroll clips)]`; fader has `touch-action:pan-x` so vertical drags own the gesture while clip strips still scroll horizontally; compact blend select beneath. Same `L{i}.op` param plumbing + MIDI-learn. (Edited the live v6 buildDeck at 3911; the dead 2909 buildDeck left untouched.)
- Verification: desktop 14/14 (structure, vertical geometry, MIDI CTRLS+data-ctrl per strip, REAL mouse drag up raises opacity + readout follows, opacity pixel diff, blend Add vs Normal pixel diff, zero errors); mobile 13/13 (structure, touch drag raises opacity, touch-action pan-x, cstrip h-scroll intact, blend select, opacity pixel diff, zero errors). Screenshots: checks/fader_desktop.png, checks/fader_mobile.png.
- Harness notes: headless needs a 1600x1000 desktop viewport (#gl sits below the fold at 800x600, element screenshots come back blank); the sticky transport bar can overlay the bottom of the L1 fader at small heights, so drag tests aim at the fader's upper third; don't run both harnesses in one puppeteer browser (this old puppeteer-core flakes on second-page evaluate — run separately).
- Known limits: fader is full strip height (~100px), not full window height — Resolume's V fader is taller, but the strip is the fader's natural home here.

## Dockable panels (2026-10-11 — checks/dock_check.mjs)
- Resolume-style docking on desktop: #main is now a vertical stack of rows; each row holds 1+ columns; each column holds a vertical stack of panels. 5 dockable panels: Deck, Transport, Monitors, Properties (tabs + dashboard dials), Browser.
- Grip design: slim 20px header bars with ⠿⠿ grip + title on Deck/Monitors/Properties/Browser; Transport keeps its 32px bar with an inline ⠿⠿ handle at the left (no extra header). Pointer-based drag (6px threshold), ghost clone follows cursor, teal insertion indicator shows the exact snap spot.
- Drop model: over a panel → insert before/after in its column, or new column via the panel's left/right 18px edges; over a column's empty space → append; over a row's top/bottom 14px edge (checked first) → new row; column edges → new column. Empty rows/columns pruned after each drop.
- Default layout reproduces today's arrangement exactly: row1 Deck (auto), row2 Transport (32px), row3 Monitors 392px | Properties 1fr | Browser 228px.
- Persistence: `holomapper.dock.v1` in localStorage, `{rows:[{h,cols:[{w,panels:[{id,size}]}]}]}`; validated on load (exactly the 5 ids). Reset layout button in topbar (two-step arm) restores default.
- Bonus: draggable column dividers between columns (drag pins px widths into the model).
- Clip inspector re-anchored from #lowerzone to #main (absolute, unchanged behavior); #lowerzone removed. Perform-mode CSS rewritten for the dock structure (only monitors visible).
- Bugs fixed during verification: (1) `$('transport')` re-query returned null because the element had already moved into the detached wrapper — now uses a direct reference; (2) circular JSON (`_el` DOM refs on the layout model) broke stringify in drag-start/save — now serialized with a replacer skipping `_el`; (3) row-edge drop zones were unreachable behind panels/columns — row edges now take priority in the hit test.
- Verification: **17/17 PASS, zero page errors** — default layout, wrap/anchor checks, mid-drag indicator, drop snap (Properties after Monitors), divider resize (392px→462px), persistence across reload, reset, deck moved to new bottom row (old row pruned), clip fires after move, Tab toggle both ways, perform mode shows only monitors. Screenshots: checks/dock_default.png, checks/dock_midrag.png, checks/dock_moved.png.
- Known limits: heads are drag-only (no double-click to float); no row-height dividers; touch-action:none on heads (fine for touch laptops); dropping onto the 14px row edge always wins over panel insert at the same spot (indicator makes it explicit).

## Chunky V faders + Clip as 6th dockable panel (2026-10-11 — checks/chunky_clip_check.mjs)
- **Task 1 — chunky custom V faders**: replaced the thin native `writing-mode: vertical-lr` range inputs with a custom pointer-drag component (`buildVFader`): 36px wide, full strip height, 12px track with teal fill, 32×46px grab handle, pointerdown/move/up with setPointerCapture, click-to-jump, `%` readout beneath, keyboard arrows/Home/End (focusable, role=slider, aria). Drives the existing `L{i}.op` plumbing unchanged: `data-ctrl`, `CTRLS['L{i}.op']`, `SYNC_FN` (now calls `elm._vfPaint(v)`), MIDI-learn capture-phase handler intercepts before drag (fader never moves during mapping), Layer-tab slider cross-syncs both directions. Strip background click handler now ignores `.vfad` so fader drags don't dismiss the inspector. Dead `.lop`/`.vfader` CSS removed.
- **Task 2 — Clip inspector is the 6th dockable panel**: `DOCK_IDS` now `['deck','transport','monitors','proptabs','browser','clip']`; `#clipinsp` wrapped by `dockWrapPanels` like the others (dockhead grip + "Clip" title). Old slide-over code removed: absolute/translateX CSS, `.ci-head`/X button, `.open` class toggling, `$('cix')` listener. Default layout: right column (300px) stacks Browser + Clip under each other (preserves the old right-side feel). `openClipInspector` updates in place; `closeClipInspector` clears to the empty state ("Select a clip to inspect" + hint); ESC/perform/node-view semantics unchanged (they now clear to empty state). **Migration**: `dockLoad` accepts valid 5-panel layouts and splices `{id:'clip'}` after Browser (falls back to last column); anything else invalid → default.
- Verification: **27/27 PASS** (`checks/chunky_clip_check.mjs`, real mouse events, 1600×1000) — 4 chunky faders, drag down/up moves `L0.op` (0.250/0.952) with readout following, MIDI learn captures `L0.op` and fader doesn't move (one harness assertion fixed mid-run: `pendingCtrl` is a script-lexical binding, not on `window` — product code was correct), ArrowDown keyboard, 6 dock panels with grip, empty state, clip click populates in place (no transform), second clip switches, ESC → empty state, drag Clip panel persists across reload, 5-panel migration lands clip after browser, reset restores 6-panel default, zero page errors. `node --check` + acorn clean 20/20.
- Screenshots: `checks/chunky_deck.png` (chunky faders + docked Clip empty state), `checks/clip_docked.png` (Clip panel populated, FIRED/SELECTED badges), `checks/clip_empty.png`.
- Known limits: fader is strip-height (~110px min), not full-window — the strip is its natural home; handle drag uses pointer capture so mid-drag the cursor can leave the strip safely.

## Mobile chunky V faders + desktop clip transition time (2026-10-11 — checks/trans_check.mjs, checks/trans_mobile_check.mjs)
Joshua: "resolume has like another slider for transition controls and wtf the faders arent faders...there still stupid little slider dots." (He was on mobile, which still had the thin native vertical range inputs; desktop chunky faders were already live.)
- **Task 1 — mobile.html chunky V faders**: ported desktop's `buildVFader` component (touch-adapted: 40×54px handle, ≥48px touch target, `touch-action: pan-x` so vertical drags own the gesture without fighting strip scroll, teal fill, `%` readout, role=slider/keyboard support). Same `data-ctrl="L{i}.op"` + `CTRLS` + `SYNC_FN` (`_vfPaint`) plumbing, so MIDI learn and macros stay in sync. Old `.vfader` native inputs removed (no duplicates); old CSS replaced with the chunky `.vfad*` component styles.
- **Task 2 — desktop clip transition time + engine crossfade**: new per-layer param `L{i}.trans` (0–4s, default 0 = hard cut), MIDI-learnable, in presets/state. UI: compact horizontal slider in each strip's left column under the blend select with live `Xs` label, plus a Transition `paramRow` in the Layer properties tab. Engine: `fireClipNow` snapshots the layer's current output into a per-layer hold target (`transHoldT`, `blitFramebuffer`) when `dur>0` and a different clip was playing, then `renderTransMix` mixes hold→live each frame with a smoothstep ease via the new `SRC_TRANSMIX` shader into a scratch target blitted back over `layerT[i]`. At `trans=0` the fire path is exactly today's hard cut. Transition starts at the actual fire moment (quantize-delayed and autopilot fires land through `fireClipNow`); eject never transitions (cut); bypass/solo don't touch it; quality-scale rebuilds clear in-flight transitions (targets realloc).
- Verification desktop: **23/23 PASS** (`checks/trans_check.mjs`) — param registered, default 0, map 0..1→0..4s + `0.5s` fmt, strip slider + Layer-tab row exist, trans=0 hard cut (no transX), mid-transition frame differs from both outgoing and incoming (mad 0.156/0.143 — a true blend), never black-frames, settles exactly on the incoming clip after completion (mad 0.000), re-fire same clip and fire-after-eject start no transition, MIDI learn captures `L0.trans`, preset round-trip preserves 0.5, chunky-fader regression (4 `.vfad`, 0 native `.lop`), zero page errors. `node --check` + acorn clean on both files (20 + 15 script blocks). Two harness lessons: layer targets are RGBA16F — readback must use RGBA/FLOAT (byte readback throws 1282); SwiftShader wall-clock races vs the rAF loop need the transition window widened in-test (`transX.dur=400`) and quality pinned to `high` (auto-stepping rebuilds targets and clears transitions — correct product behavior).
- Verification mobile: **10/10 PASS** (`checks/trans_mobile_check.mjs`, 390×844 touch emulation, CDP touch events) — 4 chunky faders, 0 native `.vfader` inputs, ≥48px handle, `touch-action: pan-x`, touch-drag up moves `L0.op` 0.20→1.00 with readout at 100%, clip strip still scrolls beside the fader, MIDI learn captures `L0.op`, zero page errors.
- Screenshots: `checks/trans_strip.png` (desktop strips with trans sliders, L1 at 1.4s), `checks/trans_mobile_faders.png` (mobile chunky faders), `checks/trans_mid.png` + `checks/trans_mid_crop.png` (mid-transition blend: magenta Tunnel warp over teal Nebula in the output monitor).
- Known limits: transition is a frozen-frame crossfade (outgoing clip freezes at fire moment; incoming animates live) — chosen over double graph eval for perf (2x cost avoided); at ≤0.1s the ease still runs but reads as a cut; eject during a transition drops it (cut, by design).

## Clip UX fixes (2026-10-11 — checks/drop_clip_check.mjs)
- **Bigger clip-name click targets**: `.cname` went from 8px type / ~11px tall to 11px type with 8px vertical padding (~30px click height, ~3x). The whole name row is clickable (it always was — the div spans the strip width; now it's a fat target). Deck clips get taller; expected.
- **Per-clip shader drop highlight**: the fullscreen `#drophl` overlay is GONE (element + CSS removed). Dragging shader files now highlights ONLY the hovered `.clip` (teal `.drophl` glow, matching selection language). Flicker-free via `closest('.clip')` change-detection + `relatedTarget` check on dragleave.
- **Drop on a clip** → new `loadShaderFilesOnto(files,i,k)`: imports via the same `importShader` path (Sources entries, toasts, compile-failure handling unchanged), assigns the FIRST import to that exact slot, `selectClip` + inspector update + quantized `fireClip`. Empty `+` slots are valid targets.
- **Drop elsewhere** (deck bg, panels): unchanged old behavior (`loadShaderFiles` → first empty slot on selected layer + auto-fire). Non-shader files: toast only, nothing imported. Dashboard-dial `text/hm-param` drops untouched (separate listeners, `hasF` gate).
- Verification: `node --check` + acorn 20/20 clean; **14/14 PASS** — cname ~30px, edge-of-row click selects, no `#drophl`, exactly-one-clip highlight, highlight moves between clips, leaving clears it, drop-on-clip imports+assigns+selects, bg-drop old behavior, non-shader no-op, zero page errors. Tab-toggle regression 16/16 still green. Screenshots: checks/drop_cname.png (bigger names, import toasts), checks/drop_highlight.png (single teal clip glow, no overlay).
- Known limits: none functional. Mid-drag the clip grid isn't rebuilt, so the highlight reference can't go stale before drop.

## Mobile deck visual polish (2026-10-11 — checks/polish_check.mjs)
- Ground truth: Joshua's phone screenshot (white native blend dropdown, muddy fader, yellow/amber clash).
- Blend select: fully dark now — `appearance:none`, #14161c background, custom SVG chevron, 44px touch height; `color-scheme:dark` on :root so Android's popup renders dark too.
- Fader: recessed near-black track w/ inner shadow, teal gradient fill + glow, dark handle (#22262d→#121418) with 3 crisp grip lines (teal center), % readout now 11px bright tabular.
- Accent unification: FIRED clips glow in their layer's hue (border + tinted box + glow via --lhue); SELECTED-not-fired keeps the 2px teal outline; amber removed from all clip states (stays on bypass = warning). Documented choice in CSS.
- Strip header: consistent 10px padding, tbtn bumped to 44px, bright/dim text hierarchy kept.
- Transport: TAP + [120 BPM] joined as one pill unit; tab bar active state gets teal top-edge + glow.
- Verification: 11/11 PASS (phone viewport, touch) — dark select asserted via computed style, select changes composite, fader touch-drag drives opacity w/ readout, fired border = L1 red rgb(240,95,76), name-tap select, tab sheet, strip scroll, zero page errors. Screenshots: checks/polish_deck.png.
- mobile.html only; desktop untouched. Not pushed.

## Live clip thumbnails (2026-10-12 — checks/thumb_check.mjs, checks/thumb_mobile_check.mjs)
- **Desktop (holomapper.html)**: every non-empty `.cthumb` now shows a 160x90 canvas snapshot of its actual visual, rendered through the exact same path as the preview monitor (new shared `renderClipSource(i,t,src,T)` — node-graph w/ source override + NRUN feedback snapshot/restore, else `renderLayerInto(i,t,T,src,true)`; `updatePreview` refactored onto it, pixel-identical behavior). Shared `blitTargetFlipped` for readPixels + vertical flip. Source name stays as a small overlay label (`.thlab`, gradient scrim); empty `+` slots unchanged.
- **Amortization**: `thumbQueue` drains 2 renders/frame in the main loop (skipped while node editor open); after warmup per-frame cost is zero. Pixels cached per (layer,slot,src,graphRev) as ImageData — deck rebuilds repaint instantly; node-graph edits bump `g.rev` (touchGraph) so `closeNodes` re-queues that layer's thumbs automatically. New imports = new src index = natural invalidation; failed shaders render the engine's dark slate, never break the queue.
- **Perf (SwiftShader headless — relative numbers only)**: isolated thumb = ~65ms render+sync+readback at 160x90 (readback forces the sync; blit alone 0.2ms), plain frame 16ms; warmup fps 2.0 -> calm 16.5. On real GPUs a thumb is ~1/9 the pixels of the preview's already-amortized 480x270 update — negligible; 32-clip warmup ≈ 16 frames (~0.3s @60fps).
- **Mobile (mobile.html) — PORTED, not a follow-up**: engine exposes `renderSourceInto(sidx,i,t,T)`, no graphs; 128x72 thumbs via the same queue/cache pattern (key = layer,slot,src; no imports on mobile). Hooked into `loop()` after `renderMap()` and the live `buildDeck()` (the dead v5 copy at ~2953 untouched). Dead `.cbox` text replaced by canvas + `.thlab` label; polish CSS (dark selects, fader, accents) intact.
- Verification: acorn 20/20 + 15/15 clean. **Desktop 19/19** — 32 canvases/labels, queue=32 on build, drain, Tunnel/Flow/Nebula thumbs pairwise different (mad 0.05-0.25), thumb == manual `renderClipSource` at fixed t pixel-exact (mad=0), drop-assign magenta shader thumb rgb=(1.00,0.05,1.00), clear slot removes thumb / `+` returns, bad-shader import no errors, thumb-click fires, name-click selects, preview still live, zero page errors. **Mobile 11/11** (390x844 touch) — 32 thumbs, queue/drain, thumbs differ (mad=0.097), path pixel-exact, box-tap fires, name-tap selects, clear removes, zero errors. Screenshots: checks/thumb_deck.png (desktop, full visual deck), checks/thumb_mobile_deck.png (phone deck).
- Known limits: thumbs are static snapshots (animated sources show a representative frame, like Resolume); webcam-source thumbs snapshot the current camera frame at render time; layer-param tweaks (speed/hue) don't re-render thumbs — source/graph changes do.
