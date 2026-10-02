# AGENTS.md

Guidance for AI coding agents (and humans) working on **OpenCode Remote**.

## What this project is

An **Android app** (Ionic React + Capacitor + Tailwind CSS v4) that remotely controls
**OpenCode Desktop** through a **companion bridge** (Node/TypeScript). OpenCode Desktop is a
frontend of the shared OpenCode background service; the bridge attaches to that same service,
so the phone and the Desktop see the **same sessions**.

```
Android app ──HTTP + WebSocket──► bridge (Node) ──localhost──► OpenCode service ◄── Desktop/TUI
```

The bridge **never modifies OpenCode**. It only reads `service.json`, talks to the local HTTP API,
and exposes a token-protected surface on the LAN/VPN.

## Layout

| Path | Purpose |
|------|---------|
| `bridge/` | Companion bridge (Node 20+, run with `node src/index.ts`, no build step) |
| `src/` | Ionic React app (Vite + Tailwind v4 + Motion + Zustand + react-query) |
| `src/core/` | Types, API client, stores, events, i18n, formatting, tools mapping |
| `src/components/` | Message list, tool/reasoning groups, composer, pickers, toasts, sheets |
| `src/screens/` | Projects, Project sessions, Conversation, Files, Models, Commands, Settings |
| `android/` | Capacitor Android project (widget, notifications, permissions) |
| `scripts/` | Icon generation, OpenCode detection |
| `PLAN.md` | Detailed architecture + API/event mapping |

## Setup from a fresh clone (for an AI agent)

```bash
# 1. App dependencies
npm install

# 2. Bridge dependencies
cd bridge && npm install && cd ..

# 3. Detect the local OpenCode service (does not modify it)
node scripts/detect-opencode.mjs

# 4. Start the bridge (prints host/ports/token)
npm run bridge            # or: ./start-bridge.ps1  /  ./start-bridge.sh

# 5. Run the app (browser dev)
npm run dev

# 6. Android
npm run build && npx cap sync android && npx cap open android
```

If OpenCode is not detected, launch OpenCode Desktop (or the TUI) once so it starts the shared
service, then re-run the detection.

## Bridge contract

- Reads `~/.local/state/opencode/service.json` (or `%USERPROFILE%\.local\state\opencode\service.json`,
  or `$XDG_STATE_HOME/...`). Override with `--server` / `--password` / `--service-file`.
- Listens on `0.0.0.0` and the first free port of a fixed obscure list (10 ports).
- Requires `Authorization: Bearer <token>` on `/api/*` and `/events` (except `/health`).
- **Path scoping**: `/api/fs/*` is restricted to OpenCode project roots (from `/api/project`).
  Disable with `--allow-any-path` (unsafe).
- Proxies the OpenCode HTTP API at the same paths; streams events over WebSocket at `/events`.
- `GET /servers` lists reachable local dev-server ports (for the in-app preview).
- Optional TLS (`--tls`, auto self-signed cert) serves HTTPS/WSS.

## Conventions

- **All user-facing strings go through `src/core/i18n.ts`** (`fr` + `en`). Never hardcode UI text.
- Dates/numbers/relative times use `Intl` via `src/core/format.ts` (`setFormatLocale`).
- Styling uses **Tailwind utilities**; the Ionic CSS is imported in `layer(ionic)` (see
  `src/theme/ionic.css`) so Tailwind always wins. Do not add unlayered global CSS that resets
  `button`/padding.
- Tool calls render **mapped fields** (`src/core/tools.ts`), never raw JSON.
- Keep the message list performant: `MessageView` is memoized, only recent messages are loaded,
  older ones paginate in.

## Commands

| Command | Effect |
|---------|--------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run lint` | oxlint |
| `npm run icons` | Regenerate the Android/web icons from the OpenCode mark |
| `npm run bridge` | Start the companion bridge |
| `npm run test` | Run bridge + app unit tests |
| `npm run android:debug` | Build a debug APK |

## Remote shell

The composer supports `!command` (one-shot remote shell) and `/terminal` opens the console screen.
Under the hood: `POST /api/shell { command, cwd }` then `GET /api/shell/{id}/output`. The bridge
proxies these; the working directory defaults to the session's project.

## iOS

The iOS platform is scaffolded; the widget (WidgetKit) and iOS plugin live in `ios/App/` and
`docs/ios.md` explains the Xcode wiring. Building requires macOS + Xcode.

## Security

- The bridge stays inside the user's VPN; optional TLS via `--tls --cert --key` (HTTPS/WSS).
- Never commit tokens, LAN IPs, personal paths, or session data. Screenshots use generic data.

## Do not

- Do not edit or delete OpenCode's database, `service.json`, or config.
- Do not commit real session data, tokens, IPs, or personal paths into docs/screenshots.
- Do not bypass the bridge path scoping when exposing files.
