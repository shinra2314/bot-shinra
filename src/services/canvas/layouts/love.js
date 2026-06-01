// Парный лейаут: два аватара по бокам с кольцами, сердце по центру со свечением,
// дни вместе и совместимость неон-баром, плитки снизу. b=null → одиночка.

const {
  canvas, gridBackground, neonPanel, neonRing, neonBar, glowText, drawAvatar,
  font, truncateToWidth
} = require('../primitives');
const { NEON } = require('../theme');

function drawHeart(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 100, size / 100);
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 30);
  ctx.bezierCurveTo(-55, -25, -30, -65, 0, -35);
  ctx.bezierCurveTo(30, -65, 55, -25, 0, 30);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// spec: { accent, a:{name,avatar}, b:{name,avatar}|null, days, compatibility, tiles }
function paintLoveCard(spec) {
  const accent = spec.accent || '#FF3B6B';
  const width = 940;
  const height = 400;
  const cv = canvas.createCanvas(width, height);
  const ctx = cv.getContext('2d');
  gridBackground(ctx, width, height, accent);

  const avCY = 130;
  const avR = 64;
  const leftCX = 200;
  const rightCX = width - 200;
  const centerX = width / 2;

  // Левый аватар.
  drawAvatar(ctx, spec.a?.avatar, leftCX, avCY, avR);
  neonRing(ctx, leftCX, avCY, avR + 8, 1, accent);
  ctx.fillStyle = NEON.textPrimary;
  ctx.font = font(700, 24);
  ctx.textAlign = 'center';
  glowText(ctx, truncateToWidth(ctx, spec.a?.name || '—', 300), leftCX, avCY + avR + 48, { color: accent, blur: 8 });

  // Правый аватар или плейсхолдер «свободно».
  if (spec.b) {
    drawAvatar(ctx, spec.b.avatar, rightCX, avCY, avR);
    neonRing(ctx, rightCX, avCY, avR + 8, 1, accent);
    ctx.fillStyle = NEON.textPrimary;
    ctx.font = font(700, 24);
    glowText(ctx, truncateToWidth(ctx, spec.b.name || '—', 300), rightCX, avCY + avR + 48, { color: accent, blur: 8 });
  } else {
    drawAvatar(ctx, null, rightCX, avCY, avR);
    neonRing(ctx, rightCX, avCY, avR + 8, 0, accent);
    ctx.fillStyle = NEON.textMuted;
    ctx.font = font(600, 22);
    ctx.fillText('Свободно', rightCX, avCY + avR + 48);
  }
  ctx.textAlign = 'left';

  // Сердце по центру.
  drawHeart(ctx, centerX, avCY - 4, 88, accent);

  // Дни вместе / совместимость.
  if (spec.days != null) {
    ctx.fillStyle = NEON.textMuted;
    ctx.font = font(600, 16);
    ctx.textAlign = 'center';
    ctx.fillText('ВМЕСТЕ', centerX, avCY + 64);
    ctx.fillStyle = NEON.textPrimary;
    ctx.font = font(800, 26);
    glowText(ctx, `${spec.days} дн.`, centerX, avCY + 96, { color: accent, blur: 8 });
    ctx.textAlign = 'left';
  }

  // Полоса совместимости.
  if (spec.compatibility != null) {
    const barW = 520;
    const bx = centerX - barW / 2;
    const by = height - 96;
    ctx.fillStyle = NEON.textLabel;
    ctx.font = font(600, 14);
    ctx.fillText('СОВМЕСТИМОСТЬ', bx, by - 8);
    ctx.fillStyle = accent;
    ctx.font = font(700, 16);
    ctx.textAlign = 'right';
    ctx.fillText(`${spec.compatibility}%`, bx + barW, by - 8);
    ctx.textAlign = 'left';
    neonBar(ctx, bx, by, barW, 16, spec.compatibility / 100, accent);
  }

  // Плитки снизу.
  const tiles = (spec.tiles || []).slice(0, 3);
  if (tiles.length) {
    const gap = 16;
    const padX = 60;
    const tileW = (width - padX * 2 - gap * (tiles.length - 1)) / tiles.length;
    const tileH = 44;
    const y = height - tileH - 18;
    tiles.forEach((t, i) => {
      const x = padX + i * (tileW + gap);
      neonPanel(ctx, x, y, tileW, tileH, 12, accent);
      ctx.fillStyle = NEON.textLabel;
      ctx.font = font(600, 12);
      ctx.textAlign = 'center';
      ctx.fillText(String(t.label || '').toUpperCase(), x + tileW / 2, y + 18);
      ctx.fillStyle = NEON.textPrimary;
      ctx.font = font(700, 16);
      ctx.fillText(truncateToWidth(ctx, String(t.value ?? ''), tileW - 16), x + tileW / 2, y + 36);
      ctx.textAlign = 'left';
    });
  }

  return cv.toBuffer('image/png');
}

module.exports = { paintLoveCard };
