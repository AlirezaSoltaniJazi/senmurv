# Getting Started

## Prerequisites

- Node.js 20 or 22
- Google Chrome 114+ (the Side Panel API requires 114+)

## Install

```bash
npm install
```

## Build & load

```bash
npm run build          # production build → dist/
# or
npm run build:local    # unpacked build with sourcemaps, name "Senmurv - Local"
```

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the `dist/` directory.
4. Pin the Senmurv icon and click it — the side panel opens.

## Dev loop

```bash
npm run dev            # Vite dev server + HMR
```

CRXJS hot-reloads the side panel and content scripts. The **service worker does not auto-reload** — after editing `src/background/`, reload the extension from `chrome://extensions`.

## Quality gates

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

## Package for distribution

```bash
npm run package        # build + zip → release/senmurv-<version>.zip
npm run package:local  # same, with the "- Local" name + sourcemaps
```

## Versioning

```bash
npm run bump:patch     # bumps package.json + manifest.json together
npm run bump:minor
npm run bump:major
```
