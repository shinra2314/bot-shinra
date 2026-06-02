// Низкоуровневые примитивы canvas-рендера: инициализация, шрифт, кэш иконок,
// базовые фигуры и неоновые эффекты (свечение текста/обводки, кольцо, фон-сетка).
// Лейауты в services/canvas/layouts/* собираются из этих примитивов.

const path = require('path');
const fs = require('fs');
const { NEON, GLOW } = require('./theme');

let canvas = null;
let CARD_AVAILABLE = false;

const ASSETS = path.join(__dirname, '..', '..', '..', 'assets');
const FONT_FAMILY = 'Montserrat';
const ICON_FILES = {
  coins: 'coins.png',
  lotus: 'lotus.png',
  snow: 'snow.png',
  level: 'level.png',
  voice: 'voice.png',
  messages: 'messages.png',
  trophy: 'trophy.png',
  heart: 'heart.png',
  clan: 'clan.png',
  case: 'case.png'
};

// Реальные начертания Montserrat по весам. Skia (napi-rs) подбирает нужный face
// внутри семейства по weight из font-строки — поэтому регистрируем все файлы под
// одним именем FONT_FAMILY. Если весовых файлов нет, откатываемся на единый
// Montserrat.ttf (старое поведение), чтобы рендер не падал.
const FONT_WEIGHT_FILES = [
  'Montserrat-Regular.ttf',
  'Montserrat-Medium.ttf',
  'Montserrat-SemiBold.ttf',
  'Montserrat-Bold.ttf',
  'Montserrat-ExtraBold.ttf'
];

try {
  canvas = require('@napi-rs/canvas');
  const fontsDir = path.join(ASSETS, 'fonts');
  let registered = 0;
  for (const file of FONT_WEIGHT_FILES) {
    const weightPath = path.join(fontsDir, file);
    if (fs.existsSync(weightPath)) {
      canvas.GlobalFonts.registerFromPath(weightPath, FONT_FAMILY);
      registered += 1;
    }
  }
  if (registered === 0) {
    const legacyPath = path.join(fontsDir, 'Montserrat.ttf');
    if (fs.existsSync(legacyPath)) {
      canvas.GlobalFonts.registerFromPath(legacyPath, FONT_FAMILY);
    }
  }
  CARD_AVAILABLE = true;
} catch (error) {
  CARD_AVAILABLE = false;
}

const iconCache = new Map();
let iconsLoaded = false;

async function loadIcons() {
  if (iconsLoaded || !CARD_AVAILABLE) return;
  for (const [key, file] of Object.entries(ICON_FILES)) {
    try {
      iconCache.set(key, await canvas.loadImage(path.join(ASSETS, 'icons', file)));
    } catch (error) {
      iconCache.set(key, null);
    }
  }
  iconsLoaded = true;
}

function font(weight, size) {
  return `${weight} ${size}px ${FONT_FAMILY}, "Segoe UI", sans-serif`;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncateToWidth(ctx, value, maxWidth) {
  let text = String(value ?? '');
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}

function drawAvatar(ctx, image, cx, cy, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (image) {
    ctx.drawImage(image, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = '#1a1d2a';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}

function drawIcon(ctx, key, x, y, size) {
  const image = iconCache.get(key);
  if (image) ctx.drawImage(image, x, y, size, size);
}

// Кэш плитки шума для зернистости. Генерим один раз: маленький тайл со
// случайными монохромными пикселями, потом тайлим его с низкой прозрачностью.
let grainTile = null;
function getGrainTile() {
  if (grainTile || !canvas) return grainTile;
  const size = 128;
  const tile = canvas.createCanvas(size, size);
  const tctx = tile.getContext('2d');
  const img = tctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  grainTile = tile;
  return grainTile;
}

// Глубина поверх фона: виньетка по краям + лёгкое плёночное зерно.
// Общая для gridBackground и тематического фона профиля — единый «премиум» вид.
function addDepth(ctx, w, h) {
  // Виньетка: прозрачный центр → затемнение к углам.
  const vignette = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.32,
    w / 2, h / 2, Math.max(w, h) * 0.72
  );
  vignette.addColorStop(0, '#00000000');
  vignette.addColorStop(1, 'rgba(2,3,8,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // Зерно: тайлим кэш-плитку с малой прозрачностью.
  const tile = getGrainTile();
  if (tile) {
    ctx.save();
    ctx.globalAlpha = 0.035;
    for (let y = 0; y < h; y += tile.height) {
      for (let x = 0; x < w; x += tile.width) {
        ctx.drawImage(tile, x, y);
      }
    }
    ctx.restore();
  }
}

// Фон: тёмный градиент + неоновая сетка + угловое свечение акцентом.
function gridBackground(ctx, w, h, accent) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, NEON.bgFrom);
  g.addColorStop(1, NEON.bgTo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = NEON.grid;
  ctx.lineWidth = 1;
  const step = 40;
  ctx.beginPath();
  for (let x = step; x < w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = step; y < h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.restore();

  const glow = ctx.createRadialGradient(150, 110, 20, 150, 110, 460);
  glow.addColorStop(0, `${accent}30`);
  glow.addColorStop(1, '#00000000');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Второе мягкое свечение в правом нижнем углу для глубины.
  const glow2 = ctx.createRadialGradient(w - 120, h - 80, 10, w - 120, h - 80, 380);
  glow2.addColorStop(0, `${accent}1c`);
  glow2.addColorStop(1, '#00000000');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);

  addDepth(ctx, w, h);
}

// Текст со свечением. Вызывающий заранее ставит font/fillStyle/textAlign/baseline.
function glowText(ctx, str, x, y, { color, blur = 12 } = {}) {
  ctx.save();
  ctx.shadowColor = color || ctx.fillStyle;
  ctx.shadowBlur = blur;
  ctx.fillText(str, x, y);
  ctx.restore();
}

// Светящаяся обводка по построенному пути (pathFn рисует path в ctx).
function neonStroke(ctx, pathFn, { color, blur = 10, width = 1.5 } = {}) {
  ctx.save();
  pathFn();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

// Кольцо прогресса со свечением.
function neonRing(ctx, cx, cy, radius, ratio, color) {
  ctx.save();
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped > 0) {
    const start = -Math.PI / 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = GLOW.lg;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + clamped * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Неоновая плитка-панель: тёмная заливка + светящаяся обводка.
function neonPanel(ctx, x, y, w, h, r, accent) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = NEON.panelFill;
  ctx.fill();
  neonStroke(ctx, () => roundRect(ctx, x, y, w, h, r), { color: accent, blur: GLOW.sm, width: 1 });
}

// Неоновый горизонтальный прогресс-бар.
function neonBar(ctx, x, y, w, h, ratio, color) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped > 0) {
    ctx.save();
    roundRect(ctx, x, y, Math.max(h, w * clamped), h, h / 2);
    ctx.shadowColor = color;
    ctx.shadowBlur = GLOW.md;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
}

async function loadRemoteImage(url, timeoutMs = 1800) {
  if (!CARD_AVAILABLE || !url) return null;
  try {
    return await Promise.race([
      canvas.loadImage(url),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ]);
  } catch (error) {
    return null;
  }
}

module.exports = {
  canvas,
  CARD_AVAILABLE,
  FONT_FAMILY,
  iconCache,
  loadIcons,
  loadRemoteImage,
  font,
  roundRect,
  truncateToWidth,
  drawAvatar,
  drawIcon,
  gridBackground,
  addDepth,
  glowText,
  neonStroke,
  neonRing,
  neonPanel,
  neonBar
};
