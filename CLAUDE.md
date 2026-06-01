# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — run the bot (`node src/index.js`)
- `npm run dev` — run with `node --watch` for auto-restart
- `npm run deploy` — register slash commands via REST (`src/deploy-commands.js`). Requires `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. If `DISCORD_GUILD_ID` (or `DISCORD_GUILD_IDS`) is set, registers per-guild AND clears global commands to avoid duplicates (override with `CLEAN_GLOBAL_COMMANDS=false`).
- `npm run check` — syntax-checks every `.js` under `src/` and `scripts/` using `node --check`. There is no test suite, no linter, no formatter — this is the only automated check.

Node 20.11+ required. CommonJS (`require`/`module.exports`), not ESM.

## Architecture

### Entry point and request flow

`src/index.js` boots a single `Client` (intents: Guilds, GuildVoiceStates, GuildMessages, GuildPresences), builds a shared `context` object, and dispatches all interactions:

> **GuildPresences is a privileged intent** — enable it in the Discord Developer Portal (Bot → Privileged Gateway Intents → Presence Intent), or the bot fails to log in with a "disallowed intents" error. It powers the live "В сети" status on the profile card. Message counting (`store.addMessage`) marks the store dirty and a 30s interval flushes it — `MessageCreate` no longer calls `store.save()` per message.

- `context = { client, config, state, store, voiceTracker, tempRooms }` is passed to every command and component handler.
- `state` holds in-memory ephemeral maps: `cooldowns`, `duels`, `music`.
- Chat input commands → `commandMap.get(name).execute(interaction, context)` after a per-user/per-command cooldown check (default 3s, overridable via `command.cooldownMs`).
- Buttons / string selects / role selects → `handleComponent(interaction, context)` walks each module's `handleComponent` until one returns truthy. Components are routed by `customId` prefix inside each module — no central router.

### Command modules

Every file in `src/commands/*.js` (except `index.js`) exports `{ commands: [...], handleComponent? }`. `src/commands/index.js` flattens all modules into `commands` and `commandMap`, throws on duplicate command names, and exposes the chained `handleComponent`. To add a command: create/extend a module, export it via the `modules` array in `src/commands/index.js`, then `npm run deploy`.

### Persistence

`src/services/jsonStore.js` is the single source of truth for persisted state — balances, cases, stats, personal roles, transactions, voice online time, clan data, etc. It reads/writes `data/database.json` (path configurable via `DATABASE_PATH`). Mutations are in-memory; call `store.save()` to flush. The main loop flushes on `ClientReady`, after clan-war message scoring, and during SIGINT/SIGTERM shutdown. New persisted fields should go through `JsonStore` methods, not direct JSON access.

### Services

- `services/voiceTracker.js` — tracks voice session durations; `hydrate(client)` on ready, `handleVoiceStateUpdate` on every voice event, `stopAll()` on shutdown.
- `services/tempRooms.js` — temporary voice rooms triggered by `TEMP_ROOM_TRIGGER_CHANNEL_ID` in category `TEMP_ROOM_CATEGORY_ID`.
- `services/cardRenderer.js` — renders "hero" PNG cards locally via `@napi-rs/canvas` (gradients, avatar progress ring, stat tiles, flaticon icons from `assets/icons/`, Montserrat font from `assets/fonts/`). Exposes `CARD_AVAILABLE`, `loadIcons()` (preloaded on `ClientReady`), `loadRemoteImage()` (avatar fetch with timeout), `paintHeroCard(spec)`.
- `services/profileCard.js` — high-level card builders on top of `cardRenderer`: `buildProfileCard`/`buildBalanceCard`/`buildTimelyCard` return `{ files, imageUrl: 'attachment://card.png' }`, with an imgenx URL fallback (`getProfileCardUrl`) when canvas is unavailable. Commands attach the card via `mediaPanel({ imageUrl })` + `reply(..., { files })`. NOTE: commands are not deferred (Components V2 is incompatible with `deferReply`), so card builders must stay within Discord's ~3s window — the avatar fetch is time-bounded.

### UI layer (Components v2)

All bot replies go through helpers in `src/ui/components.js` and use `MessageFlags.IsComponentsV2` with `ContainerBuilder`, `TextDisplayBuilder`, `MediaGalleryBuilder`, buttons, and selects. Use `reply(interaction, panel, { ephemeral })` and `errorPanel(text)` rather than constructing raw message payloads. Do NOT mix classic embeds with Components v2 in the same message — discord.js will reject it.

Design-system helpers in `components.js`: `panel()`/`mediaPanel()` accept `icon` (emoji prefix in the heading), `eyebrow` (small line above the title), and `stats: [{ icon, name, value }]` with `statColumns` (rendered via `statGrid`). `ICONS` is the per-domain emoji map for headings/lines (panels can't embed images — only the canvas cards use flaticon PNGs). Other helpers: `keyValue`, `bar` (text progress bar), `badge`. `addActions` groups buttons into rows of 5 (selects get their own row). To attach a hero-card image, pass `imageUrl` to `mediaPanel` and the card's `files` through `reply`'s options.

### Config

`src/config.js` loads `.env` from the project root and exposes a frozen config object. Required: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`. Optional: `DISCORD_GUILD_ID` / `DISCORD_GUILD_IDS` (comma list), `REPORT_CHANNEL_ID` / `ADMIN_CHANNEL_ID`, `TEMP_ROOM_TRIGGER_CHANNEL_ID`, `TEMP_ROOM_CATEGORY_ID`, `DATABASE_PATH`, `ACCENT_COLOR`, `START_BALANCE`, `TIMELY_REWARD`, `TIMELY_SNOWBALLS`, `TIMELY_COOLDOWN_HOURS`, `PERSONAL_ROLE_PRICE`.

## Conventions

- User-facing strings are Russian. Keep them Russian when editing existing commands.
- Music commands in `src/commands/music.js` are a UI controller only — there is no audio engine wired up. Don't pretend playback works; integrate Lavalink or similar before changing behavior.
- Component `customId`s are namespaced per module (e.g. `clan:`, `case:`, `room:`). Match the existing prefix when adding handlers so the module's `handleComponent` claims them.
- Errors inside the interaction handler are caught centrally in `index.js`; commands should throw or return rejected promises rather than swallowing.
