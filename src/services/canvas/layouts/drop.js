// Лейаут выпавшего предмета: крупная центральная плитка с иконкой и сильным
// свечением по редкости, название предмета, источник (кейс), значение.

const {
  canvas, gridBackground, neonStroke, glowText, drawIcon,
  font, roundRect, truncateToWidth
} = require('../primitives');
const { NEON, RARITY } = require('../theme');

const RARITY_LABEL = {
  common: 'ОБЫЧНЫЙ',
  rare: 'РЕДКИЙ',
  epic: 'ЭПИЧЕСКИЙ',
  legendary: 'ЛЕГЕНДАРНЫЙ'
};

// spec: { rarity, itemName, itemKind, valueText, fromCase, topLabel?, footnote? }
// topLabel переопределяет метку редкости сверху, footnote — строку «Из кейса».
function paintDropCard(spec) {
  const color = RARITY[spec.rarity] || RARITY.common;
  const width = 940;
  const height = 360;
  const cv = canvas.createCanvas(width, height);
  const ctx = cv.getContext('2d');
  gridBackground(ctx, width, height, color);

  const centerX = width / 2;

  // Верхняя метка (по умолчанию — редкость).
  ctx.fillStyle = color;
  ctx.font = font(700, 18);
  ctx.textAlign = 'center';
  glowText(ctx, spec.topLabel || RARITY_LABEL[spec.rarity] || 'ДРОП', centerX, 56, { color, blur: 10 });

  // Центральная плитка с иконкой.
  const boxSize = 140;
  const boxX = centerX - boxSize / 2;
  const boxY = 78;
  ctx.save();
  roundRect(ctx, boxX, boxY, boxSize, boxSize, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.restore();
  neonStroke(ctx, () => roundRect(ctx, boxX, boxY, boxSize, boxSize, 24), { color, blur: 22, width: 2 });

  const iconSize = 84;
  if (spec.itemKind) {
    drawIcon(ctx, spec.itemKind, centerX - iconSize / 2, boxY + (boxSize - iconSize) / 2, iconSize);
  }

  // Название предмета.
  ctx.fillStyle = NEON.textPrimary;
  ctx.font = font(800, 36);
  glowText(ctx, truncateToWidth(ctx, spec.itemName || 'Предмет', width - 120), centerX, boxY + boxSize + 56, { color, blur: 12 });

  // Значение / источник.
  if (spec.valueText) {
    ctx.fillStyle = color;
    ctx.font = font(700, 24);
    glowText(ctx, String(spec.valueText), centerX, boxY + boxSize + 90, { color, blur: 8 });
  }
  const footnote = spec.footnote != null
    ? spec.footnote
    : (spec.fromCase ? `Из кейса: ${spec.fromCase}` : null);
  if (footnote) {
    ctx.fillStyle = NEON.textMuted;
    ctx.font = font(500, 16);
    ctx.fillText(truncateToWidth(ctx, footnote, width - 120), centerX, height - 22);
  }
  ctx.textAlign = 'left';

  return cv.toBuffer('image/png');
}

module.exports = { paintDropCard };
