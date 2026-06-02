// Лейаут hero-карты: слева identity-панель (аватар + кольцо + уровень + имя),
// справа заголовок и сетка из 4 неон-плиток. Используется балансом и timely.

const {
  canvas, gridBackground, neonPanel, neonRing, neonStroke, glowText,
  drawAvatar, drawIcon, font, roundRect, truncateToWidth
} = require('../primitives');
const { NEON, RADIUS, GLOW, TYPE } = require('../theme');

// Плитка-стат: иконка слева, подпись (капсом) и крупное значение справа.
function drawTile(ctx, x, y, w, h, tile, accent) {
  neonPanel(ctx, x, y, w, h, RADIUS.card, accent);

  const iconSize = 40;
  const iconX = x + 18;
  const iconY = y + (h - iconSize) / 2;
  if (tile.icon) drawIcon(ctx, tile.icon, iconX, iconY, iconSize);

  const textX = x + 18 + (tile.icon ? iconSize + 16 : 0);
  const textW = x + w - textX - 16;

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = NEON.textLabel;
  ctx.font = font(600, TYPE.small);
  ctx.fillText(truncateToWidth(ctx, String(tile.label || '').toUpperCase(), textW), textX, y + h / 2 - 4);

  const valueColor = tile.accent || NEON.textPrimary;
  let valueSize = TYPE.h2;
  const value = String(tile.value ?? '—');
  ctx.font = font(700, valueSize);
  while (valueSize > 20 && ctx.measureText(value).width > textW) {
    valueSize -= 1;
    ctx.font = font(700, valueSize);
  }
  ctx.fillStyle = valueColor;
  glowText(ctx, truncateToWidth(ctx, value, textW), textX, y + h / 2 + 24, { color: valueColor, blur: GLOW.sm });
}

// spec: { accent, avatar, name, subtitle, ring:{value,max}|null, level, title,
//         tiles:[{icon,label,value,accent?}] }
function paintHeroCard(spec) {
  const width = 960;
  const height = 400;
  const cv = canvas.createCanvas(width, height);
  const ctx = cv.getContext('2d');
  const accent = spec.accent || '#A855F7';

  gridBackground(ctx, width, height, accent);

  // Левая панель.
  const panelX = 30;
  const panelY = 30;
  const panelW = 300;
  const panelH = height - 60;
  neonPanel(ctx, panelX, panelY, panelW, panelH, RADIUS.panel, accent);

  const cx = panelX + panelW / 2;
  const avatarCY = panelY + 120;
  const avatarR = 76;
  drawAvatar(ctx, spec.avatar, cx, avatarCY, avatarR);
  if (spec.ring) {
    const ratio = spec.ring.max > 0 ? spec.ring.value / spec.ring.max : 0;
    neonRing(ctx, cx, avatarCY, avatarR + 10, ratio, accent);
  }

  // Бейдж уровня.
  if (spec.level != null) {
    const badgeR = 28;
    const bx = cx + avatarR - 6;
    const by = avatarCY + avatarR - 6;
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = GLOW.lg;
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#0a0b14';
    ctx.font = font(800, 26);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(spec.level), bx, by + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // Имя и подзаголовок.
  ctx.textAlign = 'center';
  ctx.fillStyle = NEON.textPrimary;
  ctx.font = font(700, TYPE.name);
  glowText(ctx, truncateToWidth(ctx, spec.name || '', panelW - 40), cx, avatarCY + avatarR + 64, { color: accent, blur: GLOW.md });
  if (spec.subtitle) {
    ctx.fillStyle = NEON.textMuted;
    ctx.font = font(500, 19);
    ctx.fillText(truncateToWidth(ctx, spec.subtitle, panelW - 50), cx, avatarCY + avatarR + 94);
  }
  ctx.textAlign = 'left';

  // Правая зона: заголовок + сетка плиток (2 колонки).
  const rightX = panelX + panelW + 26;
  const rightW = width - rightX - 30;
  let rightY = panelY + 8;

  if (spec.title) {
    ctx.fillStyle = NEON.textPrimary;
    ctx.font = font(700, TYPE.h2);
    glowText(ctx, truncateToWidth(ctx, spec.title, rightW), rightX, rightY + 26, { color: accent, blur: GLOW.sm });
    rightY += 52;
  }

  const tiles = (spec.tiles || []).slice(0, 6);
  const cols = 2;
  const gap = 16;
  const tileW = (rightW - gap) / cols;
  const rows = Math.ceil(tiles.length / cols);
  const availableH = panelY + panelH - rightY;
  const tileH = Math.min(96, (availableH - gap * (rows - 1)) / Math.max(rows, 1));

  tiles.forEach((tile, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const tx = rightX + col * (tileW + gap);
    const ty = rightY + row * (tileH + gap);
    drawTile(ctx, tx, ty, tileW, tileH, tile, accent);
  });

  return cv.toBuffer('image/png');
}

module.exports = { paintHeroCard, drawTile };
