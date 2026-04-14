# Podwires Desktop

Native desktop wrapper for [podwires.com](https://podwires.com) — Windows, macOS, and Linux.

Thin Electron shell around the live site. The site is already a PWA (manifest
+ service worker live in `aktor-theme/inc/pwa.php`), so this app gets offline
support, push notifications, and cache strategies "for free" from the existing
`sw.js`.

## What the wrapper adds on top of the PWA

- Native window chrome, dock icon, taskbar integration
- Window bounds persisted between launches (`electron-store`)
- Native application menu (File / Edit / View / Navigate / Help)
- External links (non-`podwires.com`) open in the user's default browser
- Single-instance lock — relaunching focuses the first window
- Custom protocol handler `podwires://`
- Branded User-Agent (`PodwiresDesktop/<version>`) so server-side code can
  detect desktop clients if needed
- Graceful offline landing page if the site is unreachable at launch

## Requirements

- Node.js ≥ 20
- npm

## Develop

```bash
cd podwires-desktop
npm install
npm start          # runs the app against https://podwires.com
```

## Build distributable installers

```bash
npm run dist:mac      # .dmg + .zip  (arm64 + x64)
npm run dist:win      # .exe (NSIS) + portable .exe
npm run dist:linux    # AppImage + .deb
npm run dist:all      # everything (cross-compile where supported)
```

Artifacts land in `dist/`.

## Layout

```
podwires-desktop/
├── build/               # build-time assets (icons)
│   ├── icon.png         # 512×512, used by electron-builder
│   ├── icon-192.png
│   └── icon-512.png
├── src/
│   └── main.js          # Electron main process — window, menu, security
├── package.json
└── README.md
```

## Relationship to the rest of the monorepo

- Icons in `build/` are copied from `aktor-theme/assets/images/` — if the
  theme's icons are updated, re-copy them here.
- The wrapper simply loads `https://podwires.com/`; all UI, auth, routing, and
  offline behaviour comes from the WordPress theme's existing PWA.
- No backend coupling — no DB access, no shared env. Safe to ship independently.

## Code signing & notarisation

Not configured out of the box. To ship through auto-update / avoid SmartScreen
and Gatekeeper warnings:

- **macOS:** set `CSC_LINK`, `CSC_KEY_PASSWORD`, and notarise with
  `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`.
- **Windows:** set `CSC_LINK` (a `.pfx`) + `CSC_KEY_PASSWORD`.

See [electron-builder code signing docs](https://www.electron.build/code-signing).
