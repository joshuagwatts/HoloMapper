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
