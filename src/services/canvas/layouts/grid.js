// Лейаут сетки товаров (магазин/инвентарь): шапка + сетка 3x2 неон-плиток
// (иконка, имя, цена золотом; owned → мятная отметка).

const {
  canvas, gridBackground, neonPanel, glowText, drawIcon,
  font, roundRect, truncateToWidth
} = require('../primitives');
const { NEON, RADIUS, GLOW, TYPE } = require('../theme');

const GOLD = '#FFD24A';
const OWNED = '#34F5A0';

// spec: { accent, title, subtitle, items:[{ icon, name, price, owned }] }
function paintGridCard(spec) {
  const accent = spec.accent || '#A855F7';
  const items = (spec.items || []).slice(0, 6);
  const width = 960;
  const height = 470;
  const cv = canvas.createCanvas(width, height);
  const ctx = cv.getContext('2d');
  gridBackground(ctx, width, height, accent);

  const padX = 30;
  // Шапка.
  ctx.fillStyle = NEON.textPrimary;
  ctx.font = font(800, TYPE.h2);
  glowText(ctx, truncateToWidth(ctx, spec.title || 'Магазин', width - padX * 2), padX, 48, { color: accent, blur: GLOW.md });
  if (spec.subtitle) {
    ctx.fillStyle = NEON.textMuted;
    ctx.font = font(500, TYPE.small);
    ctx.fillText(truncateToWidth(ctx, spec.subtitle, width - padX * 2), padX, 72);
  }

  // Сетка 3x2.
  const cols = 3;
  const rows = 2;
  const gap = 18;
  const top = 92;
  const cellW = (width - padX * 2 - gap * (cols - 1)) / cols;
  const cellH = (height - top - 24 - gap * (rows - 1)) / rows;

  items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = padX + col * (cellW + gap);
    const y = top + row * (cellH + gap);
    const lineAccent = item.owned ? OWNED : accent;
    neonPanel(ctx, x, y, cellW, cellH, RADIUS.card, lineAccent);

    // Иконка по центру сверху.
    const iconSize = 56;
    if (item.icon) drawIcon(ctx, item.icon, x + (cellW - iconSize) / 2, y + 22, iconSize);

    // Имя.
    ctx.fillStyle = NEON.textPrimary;
    ctx.font = font(700, 19);
    ctx.textAlign = 'center';
    ctx.fillText(truncateToWidth(ctx, item.name || '', cellW - 24), x + cellW / 2, y + iconSize + 50);

    // Цена или «куплено».
    if (item.owned) {
      ctx.fillStyle = OWNED;
      ctx.font = font(700, TYPE.body);
      glowText(ctx, 'Куплено', x + cellW / 2, y + iconSize + 80, { color: OWNED, blur: GLOW.sm });
    } else {
      ctx.fillStyle = GOLD;
      ctx.font = font(800, TYPE.value);
      glowText(ctx, String(item.price ?? '—'), x + cellW / 2, y + iconSize + 82, { color: GOLD, blur: GLOW.sm });
    }
    ctx.textAlign = 'left';
  });

  return cv.toBuffer('image/png');
}

module.exports = { paintGridCard };
