# HoloMapper Windows app v1.0.0 — BUILD NOTES

## Source
- Pinned from `~/workspace/holomapper/holomapper.html` (repo commit `ee2b809` — node graph editor build, 2026-10-08).
- Copied to `holomapper-app/app/index.html` on 2026-10-08. No modifications to the engine.

## What's inside
- Resolume-style deck UI (4 layers, fireable clip slots, right properties panel, top composition bar, bottom macro dashboard)
- Cloner 3D v1.2 spectral (GPU-instanced, 14 meshes, ACES, dispersion, iridescence, bloom)
- TouchDesigner-style node graph editor ("dive-in": double-click a layer name or press N, ESC back to deck)
- Web MIDI learn, 8 macro knobs, ShaperBox-style modulators, audio reactivity, presets
- WebGL2 engine, self-contained (zero network deps)

## Wrapper
- Electron 33, `main.js` BrowserWindow 1600x900, hardware acceleration ON, `fullscreenable: true`,
  auto-hidden menu bar (Alt reveals), black background, F11 toggles fullscreen.
- `electron-builder` target: Windows x64 **portable** (single .exe, no installer).
- AppId `com.holowatts.holomapper`, productName `HoloMapper`, version 1.0.0.
- No code signing → Windows SmartScreen will show an "Unknown publisher" warning on first launch. Expected for v1.
- Linux build host: `signAndEditExecutable: false` (rcedit needs wine, which isn't installable here) — the exe
  carries Electron's default file metadata. Cosmetic only.

## Build log
- `npm install` (electron 33 + electron-builder 25): OK.
- First `electron-builder --win portable` failed: wine required for exe signing/edit step.
- Retry with `win.signAndEditExecutable: false`: OK.
- Output: `dist/HoloMapper-1.0.0-portable.exe`.

## Verification
- [x] .exe exists: `dist/HoloMapper-1.0.0-portable.exe`, 74.3 MB (within expected 60–90MB)
- [x] MZ header present; `file` → PE32 executable for MS Windows (NSIS self-extracting stub)
- [x] Inner payload `dist/win-unpacked/HoloMapper.exe` → PE32+ x86-64, 15 sections (real 64-bit app)
- [x] `node --check main.js` passes
- [x] Smoke test: `xvfb-run npx electron . --no-sandbox` — main process starts, window opens, no main-process
      exceptions (only headless-VM GPU/dbus noise; WebGL can't init under xvfb — expected, his laptop is ground truth)
- [x] GitHub Release created: tag v1.0.0, published (not draft), with notes

## BLOCKED: release asset upload
- The `custom.github` surrogate credential works on `api.github.com` (release created fine) but GitHub
  returns **401 Bad credentials** on `uploads.github.com` — the credential/proxy path does not cover the
  uploads host. Retried twice, same result. The release is live at
  https://github.com/joshuagwatts/HoloMapper/releases/tag/v1.0.0 with 0 assets.
- The built exe is at `~/workspace/holomapper-app/dist/HoloMapper-1.0.0-portable.exe` (74.3 MB),
  ready for whoever has a working uploads path (parent agent or Joshua's own `gh`).

## Untested
- Actual Windows launch — no Windows host on this VM. Joshua's laptop is ground truth.
- Real-GPU performance (SwiftShader can't stand in).
