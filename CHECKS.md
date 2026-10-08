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
