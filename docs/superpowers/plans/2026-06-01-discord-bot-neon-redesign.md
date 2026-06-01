# Onix Bot Neon-редизайн — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести весь визуал Onix-бота на единый dark-neon стиль, добавить canvas-карты ко всем осмысленным командам и навести порядок в структуре кода — поэтапно, не ломая рабочего бота.

**Architecture:** `cardRenderer.js` разбивается на низкоуровневые примитивы (`src/services/canvas/primitives.js`) и лейауты (`src/services/canvas/layouts/*`). `profileCard.js` становится card-kit фасадом, маппящим доменные данные в spec лейаутов. Команды цепляют карты через существующий `mediaPanel({ imageUrl }) + reply(..., { files })`. UI-палитра в `ui/components.js` переводится на неон. На Фазе 2 крупные модули разносятся по ответственности.

**Tech Stack:** Node 20 (CommonJS), discord.js (Components V2), `@napi-rs/canvas`, Montserrat (TTF), flaticon PNG-иконки в `assets/icons/`.

---

## ВАЖНО: верификация и рабочий процесс (читать перед началом)

Этот проект **не под git** и **без тест-фреймворка** (CLAUDE.md: «no test suite, no linter»). Поэтому:

- **Вместо «commit»** в конце задач — чекпойнт: показать результат пользователю/ревьюеру, дождаться ОК. Если пользователь позже инициализирует git, шаги коммита добавим.
- **Вместо unit-тестов** — два инструмента:
  1. `npm run check` — `node --check` по всем `.js`. Должен быть зелёным после каждой задачи.
  2. **Рендер PNG + визуальный осмотр.** Скрипт `scripts/render-gallery.js` (создаётся в Task 0.1) рендерит каждую карту с моковыми данными в `tmp/gallery/<name>.png`. После реализации лейаута — запустить скрипт, **открыть PNG через Read-инструмент и посмотреть глазами**, подкрутить значения, повторить, пока неон-стиль не выглядит хорошо.
- Карты НЕ дефёрятся (Components V2 ⊥ deferReply) → бюджет ~3с; аватары грузим через `loadRemoteImage` с таймаутом.

**Цикл визуальной задачи:** написать код лейаута → `node scripts/render-gallery.js <name>` → Read `tmp/gallery/<name>.png` → оценить (контраст, выравнивание, свечение, обрезка текста) → подкрутить → повторить до результата → `npm run check` → чекпойнт.

---

## Структура файлов (итог Фаз 0–2)

| Файл | Ответственность | Статус |
|---|---|---|
| `src/services/canvas/primitives.js` | Низкоуровневое рисование: фон-сетка, свечение текста/обводки, кольцо, аватар, иконки, roundRect, truncate | Создать |
| `src/services/canvas/theme.js` | Неоновая палитра карт (hex), маппинг домен→акцент | Создать |
| `src/services/canvas/layouts/hero.js` | Лейаут hero (1 аватар + 4 плитки) | Создать (перенос) |
| `src/services/canvas/layouts/profile.js` | Лейаут профиля | Создать (перенос) |
| `src/services/canvas/layouts/leaderboard.js` | Лейаут топ-списка | Создать |
| `src/services/canvas/layouts/result.js` | Лейаут исхода (казино/игра) | Создать |
| `src/services/canvas/layouts/clan.js` | Лейаут клана | Создать |
| `src/services/canvas/layouts/love.js` | Парный лейаут | Создать |
| `src/services/canvas/layouts/drop.js` | Лейаут выпавшего предмета | Создать |
| `src/services/canvas/layouts/grid.js` | Лейаут сетки товаров | Создать |
| `src/services/cardRenderer.js` | Фасад: реэкспорт `CARD_AVAILABLE`, `loadIcons`, `loadRemoteImage`, `paint*` | Изменить (тонкий фасад) |
| `src/services/profileCard.js` | Card-kit: доменные билдеры `buildXxxCard` → `{ files, imageUrl }` | Изменить/расширить |
| `src/ui/components.js` | Неоновые `COLORS`; хелперы панелей | Изменить |
| `scripts/render-gallery.js` | Рендер всех карт в `tmp/gallery/*.png` | Создать |
| `src/commands/cases.js` | Команды/хендлеры кейсов (вынос из economy.js) | Создать (Фаза 2) |
| `src/commands/index.js` | Регистрация модулей + карта префиксов customId | Изменить (Фаза 2) |

Контракт `cardRenderer.js` (`CARD_AVAILABLE`, `loadIcons`, `loadRemoteImage`, `paintHeroCard`, `paintProfileCard`) сохраняется на всех фазах — существующие вызовы из `profileCard.js` не ломаются.

---

# ФАЗА 0 — Неоновое ядро

### Task 0.1: Галерея-рендер (инструмент верификации)

**Files:**
- Create: `scripts/render-gallery.js`

- [ ] **Step 1: Написать скрипт-галерею**

Создаёт `tmp/gallery/` и рендерит зарегистрированные карты. На старте умеет рендерить текущие `paintProfileCard`/`paintHeroCard` (контрольные образцы ДО редизайна). По мере добавления лейаутов в `CARDS` добавляются новые записи.

```js
// Рендер всех карт с моковыми данными для визуальной проверки.
// Запуск: node scripts/render-gallery.js           — рендерит все
//         node scripts/render-gallery.js profile    — только одну
const fs = require('fs');
const path = require('path');
const renderer = require('../src/services/cardRenderer');

const OUT = path.join(__dirname, '..', 'tmp', 'gallery');

// name → () => Buffer. Пополняется по мере добавления лейаутов.
function buildCards() {
  return {
    profile: () => renderer.paintProfileCard({
      accent: '#A855F7',
      background: { from: '#0a0b14', to: '#06070d' },
      avatar: null,
      name: 'оля виртовская',
      subtitle: 'Легенда Onix',
      ring: { value: 6, max: 10 },
      level: 6,
      presence: { label: 'В сети', color: '#34F5A0' },
      tags: ['#Самый активный', '#За 2 часа'],
      currencies: [
        { name: 'Монеты', sub: 'Обычная', value: '4 071', color: '#FFD24A' },
        { name: 'Лотусы', sub: 'Премиум', value: '128', color: '#A855F7' }
      ],
      chips: [
        { kind: 'love', text: 'Холост', accent: '#FF3B6B' },
        { kind: 'role', text: 'Born of Madness', icon: null, color: '#A855F7' },
        { kind: 'clan', text: 'Нет клана', icon: 'clan' }
      ],
      tiles: [
        { icon: 'voice', label: 'Онлайн', value: '36 ч 28 м' },
        { icon: 'messages', label: 'Сообщений', value: '5 528' },
        { icon: 'trophy', label: 'В топе', value: '#3' },
        { icon: 'level', label: 'Достижений', value: '1' }
      ],
      achievements: ['Первый профиль']
    }),
    balance: () => renderer.paintHeroCard({
      accent: '#FFD24A',
      avatar: null,
      name: 'оля виртовская',
      subtitle: 'Экономика Onix',
      ring: { value: 6, max: 10 },
      level: 6,
      title: 'Текущий баланс',
      tiles: [
        { icon: 'coins', label: 'Монеты', value: '4 071', accent: '#FFD24A' },
        { icon: 'lotus', label: 'Лотусы', value: '128' },
        { icon: 'snow', label: 'Снежки', value: '12' },
        { icon: 'level', label: 'Уровень', value: '6' }
      ]
    })
  };
}

async function main() {
  if (!renderer.CARD_AVAILABLE) {
    console.error('Canvas недоступен (@napi-rs/canvas / шрифт).');
    process.exit(1);
  }
  await renderer.loadIcons();
  fs.mkdirSync(OUT, { recursive: true });
  const cards = buildCards();
  const only = process.argv[2];
  const names = only ? [only] : Object.keys(cards);
  for (const name of names) {
    if (!cards[name]) { console.error('Нет карты:', name); continue; }
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, cards[name]());
    console.log('Сохранено:', file);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Проверить синтаксис и рендер**

Run: `npm run check`
Expected: `OK` (без ошибок).
Run: `node scripts/render-gallery.js`
Expected: `Сохранено: ...tmp/gallery/profile.png` и `...balance.png`.

- [ ] **Step 3: Осмотреть контрольные PNG**

Read `tmp/gallery/profile.png` и `tmp/gallery/balance.png`. Это эталон ДО редизайна — зафиксировать как точку отсчёта.

- [ ] **Step 4: Чекпойнт** — показать ревьюеру, что инструмент работает.

---

### Task 0.2: Неоновая тема карт (`canvas/theme.js`)

**Files:**
- Create: `src/services/canvas/theme.js`

- [ ] **Step 1: Описать палитру и маппинг**

```js
// Единая dark-neon палитра для canvas-карт.
const NEON = {
  bgFrom: '#0a0b14',
  bgTo: '#06070d',
  grid: 'rgba(124,92,247,0.05)',   // линии техно-сетки
  textPrimary: '#F2F4FF',
  textMuted: '#8A90B0',
  textLabel: '#5A6080',
  panelFill: 'rgba(255,255,255,0.035)',
  panelStroke: 'rgba(168,85,247,0.18)'
};

// Доменные неон-акценты (используются как accent в spec лейаутов).
const ACCENT = {
  profile: '#A855F7',
  info: '#22D3EE',
  success: '#34F5A0',
  danger: '#FF3B6B',
  love: '#FF3B6B',
  casino: '#FF3B6B',
  gold: '#FFD24A',
  voice: '#22D3EE'
};

module.exports = { NEON, ACCENT };
```

- [ ] **Step 2: Проверить** — `npm run check` → OK.

---

### Task 0.3: Примитивы (`canvas/primitives.js`)

**Files:**
- Create: `src/services/canvas/primitives.js`

Выносим из `cardRenderer.js` низкоуровневые функции и добавляем неон-примитивы. Этот модуль владеет инстансом canvas, регистрацией шрифта и кэшем иконок.

- [ ] **Step 1: Перенести базовую инициализацию + хелперы**

Перенести из `cardRenderer.js`: загрузку `@napi-rs/canvas`, регистрацию шрифта, `CARD_AVAILABLE`, `ICON_FILES`, `iconCache`, `loadIcons`, `font`, `roundRect`, `truncateToWidth`, `drawAvatar`, `drawIcon`, `loadRemoteImage`. Экспортировать их + объект `canvas` (для `createCanvas`).

```js
const path = require('path');
const fs = require('fs');
const { NEON } = require('./theme');

let canvas = null;
let CARD_AVAILABLE = false;
const ASSETS = path.join(__dirname, '..', '..', '..', 'assets');
const FONT_FAMILY = 'Montserrat';
const ICON_FILES = {
  coins: 'coins.png', lotus: 'lotus.png', snow: 'snow.png', level: 'level.png',
  voice: 'voice.png', messages: 'messages.png', trophy: 'trophy.png',
  heart: 'heart.png', clan: 'clan.png', case: 'case.png'
};

try {
  canvas = require('@napi-rs/canvas');
  const fontPath = path.join(ASSETS, 'fonts', 'Montserrat.ttf');
  if (fs.existsSync(fontPath)) canvas.GlobalFonts.registerFromPath(fontPath, FONT_FAMILY);
  CARD_AVAILABLE = true;
} catch (error) { CARD_AVAILABLE = false; }

const iconCache = new Map();
let iconsLoaded = false;
async function loadIcons() {
  if (iconsLoaded || !CARD_AVAILABLE) return;
  for (const [key, file] of Object.entries(ICON_FILES)) {
    try { iconCache.set(key, await canvas.loadImage(path.join(ASSETS, 'icons', file))); }
    catch (e) { iconCache.set(key, null); }
  }
  iconsLoaded = true;
}

function font(weight, size) { return `${weight} ${size}px ${FONT_FAMILY}, "Segoe UI", sans-serif`; }
function roundRect(ctx, x, y, w, h, r) { /* перенести из cardRenderer.js без изменений */ }
function truncateToWidth(ctx, value, maxWidth) { /* перенести из cardRenderer.js */ }
function drawAvatar(ctx, image, cx, cy, radius) { /* перенести из cardRenderer.js */ }
function drawIcon(ctx, key, x, y, size) { const img = iconCache.get(key); if (img) ctx.drawImage(img, x, y, size, size); }
async function loadRemoteImage(url, timeoutMs = 1800) { /* перенести из cardRenderer.js */ }
```

(Тела `roundRect`/`truncateToWidth`/`drawAvatar`/`loadRemoteImage` копируются дословно из текущего `cardRenderer.js` строк 57-90 и 603-613.)

- [ ] **Step 2: Добавить неон-примитивы**

```js
// Фон: тёмный градиент + неоновая сетка + угловое свечение акцентом.
function gridBackground(ctx, w, h, accent) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, NEON.bgFrom); g.addColorStop(1, NEON.bgTo);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = NEON.grid; ctx.lineWidth = 1;
  const step = 40;
  ctx.beginPath();
  for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke(); ctx.restore();

  const glow = ctx.createRadialGradient(150, 110, 20, 150, 110, 420);
  glow.addColorStop(0, `${accent}33`); glow.addColorStop(1, '#00000000');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
}

// Текст со свечением. Вызывающий заранее ставит font/fillStyle/textAlign.
function glowText(ctx, str, x, y, { color, blur = 12 } = {}) {
  ctx.save();
  ctx.shadowColor = color || ctx.fillStyle;
  ctx.shadowBlur = blur;
  ctx.fillText(str, x, y);
  ctx.restore();
}

// Светящаяся обводка по уже построенному пути (pathFn рисует path в ctx).
function neonStroke(ctx, pathFn, { color, blur = 10, width = 1.5 } = {}) {
  ctx.save();
  pathFn();
  ctx.shadowColor = color; ctx.shadowBlur = blur;
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.stroke(); ctx.restore();
}

// Кольцо прогресса со свечением и градиентом по дуге.
function neonRing(ctx, cx, cy, radius, ratio, color) {
  ctx.save();
  ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped > 0) {
    const start = -Math.PI / 2;
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, radius, start, start + clamped * Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// Неоновая плитка-панель: тёмная заливка + светящаяся обводка.
function neonPanel(ctx, x, y, w, h, r, accent) {
  roundRect(ctx, x, y, w, h, r); ctx.fillStyle = NEON.panelFill; ctx.fill();
  neonStroke(ctx, () => roundRect(ctx, x, y, w, h, r), { color: accent, blur: 8, width: 1 });
}

module.exports = {
  canvas, CARD_AVAILABLE, FONT_FAMILY, iconCache, loadIcons, loadRemoteImage,
  font, roundRect, truncateToWidth, drawAvatar, drawIcon,
  gridBackground, glowText, neonStroke, neonRing, neonPanel
};
```

- [ ] **Step 3: Проверить** — `npm run check` → OK.

---

### Task 0.4: Перенести hero-лейаут в неон (`canvas/layouts/hero.js`)

**Files:**
- Create: `src/services/canvas/layouts/hero.js`

- [ ] **Step 1: Реализовать `paintHeroCard(spec)` поверх примитивов**

Сигнатура и spec сохраняются из текущего `cardRenderer.js` (строки 207-297): `{ accent, avatar, name, subtitle, ring:{value,max}|null, level, title, tiles:[{icon,label,value,accent?}] }`. Изменения: `background(...)` → `gridBackground(...)`; обводки панели/плиток → `neonPanel`/`neonStroke`; кольцо → `neonRing`; имя/заголовок/значения плиток рисуются через `glowText` акцентом. Тело `drawTile` переносится сюда (или в общий helper) с неон-обводкой.

```js
const { canvas, gridBackground, neonPanel, neonRing, neonStroke, glowText,
        drawAvatar, drawIcon, font, roundRect, truncateToWidth } = require('../primitives');
const { NEON } = require('../theme');

function drawTile(ctx, x, y, w, h, tile, accent) { /* как в cardRenderer, но neonPanel + glowText значения */ }

function paintHeroCard(spec) {
  const width = 940, height = 400;
  const cv = canvas.createCanvas(width, height);
  const ctx = cv.getContext('2d');
  const accent = spec.accent || '#A855F7';
  gridBackground(ctx, width, height, accent);
  /* левая панель через neonPanel; аватар + neonRing + бейдж уровня;
     имя/подзаголовок; правая зона: заголовок + сетка плиток 2 кол. через drawTile.
     Геометрия — как в текущем paintHeroCard. */
  return cv.toBuffer('image/png');
}
module.exports = { paintHeroCard };
```

- [ ] **Step 2: Подключить в фасад** (см. Task 0.6) и **визуальный цикл**

Run: `node scripts/render-gallery.js balance`
Read `tmp/gallery/balance.png`. Подкрутить blur/контраст/выравнивание до приятного неона. Повторять.

- [ ] **Step 3:** `npm run check` → OK. Чекпойнт.

---

### Task 0.5: Перенести profile-лейаут в неон (`canvas/layouts/profile.js`)

**Files:**
- Create: `src/services/canvas/layouts/profile.js`

- [ ] **Step 1: Реализовать `paintProfileCard(spec)` поверх примитивов**

Сигнатура/spec сохраняются (текущий `cardRenderer.js` строки 482-601): `{ accent, background, avatar, name, subtitle, ring, level, currencies, chips, presence, tags, tiles, achievements }`. Переносятся `drawLevelBox`, `drawCurrencyTile`, `drawSakura`, `drawRoleChip`, `drawAchievementsRow`, `drawPresence`, `drawTagPills` — каждая с заменой плоских обводок на `neonStroke`/`neonPanel` и значений на `glowText`. Фон через `gridBackground` (поверх можно сохранить размытый аватар-баннер из текущего кода).

- [ ] **Step 2: Визуальный цикл**

Run: `node scripts/render-gallery.js profile`
Read `tmp/gallery/profile.png`. Сверить с эталоном из Task 0.1, довести неон. Проверить: читаемость имени поверх свечения, чипы, валюты, достижения.

- [ ] **Step 3:** `npm run check` → OK. Чекпойнт.

---

### Task 0.6: Превратить `cardRenderer.js` в тонкий фасад

**Files:**
- Modify: `src/services/cardRenderer.js`

- [ ] **Step 1: Заменить тело на реэкспорт**

```js
// Фасад canvas-рендера. Реализация — в services/canvas/*.
const primitives = require('./canvas/primitives');
const { paintHeroCard } = require('./canvas/layouts/hero');
const { paintProfileCard } = require('./canvas/layouts/profile');

module.exports = {
  CARD_AVAILABLE: primitives.CARD_AVAILABLE,
  loadIcons: primitives.loadIcons,
  loadRemoteImage: primitives.loadRemoteImage,
  paintHeroCard,
  paintProfileCard
};
```

- [ ] **Step 2: Проверить, что ничего не сломалось**

Run: `npm run check` → OK.
Run: `node scripts/render-gallery.js` → оба PNG рендерятся.
Read оба PNG — идентичны результату Task 0.4/0.5.

- [ ] **Step 3: Чекпойнт** — Фаза 0 (визуально) готова на старых картах.

---

### Task 0.7: Неоновая палитра панелей (`ui/components.js`)

**Files:**
- Modify: `src/ui/components.js:17-31` (объект `COLORS`)

- [ ] **Step 1: Перевести `COLORS` на неон**

```js
const COLORS = {
  primary: 0xA855F7,
  success: 0x34F5A0,
  warning: 0xFFD24A,
  danger:  0xFF3B6B,
  info:    0x22D3EE,
  economy: 0xFFD24A,
  games:   0xFF3B6B,
  clans:   0x34F5A0,
  music:   0xA78BFA,
  love:    0xFF3B6B,
  profile: 0xA855F7,
  neutral: 0x12131A,
  accent:  0xA855F7
};
```

- [ ] **Step 2: Проверить** — `npm run check` → OK. Чекпойнт.

(`ICONS` остаются эмодзи — проверить визуально, что не дублируются по смыслу; правок кода не требуется, если соответствие доменам ок.)

---

# ФАЗА 1 — Каталог карт

Каждая карта: новый лейаут в `canvas/layouts/`, запись в `render-gallery.js` (`buildCards`), доменный билдер в `profileCard.js`, подключение в команде. Каждая визуальная задача проходит цикл «рендер → Read PNG → подкрутить».

### Task 1.1: Лейаут лидерборда (`layouts/leaderboard.js`)

**Files:**
- Create: `src/services/canvas/layouts/leaderboard.js`
- Modify: `scripts/render-gallery.js` (добавить `leaderboard` в `buildCards`)

**Spec лейаута:** `paintLeaderboardCard({ accent, title, subtitle, rows })`, где `rows: [{ rank, name, value, avatar:Image|null, highlight?:bool }]` (до 10). Геометрия: ширина 940, высота динамическая (~120 + 64·N). Шапка с `glowText` заголовком. Каждая строка — `neonPanel`: слева бейдж ранга (1-2-3 — золото/серебро/бронза свечением, дальше — приглушённый номер), круглый аватар, имя, справа значение акцентом. `highlight` (текущий игрок) — обводка акцентом ярче.

- [ ] **Step 1:** Реализовать `paintLeaderboardCard`. Экспортировать.
- [ ] **Step 2:** Добавить в `buildCards`: `leaderboard` с 10 моковыми строками (медали на 1-3, `highlight` на одной).
- [ ] **Step 3: Визуальный цикл** — `node scripts/render-gallery.js leaderboard` → Read PNG → довести.
- [ ] **Step 4:** `npm run check` → OK. Чекпойнт.

### Task 1.2: Лейаут исхода (`layouts/result.js`)

**Files:**
- Create: `src/services/canvas/layouts/result.js`
- Modify: `scripts/render-gallery.js`

**Spec:** `paintResultCard({ accent, outcome, title, avatar, name, lines, delta })` — `outcome: 'win'|'lose'|'draw'` управляет акцентом (win=`#34F5A0`, lose=`#FF3B6B`, draw=`#FFD24A`); крупный итог по центру с сильным `glowText`; `delta` (например `+1 250` / `-500`) большим шрифтом цветом исхода; `lines` — мелкие факты (ставка, баланс). Используется казино и играми.

- [ ] **Step 1:** Реализовать `paintResultCard`. Экспортировать.
- [ ] **Step 2:** Добавить в `buildCards` 2 примера: `result` (win) и `result_lose`.
- [ ] **Step 3: Визуальный цикл** → Read оба PNG → довести.
- [ ] **Step 4:** `npm run check` → OK. Чекпойнт.

### Task 1.3: Лейаут клана (`layouts/clan.js`)

**Files:**
- Create: `src/services/canvas/layouts/clan.js`
- Modify: `scripts/render-gallery.js`

**Spec:** `paintClanCard({ accent, name, tag, level, ring:{value,max}, treasury, members:[{name,avatar}], war })` — слева панель с иконкой клана (`drawIcon('clan')`), названием, тегом, уровнем + `neonRing` прогресса; справа плитки (казна/состав/побед) + полоса прогресса войны (`war:{score,target}` рисуется как неон-бар) + ряд аватаров участников (до 6).

- [ ] **Step 1:** Реализовать. Экспортировать.
- [ ] **Step 2:** Добавить в `buildCards` мок.
- [ ] **Step 3: Визуальный цикл** → довести.
- [ ] **Step 4:** `npm run check` → OK. Чекпойнт.

### Task 1.4: Парный лейаут (`layouts/love.js`)

**Files:**
- Create: `src/services/canvas/layouts/love.js`
- Modify: `scripts/render-gallery.js`

**Spec:** `paintLoveCard({ accent='#FF3B6B', a:{name,avatar}, b:{name,avatar}, days, compatibility, tiles })` — два аватара по бокам с `neonRing`, между ними сердце (`drawIcon('heart')` или процедурное) со свечением; по центру — дни вместе и `compatibility` (0-100) неон-баром; снизу плитки.

- [ ] **Step 1:** Реализовать. Экспортировать.
- [ ] **Step 2:** Добавить в `buildCards` мок (пара + одиночка-вариант с `b=null`).
- [ ] **Step 3: Визуальный цикл** → довести.
- [ ] **Step 4:** `npm run check` → OK. Чекпойнт.

### Task 1.5: Лейаут дропа (`layouts/drop.js`)

**Files:**
- Create: `src/services/canvas/layouts/drop.js`
- Modify: `scripts/render-gallery.js`

**Spec:** `paintDropCard({ rarity, itemName, itemKind, valueText, fromCase })` — `rarity: 'common'|'rare'|'epic'|'legendary'` → цвет рамки/свечения (common=`#8A90B0`, rare=`#22D3EE`, epic=`#A855F7`, legendary=`#FFD24A`). Крупная центральная плитка с иконкой предмета (по `itemKind`: coins/case/role и т.п.) и сильным свечением по редкости; подпись «Из кейса …»; значение.

- [ ] **Step 1:** Реализовать. Экспортировать.
- [ ] **Step 2:** Добавить в `buildCards` 2 примера: `drop` (epic) и `drop_legendary`.
- [ ] **Step 3: Визуальный цикл** → довести.
- [ ] **Step 4:** `npm run check` → OK. Чекпойнт.

### Task 1.6: Лейаут сетки товаров (`layouts/grid.js`)

**Files:**
- Create: `src/services/canvas/layouts/grid.js`
- Modify: `scripts/render-gallery.js`

**Spec:** `paintGridCard({ accent, title, subtitle, items:[{icon,name,price,owned?}] })` — сетка 3×2 (до 6) неон-плиток: иконка, имя, цена золотом; `owned:true` — мятная отметка «куплено». Используется магазином/инвентарём.

- [ ] **Step 1:** Реализовать. Экспортировать.
- [ ] **Step 2:** Добавить в `buildCards` мок (6 товаров, часть `owned`).
- [ ] **Step 3: Визуальный цикл** → довести.
- [ ] **Step 4:** `npm run check` → OK. Чекпойнт.

### Task 1.7: Доменные билдеры в `profileCard.js`

**Files:**
- Modify: `src/services/profileCard.js`

Для каждого нового лейаута — билдер `buildXxxCard(args) → { files, imageUrl } | { imageUrl }` по образцу существующих `buildBalanceCard`/`buildProfileCard` (привязка через `attachment(buffer)` и фоллбэк при `!CARD_AVAILABLE`). Импортировать `paint*` из соответствующих лейаутов (или из расширенного фасада `cardRenderer`).

- [ ] **Step 1:** Расширить фасад `cardRenderer.js` реэкспортом новых `paint*` (leaderboard/result/clan/love/drop/grid).
- [ ] **Step 2:** Добавить билдеры:
  - `buildLeaderboardCard({ title, subtitle, rows })`
  - `buildResultCard({ user, outcome, title, lines, delta, accent? })`
  - `buildClanCard({ clan, members, war })`
  - `buildLoveCard({ a, b, days, compatibility, tiles })`
  - `buildDropCard({ rarity, itemName, itemKind, valueText, fromCase })`
  - `buildGridCard({ title, subtitle, items })`

  Каждый: грузит нужные аватары через `loadRemoteImage` (с таймаутом), маппит домен→accent через `theme.ACCENT`, форматирует числа через `utils/format`, вызывает `paint*`, возвращает `attachment(buffer)`. Экспортировать из `module.exports`.
- [ ] **Step 3:** `npm run check` → OK. Чекпойнт.

### Task 1.8: Подключение карт к командам

Каждая под-задача: в команде заменить/дополнить ответ на `mediaPanel({ imageUrl, ... }) + reply(interaction, panel, { files })`, аналогично текущему профилю. Если `build*` вернул только `{ imageUrl }` (canvas недоступен) — `files` будет `undefined`, это валидно.

- [ ] **Step 1: `/top`** (`src/commands/tops.js`) — собрать топ-10 из `store`, аватары участников, `buildLeaderboardCard`, ответ media-панелью. `npm run check`. Чекпойнт.
- [ ] **Step 2: `/casino`** (`src/commands/casino.js`) — на исходе игры вызвать `buildResultCard({ outcome, delta, lines })`. `npm run check`. Чекпойнт.
- [ ] **Step 3: `/clan` обзор** (`src/commands/clans.js`) — `buildClanCard`. `npm run check`. Чекпойнт.
- [ ] **Step 4: `/love` профиль** (`src/commands/love.js`) — `buildLoveCard`. `npm run check`. Чекпойнт.
- [ ] **Step 5: открытие кейса** (`src/commands/economy.js`, хендлер кейсов) — `buildDropCard` по выпавшему призу. `npm run check`. Чекпойнт.
- [ ] **Step 6: `/market` магазин/инвентарь** (`src/commands/market.js` и/или economy shopPanel) — `buildGridCard`. `npm run check`. Чекпойнт.
- [ ] **Step 7: `/games` итог** (`src/commands/games.js`) — переиспользовать `buildResultCard`. `npm run check`. Чекпойнт.

> Замечание для исполнителя: перед каждой под-задачей **прочитать** соответствующий командный файл целиком, чтобы понять текущую форму ответа и `customId`-префиксы. Не менять бизнес-логику — только слой ответа/визуала.

---

# ФАЗА 2 — Структура кода

### Task 2.1: Вынести кейсы в `commands/cases.js`

**Files:**
- Create: `src/commands/cases.js`
- Modify: `src/commands/economy.js`, `src/commands/index.js`

- [ ] **Step 1:** Прочитать `economy.js` целиком. Идентифицировать всё, относящееся к кейсам: команда(ы) открытия/покупки кейса, `CASE_TYPES`, `pickWeighted`, `applyPrize`, `caseLabel` и ветки `handleComponent` с `customId`-префиксом кейсов (например `case:`).
- [ ] **Step 2:** Перенести их в `cases.js` с экспортом `{ commands, handleComponent }`. Общие хелперы, нужные обоим (`applyPrize`, `pickWeighted`), — оставить общими: либо реэкспорт из `economy.js`, либо вынести в `services/` (выбрать по факту зависимостей; не дублировать код — DRY).
- [ ] **Step 3:** Зарегистрировать `cases` в `commands/index.js` (`require` + добавить в массив `modules`).
- [ ] **Step 4: Проверить отсутствие дублей и синтаксис**

Run: `npm run check` → OK.
Run: `node -e "require('./src/commands')"` → без throw (нет дублей имён команд).

- [ ] **Step 5: Регрессия визуала** — `node scripts/render-gallery.js drop` → Read PNG → дроп-карта рендерится как прежде. Чекпойнт.

### Task 2.2: Явная карта префиксов компонентов

**Files:**
- Modify: `src/commands/index.js`

- [ ] **Step 1:** Сохранив текущую цепочку `handleComponent` (обратная совместимость), добавить экспортируемую константу-документацию префиксов и проверку на их пересечение между модулями (диагностика при старте).

```js
// Карта customId-префиксов → модуль (для читаемости и диагностики).
const COMPONENT_PREFIXES = {
  'clan:': 'clans', 'case:': 'cases', 'room:': 'rooms',
  'shop:': 'economy', 'inv:': 'economy', 'casino:': 'casino',
  'love:': 'love', 'profile:': 'profile', 'top:': 'tops'
};
```

(Точные префиксы — выверить по фактическим `customId` в модулях через grep перед фиксацией значений.)

- [ ] **Step 2:** `npm run check` → OK. `node -e "require('./src/commands')"` → без ошибок. Чекпойнт.

### Task 2.3: Финальная регрессия Фазы 2

- [ ] **Step 1:** `npm run check` → OK по всему `src/` и `scripts/`.
- [ ] **Step 2:** `node scripts/render-gallery.js` → все карты рендерятся.
- [ ] **Step 3:** Read по одному PNG каждого типа — визуально идентично концу Фазы 1.
- [ ] **Step 4: Чекпойнт** — структура наведена, поведение не изменилось.

---

# ФАЗА 3 — Новые функции (backlog)

Объём фиксируется отдельной мини-спекой ПОСЛЕ просмотра результатов Фаз 0–2. Кандидаты:
- `/top` с селектом метрики (монеты/голос/сообщения/уровень), рендер через `leaderboard`.
- Расширение клан-войны/казны с визуализацией на `clan`-карте.
- Карточка-уведомление о достижении (через `drop`-лейаут).

Не планируется детально здесь, чтобы не раздувать первый план (YAGNI). Когда понадобится — отдельный прогон brainstorming → writing-plans.

---

## Самопроверка плана (выполнено автором)

- **Покрытие спеки:** Ф0 (палитра/примитивы/панели) → Tasks 0.2–0.7; редизайн 3 карт → 0.4/0.5. Ф1 каталог из 6 новых лейаутов + 3 редизайна → Tasks 1.1–1.8 (все строки таблицы «команда→карта» закрыты). Ф2 (split economy, роутер, разбивка renderer) → Task 2.1/2.2 + сама структура canvas/ из Ф0. Ф3 — намеренно backlog.
- **Плейсхолдеры:** code-степы Фазы 0 содержат реальный код; в Фазе 1 лейауты заданы spec'ом + визуальным циклом (canvas-значения подгоняются по PNG — это природа задачи, не плейсхолдер). Тела переносимых функций явно указаны как «дословный перенос из cardRenderer.js строки N-M».
- **Согласованность имён:** примитивы `gridBackground/glowText/neonStroke/neonRing/neonPanel`; лейауты `paintHeroCard/paintProfileCard/paintLeaderboardCard/paintResultCard/paintClanCard/paintLoveCard/paintDropCard/paintGridCard`; билдеры `buildLeaderboardCard/buildResultCard/buildClanCard/buildLoveCard/buildDropCard/buildGridCard` — используются единообразно в Tasks 1.1–1.8.
- **Верификация:** адаптирована к реальности проекта (нет git/тестов): `npm run check` + рендер PNG + визуальный осмотр через Read.
