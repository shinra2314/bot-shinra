// Лейаут исхода игры (казино/дуэль): крупный итог по центру с сильным свечением,
// дельта баланса цветом исхода, мелкие факты снизу. outcome: 'win'|'lose'|'draw'.

const {
  canvas, gridBackground, neonPanel, glowText, drawAvatar,
  font, truncateToWidth
} = require('../primitives');
const { NEON } = require('../theme');

const OUTCOME = {
  win: { color: '#34F5A0', word: 'ПОБЕДА' },
  lose: { color: '#FF3B6B', word: 'ПОРАЖЕНИЕ' },
  draw: { color: '#FFD24A', word: 'НИЧЬЯ' }
};

// spec: { outcome, title, avatar, name, lines:[string], delta, accent? }
function paintResultCard(spec) {
  const oc = OUTCOME[spec.outcome] || OUTCOME.draw;
  const accent = spec.accent || oc.color;
  const width = 940;
  const height = 360;
  const cv = canvas.createCanvas(width, height);
  const ctx = cv.getContext('2d');
  gridBackground(ctx, width, height, accent);

  const centerX = width / 2;

  // Аватар + имя сверху по центру.
  const avCY = 78;
  if (spec.avatar || spec.name) {
    drawAvatar(ctx, spec.avatar, centerX, avCY, 40);
    if (spec.name) {
      ctx.fillStyle = NEON.textMuted;
      ctx.font = font(600, 18);
      ctx.textAlign = 'center';
      ctx.fillText(truncateToWidth(ctx, spec.name, width - 120), centerX, avCY + 70);
      ctx.textAlign = 'left';
    }
  }

  // Слово исхода — крупно со свечением.
  ctx.fillStyle = oc.color;
  ctx.font = font(800, 60);
  ctx.textAlign = 'center';
  glowText(ctx, spec.title || oc.word, centerX, 220, { color: oc.color, blur: 24 });

  // Дельта баланса.
  if (spec.delta != null) {
    ctx.fillStyle = oc.color;
    ctx.font = font(800, 40);
    glowText(ctx, String(spec.delta), centerX, 274, { color: oc.color, blur: 14 });
  }
  ctx.textAlign = 'left';

  // Факты снизу — ряд плиток.
  const lines = (spec.lines || []).slice(0, 3);
  if (lines.length) {
    const gap = 16;
    const padX = 60;
    const tileW = (width - padX * 2 - gap * (lines.length - 1)) / lines.length;
    const tileH = 48;
    const y = height - tileH - 26;
    lines.forEach((line, i) => {
      const x = padX + i * (tileW + gap);
      neonPanel(ctx, x, y, tileW, tileH, 14, accent);
      ctx.fillStyle = NEON.textPrimary;
      ctx.font = font(600, 17);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(truncateToWidth(ctx, String(line), tileW - 20), x + tileW / 2, y + tileH / 2 + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    });
  }

  return cv.toBuffer('image/png');
}

module.exports = { paintResultCard };
