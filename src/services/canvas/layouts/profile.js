// Лейаут карты профиля: слева identity-панель (аватар-баннер + кольцо + уровень +
// имя + статус + валюты), справа три яруса — чипы (статус/роль/клан), статы 2x2,
// ряд достижений. Всё в dark-neon со свечением.

const {
  canvas, neonPanel, neonRing, neonStroke, glowText,
  drawAvatar, drawIcon, font, roundRect, truncateToWidth
} = require('../primitives');
const { NEON } = require('../theme');
const { drawTile } = require('./hero');

// Фон профиля: тематический градиент (покупаемый фон) + неоновая сетка + свечение.
function themedBackground(ctx, width, height, theme, accent) {
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, theme?.from || NEON.bgFrom);
  grad.addColorStop(1, theme?.to || NEON.bgTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = NEON.grid;
  ctx.lineWidth = 1;
  const step = 40;
  ctx.beginPath();
  for (let x = step; x < width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
  for (let y = step; y < height; y += step) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
  ctx.stroke();
  ctx.restore();

  const glow = ctx.createRadialGradient(170, 120, 30, 170, 120, 420);
  glow.addColorStop(0, `${accent}33`);
  glow.addColorStop(1, '#00000000');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawLevelBox(ctx, x, y, size, value, accent) {
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 16;
  roundRect(ctx, x, y, size, size, 14);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#0a0b14';
  ctx.font = font(800, size * 0.5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x + size / 2, y + size / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawCurrencyTile(ctx, x, y, w, h, tile, accent) {
  neonPanel(ctx, x, y, w, h, 16, accent);
  const padX = 18;

  const value = String(tile.value ?? '—');
  const maxValueW = w * 0.42;
  let valueSize = 26;
  ctx.font = font(800, valueSize);
  while (valueSize > 16 && ctx.measureText(value).width > maxValueW) {
    valueSize -= 1;
    ctx.font = font(800, valueSize);
  }
  const valueText = truncateToWidth(ctx, value, maxValueW);
  const valueW = ctx.measureText(valueText).width;
  ctx.fillStyle = tile.color || NEON.textPrimary;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  glowText(ctx, valueText, x + w - padX, y + h / 2 + 1, { color: tile.color || NEON.textPrimary, blur: 7 });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const leftMax = w - padX * 2 - valueW - 16;
  ctx.fillStyle = NEON.textLabel;
  ctx.font = font(600, 12);
  ctx.fillText(truncateToWidth(ctx, String(tile.sub || 'COIN').toUpperCase(), leftMax), x + padX, y + 24);
  ctx.fillStyle = tile.color || NEON.textPrimary;
  ctx.font = font(700, 22);
  ctx.fillText(truncateToWidth(ctx, tile.name, leftMax), x + padX, y + h - 16);
}

// Процедурная «сакура» в цвете раскраса.
function drawSakura(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i += 1) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.62, r * 0.34, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Компактный чип: иконка-бокс слева + текст. kind: 'love'|'role'|'clan'.
function drawRoleChip(ctx, x, y, w, h, chip, accent) {
  neonPanel(ctx, x, y, w, h, 18, accent);

  const iconBox = 38;
  const ix = x + 14;
  const iy = y + (h - iconBox) / 2;
  const iconCX = ix + iconBox / 2;
  const iconCY = iy + iconBox / 2;

  roundRect(ctx, ix, iy, iconBox, iconBox, 11);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();

  if (chip.kind === 'love') {
    drawSakura(ctx, iconCX, iconCY, iconBox / 2 - 7, chip.accent || accent);
  } else if (chip.kind === 'role') {
    if (chip.icon) {
      ctx.save();
      roundRect(ctx, ix, iy, iconBox, iconBox, 11);
      ctx.clip();
      ctx.drawImage(chip.icon, ix, iy, iconBox, iconBox);
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = chip.color || accent;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(iconCX, iconCY, iconBox / 2 - 9, 0, Math.PI * 2);
      ctx.fillStyle = chip.color || accent;
      ctx.fill();
      ctx.restore();
    }
  } else if (chip.kind === 'clan') {
    drawIcon(ctx, 'clan', ix + 5, iy + 5, iconBox - 10);
  }

  const textX = ix + iconBox + 11;
  const textW = x + w - textX - 12;
  ctx.fillStyle = NEON.textPrimary;
  ctx.font = font(600, 17);
  ctx.textBaseline = 'middle';
  ctx.fillText(truncateToWidth(ctx, String(chip.text || ''), textW), textX, iconCY + 1);
  ctx.textBaseline = 'alphabetic';
}

// Ряд из трёх слотов достижений.
function drawAchievementsRow(ctx, x, y, w, h, achievements, accent) {
  const count = 3;
  const gap = 14;
  const cw = (w - gap * (count - 1)) / count;
  for (let i = 0; i < count; i += 1) {
    const cx = x + i * (cw + gap);
    const name = achievements[i];
    neonPanel(ctx, cx, y, cw, h, 16, name ? accent : 'rgba(138,144,176,0.25)');

    const dotR = 6;
    const dotX = cx + 16 + dotR;
    const dotY = y + h / 2;
    if (name) {
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = name ? accent : 'rgba(255,255,255,0.18)';
    ctx.fill();
    if (name) ctx.restore();

    const textX = dotX + dotR + 12;
    const textW = cx + cw - textX - 12;
    ctx.fillStyle = NEON.textLabel;
    ctx.font = font(600, 12);
    ctx.fillText('ДОСТИЖЕНИЕ', textX, y + h / 2 - 6);
    if (name) {
      ctx.fillStyle = NEON.textPrimary;
      ctx.font = font(700, 16);
      ctx.fillText(truncateToWidth(ctx, name, textW), textX, y + h / 2 + 16);
    } else {
      ctx.fillStyle = '#6b7080';
      ctx.font = font(600, 16);
      ctx.fillText('Отсутствует', textX, y + h / 2 + 16);
    }
  }
}

// Индикатор присутствия: цветная точка + подпись.
function drawPresence(ctx, x, cy, presence) {
  const r = 6;
  ctx.save();
  ctx.shadowColor = presence.color || '#747f8d';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x + r, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = presence.color || '#747f8d';
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#c9cdd8';
  ctx.font = font(600, 15);
  ctx.textBaseline = 'middle';
  ctx.fillText(truncateToWidth(ctx, String(presence.label || ''), 220), x + r * 2 + 10, cy + 1);
  ctx.textBaseline = 'alphabetic';
}

// Ряд тег-пилюль активности.
function drawTagPills(ctx, x, yTop, maxW, tags, accent) {
  const h = 24;
  const padX = 11;
  const gap = 8;
  let cursor = x;
  ctx.textBaseline = 'middle';
  for (const tag of tags) {
    ctx.font = font(600, 13);
    const label = String(tag);
    const pillW = ctx.measureText(label).width + padX * 2;
    if (cursor + pillW > x + maxW) break;
    roundRect(ctx, cursor, yTop, pillW, h, h / 2);
    ctx.fillStyle = `${accent}22`;
    ctx.fill();
    neonStroke(ctx, () => roundRect(ctx, cursor, yTop, pillW, h, h / 2), { color: accent, blur: 6, width: 1 });
    ctx.fillStyle = accent;
    ctx.fillText(label, cursor + padX, yTop + h / 2 + 1);
    cursor += pillW + gap;
  }
  ctx.textBaseline = 'alphabetic';
}

function paintProfileCard(spec) {
  const width = 960;
  const height = 470;
  const cv = canvas.createCanvas(width, height);
  const ctx = cv.getContext('2d');
  const accent = spec.accent || '#A855F7';
  themedBackground(ctx, width, height, spec.background, accent);

  // ----- Левая панель -----
  const px = 28;
  const py = 28;
  const pw = 300;
  const ph = height - 56;
  roundRect(ctx, px, py, pw, ph, 26);
  ctx.fillStyle = NEON.panelFill;
  ctx.fill();

  // Баннер: аватар крупно за панелью сверху, размытый и затемнённый.
  if (spec.avatar) {
    ctx.save();
    roundRect(ctx, px, py, pw, ph, 26);
    ctx.clip();
    ctx.globalAlpha = 0.32;
    try { ctx.filter = 'blur(3px)'; } catch (error) { /* фильтр может быть недоступен */ }
    ctx.drawImage(spec.avatar, px - 10, py - 10, pw + 20, pw + 20);
    try { ctx.filter = 'none'; } catch (error) { /* noop */ }
    ctx.globalAlpha = 1;
    const overlay = ctx.createLinearGradient(0, py, 0, py + ph);
    overlay.addColorStop(0, 'rgba(8,9,16,0.35)');
    overlay.addColorStop(0.55, 'rgba(8,9,16,0.9)');
    overlay.addColorStop(1, 'rgba(8,9,16,0.98)');
    ctx.fillStyle = overlay;
    ctx.fillRect(px, py, pw, ph);
    ctx.restore();
  }

  neonStroke(ctx, () => roundRect(ctx, px, py, pw, ph, 26), { color: accent, blur: 10, width: 1.2 });

  const cx = px + pw / 2;
  const avatarCY = py + 72;
  const avatarR = 56;
  drawAvatar(ctx, spec.avatar, cx, avatarCY, avatarR);
  if (spec.ring) {
    const ratio = spec.ring.max > 0 ? spec.ring.value / spec.ring.max : 0;
    neonRing(ctx, cx, avatarCY, avatarR + 9, ratio, accent);
  }
  if (spec.level != null) {
    drawLevelBox(ctx, cx + avatarR - 4, avatarCY + avatarR - 16, 44, spec.level, accent);
  }

  // Имя с акцент-полоской и подзаголовок.
  const nameY = avatarCY + avatarR + 44;
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  ctx.fillStyle = accent;
  roundRect(ctx, px + 22, nameY - 21, 5, 25, 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = NEON.textPrimary;
  ctx.font = font(700, 26);
  ctx.fillText(truncateToWidth(ctx, spec.name || '', pw - 70), px + 38, nameY);
  if (spec.subtitle) {
    ctx.fillStyle = NEON.textMuted;
    ctx.font = font(500, 15);
    ctx.fillText(truncateToWidth(ctx, spec.subtitle, pw - 60), px + 38, nameY + 21);
  }

  // Присутствие + теги активности.
  let leftCursorY = nameY + 40;
  if (spec.presence) {
    drawPresence(ctx, px + 24, leftCursorY, spec.presence);
    leftCursorY += 28;
  }
  if (Array.isArray(spec.tags) && spec.tags.length) {
    drawTagPills(ctx, px + 22, leftCursorY, pw - 44, spec.tags, accent);
  }

  // Плитки валют (прижаты к низу панели).
  const currencies = (spec.currencies || []).slice(0, 2);
  const curW = pw - 44;
  const curH = 56;
  const curGap = 10;
  currencies.forEach((tile, index) => {
    const ty = py + ph - 18 - (currencies.length - index) * (curH + curGap) + curGap;
    drawCurrencyTile(ctx, px + 22, ty, curW, curH, tile, accent);
  });

  // ----- Правая зона -----
  const rx = px + pw + 24;
  const rw = width - rx - 28;
  const gap = 16;
  let ry = py;

  // 1. Полоса чипов: статус / роль / клан.
  const chips = (spec.chips || []).slice(0, 3);
  const chipH = 78;
  if (chips.length) {
    const chipW = (rw - gap * (chips.length - 1)) / chips.length;
    chips.forEach((chip, index) => {
      drawRoleChip(ctx, rx + index * (chipW + gap), ry, chipW, chipH, chip, accent);
    });
  }
  ry += chipH + gap;

  // 2. Сетка статов 2x2.
  const colW = (rw - gap) / 2;
  const tileH = 96;
  const tiles = (spec.tiles || []).slice(0, 4);
  tiles.forEach((tile, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    drawTile(ctx, rx + col * (colW + gap), ry + row * (tileH + gap), colW, tileH, tile, accent);
  });
  ry += tileH * 2 + gap * 2;

  // 3. Ряд достижений.
  drawAchievementsRow(ctx, rx, ry, rw, 72, spec.achievements || [], accent);

  return cv.toBuffer('image/png');
}

module.exports = { paintProfileCard };
