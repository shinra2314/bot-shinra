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

`src/index.js` boots a single `Client` (intents: Guilds, GuildVoiceStates, GuildMessages, GuildPresences, MessageContent, GuildMembers, GuildModeration; partials: Message, Channel, GuildMember, User), builds a shared `context` object, and dispatches all interactions:

> **Privileged intents** — `GuildPresences`, `MessageContent`, and `GuildMembers` are all privileged; enable them in the Discord Developer Portal (Bot → Privileged Gateway Intents), or the bot fails to log in with a "disallowed intents" error. `GuildPresences` powers the live "В сети" status; `MessageContent` is required by automod (reading message text) and message edit/delete logs; `GuildMembers` powers join/leave/nick/role logs. `GuildModeration` (ban/unban logs) is not privileged. Message counting (`store.addMessage`) marks the store dirty and a 30s interval flushes it — `MessageCreate` no longer calls `store.save()` per message. `MessageCreate` is `async` and first runs `automod.checkAndEnforce`; if it returns truthy (message deleted) further processing is skipped.

- `context = { client, config, state, store, cache, voiceTracker, tempRooms, eventLogger }` is passed to every command and component handler.
- `state` holds in-memory ephemeral maps: `cooldowns`, `duels`, `music`.
- Chat input commands → `commandMap.get(name).execute(interaction, context)` after a per-user/per-command cooldown check (default 3s, overridable via `command.cooldownMs`).
- Buttons / string selects / role selects → `handleComponent(interaction, context)` walks each module's `handleComponent` until one returns truthy. Components are routed by `customId` prefix inside each module — no central router.

### Command modules

Every file in `src/commands/*.js` (except `index.js`) exports `{ commands: [...], handleComponent? }`. `src/commands/index.js` flattens all modules into `commands` and `commandMap`, throws on duplicate command names, and exposes the chained `handleComponent`. To add a command: create/extend a module, export it via the `modules` array in `src/commands/index.js`, then `npm run deploy`.

**Family hub panels.** Большинство семейств команд имеют многофункциональную интерактивную панель (одно сообщение с кнопками на все функции семейства), публикуемую вручную командой `/панель` (`src/commands/panels.js`, админ-only `ManageGuild`, опция `семейство` со списком всех семейств + `все`). Каждый модуль семейства экспортирует `hubPanel()` (билдер статичной панели), а `panels.js` держит реестр `FAMILIES` (key → builder). Кнопки панели используют **существующий customId-префикс семейства** с инфиксом `hub`: `<prefix>:hub:<fn>` (кнопка) и `<prefix>:hub:<fn>-submit` / `<prefix>:hub:<fn>-pick` (модалка/селект). Их ловит `handleComponent` того же модуля — ветка `parts[1] === 'hub'` диспетчеризируется **до** остальной логики. Ввод собирается так же, как в rooms: string-choices → эфемерный `select`, свободный текст/число → `showModal`, выбор юзера → `userSelect`; результат эфемерный (или публичный, напр. love-предложение, casino, timely). Slash-подкоманды (`/love действие`, `/clan банк` …) сохранены как fallback — общая логика вынесена в module-level функции, которые зовут и `execute`, и hub-обработчики. Семейства: love, casino, clan, event/mafia(+close), market(+auction), role, case, mod (admin-gated), top, profile, music, economy, room. Новые префиксы зарегистрированы в `COMPONENT_PREFIXES` (`src/commands/index.js`): `clan:`, `case:`, `economy:`, `event:`, `mafia:`, `market:`, `role:`. `games.js` экспортирует два билдера (`eventHubPanel`, `mafiaHubPanel`). Каждая hub-панель получает **корпоративный баннер-картинку** (canvas): `panels.js` рендерит её через `buildHubBanner({ title, subtitle, accent, items })` (`profileCard.js` → `paintGridCard`, сетка фич 3×2; иконки только из `assets/icons`: coins/lotus/snow/level/voice/messages/trophy/heart/clan/case) и передаёт `imageUrl` в `hubPanel(imageUrl)`. `panel()` (`components.js`) теперь принимает `imageUrl` и вставляет MediaGallery под заголовком; при недоступном canvas панель публикуется без картинки.

**Static panels.** `src/index.js` posts persistent panels on `ClientReady` and remembers their message id in the store so restarts edit rather than duplicate: `syncRoomPanel` (channel `ROOM_PANEL_CHANNEL_ID`, builder `src/ui/roomHubPanel.js`) and `syncTicketPanel` (channel `TICKET_PANEL_CHANNEL_ID`, builder `src/ui/ticketPanel.js`). The ticket panel (module `src/commands/tickets.js`, customId prefix `ticket:`) has two buttons → a `Форма` modal; on submit it creates a private text channel `тикет-N`/`жалоба-N` (counter via `store.nextTicketNumber`) under `TICKET_CATEGORY_ID`, visible to the author + admins only (denies `@everyone` `ViewChannel`; `Administrator` bypasses), posts the modal text there with a `Закрыть тикет` button (admin-only → `store.closeTicket` + channel delete). The bot role needs **Manage Channels**. `/ticket панель` reposts the panel; `/ticket создать` is the legacy DB-only ticket. A modal-submit interaction is dispatched through the same chained `handleComponent` (`interaction.isModalSubmit()`), routed by customId prefix.

### Persistence

`src/services/store.js` (`Store` class, SQLite via `src/services/db.js`) is the single source of truth for persisted state — balances, cases, stats, personal roles, transactions, voice online time, clan data, temp rooms, inventory, etc. It stores one JSON blob per guild in SQLite (DB path configurable via `DATABASE_PATH`). Mutations are in-memory; call `store.save()` to flush. The main loop in `src/index.js` flushes on `ClientReady`, every 30s when the `dirty` flag is set (message counting, etc.), after the auction-settlement pass, and during SIGINT/SIGTERM shutdown. New persisted fields should go through `Store` methods, not direct JSON access.

### Services

- `services/voiceTracker.js` — tracks voice session durations; `hydrate(client)` on ready, `handleVoiceStateUpdate` on every voice event, `stopAll()` on shutdown.
- `services/tempRooms.js` — temporary voice rooms triggered by `TEMP_ROOM_TRIGGER_CHANNEL_ID` in category `TEMP_ROOM_CATEGORY_ID`.
- `services/automod.js` — message auto-moderation. `checkAndEnforce(message, context)` is called first in `MessageCreate`; admins / `ManageGuild` / bypass-roles are skipped. Rules: spam-rate, Discord invites, external links (whitelist), mention flood + mention rate, caps, duplicates, emoji flood, newline flood, badwords. Enforcement: delete → `addModerationAction(type:'automod')` → `addAutomodStrike` → escalating `member.timeout` (config `timeoutSteps`). Per-guild config via `store.getAutomodConfig`/`setAutomodConfig`. Sliding windows are in-memory (module-level Map).
- `services/eventLogger.js` — server-events log system. `register(client, context)` wires gateway listeners; `emit(guildId, eventKey, spec)` routes a Components V2 panel to the channel from `store.logChannelFor` (per-event override → master `logChannelId` → `ADMIN_CHANNEL_ID`), only if that event is enabled. Event catalog (key → `{label, icon, color, category}`) is exported as `LOG_EVENTS` and reused by the dashboard. Non-gateway events (`warnAdd`, `automod`) are emitted from code.
- `services/cardRenderer.js` — renders "hero" PNG cards locally via `@napi-rs/canvas` (gradients, avatar progress ring, stat tiles, flaticon icons from `assets/icons/`, Montserrat font from `assets/fonts/`). Exposes `CARD_AVAILABLE`, `loadIcons()` (preloaded on `ClientReady`), `loadRemoteImage()` (avatar fetch with timeout), `paintHeroCard(spec)`.
- `services/profileCard.js` — high-level card builders on top of `cardRenderer`: `buildProfileCard`/`buildBalanceCard`/`buildTimelyCard` return `{ files, imageUrl: 'attachment://card.png' }`, with an imgenx URL fallback (`getProfileCardUrl`) when canvas is unavailable. Commands attach the card via `mediaPanel({ imageUrl })` + `reply(..., { files })`. NOTE: commands are not deferred (Components V2 is incompatible with `deferReply`), so card builders must stay within Discord's ~3s window — the avatar fetch is time-bounded.

### UI layer (Components v2)

All bot replies go through helpers in `src/ui/components.js` and use `MessageFlags.IsComponentsV2` with `ContainerBuilder`, `TextDisplayBuilder`, `MediaGalleryBuilder`, buttons, and selects. Use `reply(interaction, panel, { ephemeral })` and `errorPanel(text)` rather than constructing raw message payloads. Do NOT mix classic embeds with Components v2 in the same message — discord.js will reject it.

Design-system helpers in `components.js`: `panel()`/`mediaPanel()` accept `icon` (emoji prefix in the heading), `eyebrow` (small line above the title), and `stats: [{ icon, name, value }]` with `statColumns` (rendered via `statGrid`). `ICONS` is the per-domain emoji map for headings/lines (panels can't embed images — only the canvas cards use flaticon PNGs). Other helpers: `keyValue`, `bar` (text progress bar), `badge`. `addActions` groups buttons into rows of 5 (selects get their own row). To attach a hero-card image, pass `imageUrl` to `mediaPanel` and the card's `files` through `reply`'s options.

### Config

`src/config.js` loads `.env` from the project root and exposes a frozen config object. Required: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`. Optional: `DISCORD_GUILD_ID` / `DISCORD_GUILD_IDS` (comma list), `REPORT_CHANNEL_ID` / `ADMIN_CHANNEL_ID`, `TEMP_ROOM_TRIGGER_CHANNEL_ID`, `TEMP_ROOM_CATEGORY_ID`, `TICKET_PANEL_CHANNEL_ID` (channel the static ticket panel is posted to) / `TICKET_CATEGORY_ID` (category for created `тикет-N`/`жалоба-N` channels), `DATABASE_PATH`, `ACCENT_COLOR`, `START_BALANCE`, `TIMELY_REWARD`, `TIMELY_SNOWBALLS`, `TIMELY_COOLDOWN_HOURS`, `PERSONAL_ROLE_PRICE`, `LOG_CHANNEL_ID` (master log channel), and automod defaults under `config.automod` (`AUTOMOD_ENABLED`, `AUTOMOD_SPAM_COUNT`, `AUTOMOD_SPAM_WINDOW_MS`, `AUTOMOD_MENTION_LIMIT`, `AUTOMOD_MENTION_RATE`, `AUTOMOD_MENTION_RATE_MS`, `AUTOMOD_BLOCK_INVITES`, `AUTOMOD_BLOCK_LINKS`, `AUTOMOD_LINK_WHITELIST`, `AUTOMOD_CAPS`, `AUTOMOD_EMOJI_LIMIT`, `AUTOMOD_NEWLINE_LIMIT`, `AUTOMOD_BADWORDS`, `AUTOMOD_BYPASS_ROLE_IDS`, `AUTOMOD_STRIKE_WINDOW_MS`). Per-guild overrides for automod and log routing live in `guild.settings.automod` / `guild.settings.logs` and are editable from the dashboard (Автомодерация / Логи pages) and `/automod`.

## Conventions

- User-facing strings are Russian. Keep them Russian when editing existing commands.
- Music commands in `src/commands/music.js` are a UI controller only — there is no audio engine wired up. Don't pretend playback works; integrate Lavalink or similar before changing behavior.
- Component `customId`s are namespaced per module (e.g. `clan:`, `case:`, `room:`). Match the existing prefix when adding handlers so the module's `handleComponent` claims them.
- Errors inside the interaction handler are caught centrally in `index.js`; commands should throw or return rejected promises rather than swallowing.
