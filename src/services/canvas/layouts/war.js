// Versus-лейаут клановой войны: два клана по бокам, их очки, неоновый «tug-of-war»
// бар доли очков по центру, подзаголовок (время/итог).

const {
  canvas, gridBackground, glowText, drawIcon,
  font, roundRect, truncateToWidth
} = require('../primitives');
const { NEON } = require('../theme');

const LEFT = '#22D3EE';
const RIGHT = '#FF3B6B';

// spec: { title, subtitle, a:{name,score}, b:{name,score}, accent? }
function paintWarCard(spec) {
  const accent = spec.accent || '#FF3B6B';
  const width = 940;
  const height = 360;
  const cv = canvas.createCanvas(width, height);
  const ctx = cv.getContext('2d');
  gridBackground(ctx, width, height, accent);

  const centerX = width / 2;
  const aScore = Number(spec.a?.score || 0);
  const bScore = Number(spec.b?.score || 0);
  const total = aScore + bScore;
  const aShare = total > 0 ? aScore / total : 0.5;

  // Заголовок.
  ctx.fillStyle = NEON.textPrimary;
  ctx.font = font(800, 32);
  ctx.textAlign = 'center';
  glowText(ctx, spec.title || 'Клановая война', centerX, 56, { color: accent, blur: 12 });
  if (spec.subtitle) {
    ctx.fillStyle = NEON.textMuted;
    ctx.font = font(500, 17);
    ctx.fillText(truncateToWidth(ctx, spec.subtitle, width - 80), centerX, 84);
  }

  // Имена кланов.
  const namesY = 150;
  ctx.font = font(700, 26);
  ctx.textAlign = 'left';
  ctx.fillStyle = LEFT;
  glowText(ctx, truncateToWidth(ctx, spec.a?.name || 'Клан A', width / 2 - 90), 50, namesY, { color: LEFT, blur: 8 });
  ctx.textAlign = 'right';
  ctx.fillStyle = RIGHT;
  glowText(ctx, truncateToWidth(ctx, spec.b?.name || 'Клан B', width / 2 - 90), width - 50, namesY, { color: RIGHT, blur: 8 });

  // «VS» по центру.
  ctx.textAlign = 'center';
  ctx.fillStyle = NEON.textMuted;
  ctx.font = font(800, 24);
  ctx.fillText('VS', centerX, namesY - 2);

  // Очки крупно.
  const scoreY = 215;
  ctx.font = font(800, 52);
  ctx.textAlign = 'left';
  ctx.fillStyle = LEFT;
  glowText(ctx, String(aScore), 50, scoreY, { color: LEFT, blur: 12 });
  ctx.textAlign = 'right';
  ctx.fillStyle = RIGHT;
  glowText(ctx, String(bScore), width - 50, scoreY, { color: RIGHT, blur: 12 });
  ctx.textAlign = 'left';

  // Tug-of-war бар: левая доля циан, правая — розовая.
  const barX = 50;
  const barY = 260;
  const barW = width - 100;
  const barH = 26;
  const leftW = Math.round(barW * aShare);

  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  ctx.save();
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.clip();
  // Правая (вся ширина) — розовая основа.
  ctx.shadowColor = RIGHT;
  ctx.shadowBlur = 12;
  ctx.fillStyle = RIGHT;
  ctx.fillRect(barX, barY, barW, barH);
  // Левая доля — циан поверх.
  ctx.shadowColor = LEFT;
  ctx.fillStyle = LEFT;
  ctx.fillRect(barX, barY, leftW, barH);
  ctx.restore();

  // Разделитель в точке доли.
  ctx.fillStyle = NEON.textPrimary;
  ctx.fillRect(barX + leftW - 1, barY - 3, 2, barH + 6);

  // Проценты под баром.
  ctx.font = font(600, 15);
  ctx.fillStyle = LEFT;
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(aShare * 100)}%`, barX, barY + barH + 22);
  ctx.fillStyle = RIGHT;
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round((1 - aShare) * 100)}%`, barX + barW, barY + barH + 22);
  ctx.textAlign = 'left';

  return cv.toBuffer('image/png');
}

module.exports = { paintWarCard };
