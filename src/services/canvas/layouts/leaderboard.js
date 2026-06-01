// Лейаут лидерборда: шапка + вертикальный список строк (ранг/медаль, аватар,
// имя, значение). Высота карты динамическая по числу строк.

const {
  canvas, gridBackground, neonPanel, glowText, drawAvatar,
  font, roundRect, truncateToWidth
} = require('../primitives');
const { NEON } = require('../theme');

const MEDALS = { 1: '#FFD24A', 2: '#C7CCDA', 3: '#E08A4B' };

// spec: { accent, title, subtitle, rows:[{ rank, name, value, avatar, highlight }] }
function paintLeaderboardCard(spec) {
  const accent = spec.accent || '#FFD24A';
  const rows = (spec.rows || []).slice(0, 10);
  const width = 940;
  const headerH = 96;
  const rowH = 64;
  const rowGap = 10;
  const padX = 30;
  const height = headerH + rows.length * (rowH + rowGap) + 20;

  const cv = canvas.createCanvas(width, height);
  const ctx = cv.getContext('2d');
  gridBackground(ctx, width, height, accent);

  // Шапка.
  ctx.fillStyle = NEON.textPrimary;
  ctx.font = font(800, 34);
  glowText(ctx, truncateToWidth(ctx, spec.title || 'Топ', width - padX * 2), padX, 50, { color: accent, blur: 12 });
  if (spec.subtitle) {
    ctx.fillStyle = NEON.textMuted;
    ctx.font = font(500, 17);
    ctx.fillText(truncateToWidth(ctx, spec.subtitle, width - padX * 2), padX, 76);
  }

  let y = headerH;
  for (const row of rows) {
    const medal = MEDALS[row.rank];
    const lineAccent = row.highlight ? accent : (medal || NEON.panelStroke);
    neonPanel(ctx, padX, y, width - padX * 2, rowH, 16, lineAccent);

    // Ранг-бейдж.
    const badgeX = padX + 14;
    const badgeCY = y + rowH / 2;
    if (medal) {
      ctx.save();
      ctx.shadowColor = medal;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(badgeX + 18, badgeCY, 18, 0, Math.PI * 2);
      ctx.fillStyle = medal;
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#0a0b14';
      ctx.font = font(800, 20);
    } else {
      ctx.fillStyle = NEON.textMuted;
      ctx.font = font(700, 20);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(row.rank), badgeX + 18, badgeCY + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Аватар.
    const avR = 22;
    const avCX = badgeX + 36 + 16 + avR;
    drawAvatar(ctx, row.avatar, avCX, badgeCY, avR);

    // Имя.
    const nameX = avCX + avR + 16;
    const valueText = String(row.value ?? '');
    ctx.font = font(700, 22);
    const valueW = ctx.measureText(valueText).width;
    const nameW = (width - padX) - nameX - valueW - 40;
    ctx.fillStyle = NEON.textPrimary;
    ctx.font = font(600, 20);
    ctx.textBaseline = 'middle';
    ctx.fillText(truncateToWidth(ctx, row.name || '', nameW), nameX, badgeCY + 1);

    // Значение справа.
    ctx.fillStyle = accent;
    ctx.font = font(700, 22);
    ctx.textAlign = 'right';
    glowText(ctx, valueText, width - padX - 18, badgeCY + 1, { color: accent, blur: 7 });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    y += rowH + rowGap;
  }

  return cv.toBuffer('image/png');
}

module.exports = { paintLeaderboardCard };
