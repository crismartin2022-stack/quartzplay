# Apply Progress: In-App Camera Capture

## Status

done (tasks 1.1–2.3). Task 3.1 (PR, phone verification, release) is out of
scope for this apply pass: no commit/push was made, per instructions.

## TDD Evidence

| Step | Command | Observed result |
|------|---------|------------------|
| Baseline | `CI=true npx react-scripts test --watchAll=false --runInBand` | `Test Suites: 3 passed, 3 total` / `Tests: 46 passed, 46 total` |
| RED | `CI=true npx react-scripts test --watchAll=false --runInBand src/cameraCaptureLogic.test.js src/CameraCapture.test.js` | Both suites failed with `Cannot find module './cameraCaptureLogic'` and `Cannot find module './CameraCapture'` (modules did not exist yet) |
| GREEN (module) | `CI=true npx react-scripts test --watchAll=false --runInBand src/cameraCaptureLogic.test.js` | `Test Suites: 1 passed, 1 total` / `Tests: 20 passed, 20 total` |
| GREEN (component) | `CI=true npx react-scripts test --watchAll=false --runInBand src/CameraCapture.test.js` | `Test Suites: 1 passed, 1 total` / `Tests: 4 passed, 4 total` |
| Full suite | `CI=true npx react-scripts test --watchAll=false --runInBand` | `Test Suites: 5 passed, 5 total` / `Tests: 70 passed, 70 total` |
| Production build | `APP_ENV=production REACT_APP_ENV=production REACT_APP_API_URL=https://api.iaqp.lat REACT_APP_IAQP_URL=https://api-casino.iaqp.lat REACT_APP_APP_ORIGIN=https://valiant-gentleness-production-a779.up.railway.app REACT_APP_CASINO_HOSTS=iaqp.lat,www.iaqp.lat REACT_APP_BOT_USERNAME=quartzplay_bot CI=true npx react-scripts build` | `Compiled successfully.` — `281.69 kB (+1.28 kB) build/static/js/main.ecaea515.js` |
| `git diff --check` | `git diff --check` | exit 0, no output (no whitespace errors) |
| `git status --short` | `git status --short` | `M frontend/src/App.jsx`, `M frontend/src/Web.jsx`, plus untracked new files listed below (and pre-existing untracked `docs/`, `openspec/changes/quartzplay-camera-capture/`) |

## Changed Files

- `frontend/src/cameraCaptureLogic.js` (new) — pure camera helpers: `isCameraSupported`, `startCamera`, `stopStream`, `captureFrame`.
- `frontend/src/cameraCaptureLogic.test.js` (new) — 20 tests covering support detection, all mapped `DOMException` names, default/custom `facingMode`, track-stop tolerance, and frame capture sizing/quality.
- `frontend/src/CameraCapture.jsx` (new) — shared overlay component: requests the camera on mount, shows `<video>` preview with shutter/cancel, falls back to a file input with a Spanish reason message on failure, stops tracks on unmount/cancel/capture.
- `frontend/src/CameraCapture.test.js` (new) — 4 tests (rendered with `react-dom/client` + `React.act`, no new dependency) covering granted preview+controls, cancel stopping tracks without adding an image, blocked-permission reason with file fallback, and unsupported-browser reason with file fallback.
- `frontend/src/Web.jsx` — imports `CameraCapture`; "Sacar foto" is now a button that opens the camera overlay (`camaraAbierta` state) instead of a file input with the ignored `capture="environment"` hint; captured frames go through the existing `setImagenes` path via `agregarCapturada`. "Galería" input is untouched.
- `frontend/src/App.jsx` — same wiring as `Web.jsx` (same `imagenes`/`setImagenes`/`escaneo` naming as in Web.jsx, confirmed identical before editing).

## Deviations

- **Module renamed `cameraCapture.js` → `cameraCaptureLogic.js`.** The task instructions named the pure module `cameraCapture.js` and the component `CameraCapture.jsx`. This developer's filesystem (macOS/APFS, case-insensitive) and Jest/webpack's module resolution (which tries `.js` before `.jsx` in `moduleFileExtensions`) collide on these two names: resolving `./CameraCapture` found the pure module first and returned `undefined` as the component, failing every component test with "Element type is invalid". Renamed the pure module to `cameraCaptureLogic.js` (and its test file to `cameraCaptureLogic.test.js`) to remove the collision; the component keeps the exact requested name and default export. No behavioral change, spec-visible naming only inside `frontend/src/`.
- **Component test file used `react-dom/client` + `React.act` instead of React Testing Library.** RTL is not a dependency of this project (confirmed absent from `package.json` and `node_modules`), and instructions said not to add dependencies. `react-dom` is already a dependency, so rendering with `createRoot`/`React.act` (no `react-dom/test-utils`, which is deprecated for this in React 18.2) added no new packages while still allowing the 4 component-level scenarios required by task 1.2.
- **"Sacar foto" changed from a `<label>`-wrapped file input to a `<button>`.** Required to open the camera overlay instead of a native file picker; visual style (dashed border, emoji, label text) kept identical to the sibling "Galería" control.

## Rollback Boundary

Revert these five files to restore the previous file-input-only behavior:
`frontend/src/CameraCapture.jsx`, `frontend/src/CameraCapture.test.js`,
`frontend/src/cameraCaptureLogic.js`, `frontend/src/cameraCaptureLogic.test.js`,
and the `Web.jsx`/`App.jsx` edits (import line + `camaraAbierta` state + the
"Sacar foto" control + the `<CameraCapture>` render block). No backend, config,
or `Galería` changes were made.
