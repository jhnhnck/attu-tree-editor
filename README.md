# FamilyTreeEditor

Part of the [Attu Project](https://attuproject.org).

## Overview

A predominantly client-side, TypeScript family tree viewer and editor for the Attu wiki universe. Imports the standard GEDCOM 5.5.1 (`.ged`) and Family Echo's proprietary FamilyScript (`.txt`) formats; renders touch-friendly, accessible trees with native dark mode; and round-trips edits back out to either format. A thin Python backend handles cross-device autosave, sharing, and identity bridging through the [doom-bot](https://github.com/dervot/doom-bot) Discord integration.

The detailed implementation plan lives at `notes/plans/initial-plan.md` (gitignored; copy on request).

### Stack

| Layer | Tool |
| :--- | :--- |
| build | Vite 6 (Rolldown when stable) |
| ui | Svelte 5 (runes) |
| styling | Tailwind CSS v4 |
| tree layout | relatives-tree + custom SVG renderer |
| GEDCOM | read-gedcom + gedcom-io |
| FamilyScript | hand-rolled parser/writer |
| local store | Dexie (IndexedDB) |
| zoom/pan | Panzoom |
| portraits | Cropper.js (lazy) |
| backend | FastAPI + SQLite (uv-managed) |
| testing | Vitest + Playwright + pytest |

### Haracalnde Date

The Haracalnde calendar is the in-universe timekeeping system. Each year has 12 months of 30 days (360 days total). Dates are written as `day-month year ERA`, e.g. `15-3 5 PC`.

There are two eras:

| Era | Direction | Notes |
| :--- | :--- | :--- |
| **PC** (Post Calming) | counted forward from the Grand Calming | 1, 2, 3... |
| **TT** (Turbulence Time) | counted backward before the Grand Calming | 1 TT directly preceded 1 PC |

The canonical math lives in doom-bot at `attubot/client/calendar.py`; the editor mirrors it client-side in `apps/web/src/lib/date/HaracalndeDate.ts` and server-side in `apps/server/attu_tree/calendar.py`.

## Repository Layout

```
FamilyTreeEditor/
├── apps/
│   ├── web/                  client-side svelte spa
│   └── server/               fastapi backend
├── packages/                 shared workspace packages
├── examples/                 sample .ged, .txt, and .html exports from family echo
├── notes/                    agent guidance and feature specs
├── package.json              pnpm workspace root
├── pnpm-workspace.yaml
└── README.md
```

## Getting Started

### Prerequisites

| Tool | Min Version | Install |
| :--- | :--- | :--- |
| Node.js | 22 | `nvm install 22` |
| pnpm | 10 | `npm i -g pnpm` (user prefix; see notes/dev/dev_setup.md) |
| Python | 3.13 | pyenv or system |
| uv | 0.11+ | `pip install --user uv` or astral installer |
| Docker | 24+ | optional, for production image build (root `Dockerfile`) |

### Install

```bash
pnpm install
cd apps/server && uv sync && cd ../..
pnpm exec playwright install chromium
```

### Common commands

```bash
pnpm dev             # vite dev server on :5173 (proxies /api -> :8000)
pnpm server:dev      # uvicorn with reload on :8000
pnpm build           # production web bundle in apps/web/dist
pnpm test:unit       # vitest
pnpm test:e2e        # playwright (chromium + mobile)
pnpm lint            # eslint + prettier
pnpm typecheck       # svelte-check + tsc
pnpm server:test     # pytest
pnpm server:lint     # ruff + basedpyright
pnpm verify          # the full ci sweep
```

## Phase Status

Phase 0 (bootstrap) - **done**. `pnpm verify` passes; dev shell renders; server `/health` returns `{status:"ok"}`.

Subsequent phases (domain, import/export, render+edit, persistence, backend+sync, polish+gadget) live in the gitignored plan file; ask before kicking one off.

## License

Available under the MIT license. See [LICENSE.md](LICENSE.md) for details.
