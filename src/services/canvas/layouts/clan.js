// Лейаут карты клана: слева identity-панель (иконка клана + название + тег +
// уровень + кольцо), справа плитки (казна/состав/побед), полоса войны, аватары.

const {
  canvas, gridBackground, neonPanel, neonRing, neonBar, glowText, drawAvatar,
  drawIcon, font, roundRect, truncateToWidth
} = require('../primitives');
const { NEON } = require('../theme');
const { drawTile } = require('./hero');

// spec: { accent, name, tag, level, ring:{value,max}, treasury, members:[{name,avatar}],
//         war:{score,target,label}, tiles:[{icon,label,value,accent?}] }
function paintClanCard(spec) {
  const accent = spec.accent || '#34F5A0';
  const width = 960;
  const height = 470;
  const cv = canvas.createCanvas(width, height);
  const ctx = cv.getContext('2d');
  gridBackground(ctx, width, height, accent);

  // ----- Левая панель -----
  const px = 28;
  const py = 28;
  const pw = 300;
  const ph = height - 56;
  neonPanel(ctx, px, py, pw, ph, 26, accent);

  const cx = px + pw / 2;
  const emblemCY = py + 96;
  const emblemR = 60;
  // Кольцо уровня вокруг эмблемы.
  if (spec.ring) {
    const ratio = spec.ring.max > 0 ? spec.ring.value / spec.ring.max : 0;
    neonRing(ctx, cx, emblemCY, emblemR + 8, ratio, accent);
  }
  // Эмблема: тёмный круг + иконка клана.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, emblemCY, emblemR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.restore();
  drawIcon(ctx, 'clan', cx - 34, emblemCY - 34, 68);

  // Название + тег.
  ctx.textAlign = 'center';
  ctx.fillStyle = NEON.textPrimary;
  ctx.font = font(700, 28);
  glowText(ctx, truncateToWidth(ctx, spec.name || 'Клан', pw - 40), cx, emblemCY + emblemR + 50, { color: accent, blur: 10 });
  if (spec.tag) {
    ctx.fillStyle = accent;
    ctx.font = font(700, 17);
    ctx.fillText(truncateToWidth(ctx, `[${spec.tag}]`, pw - 50), cx, emblemCY + emblemR + 78);
  }
  if (spec.level != null) {
    ctx.fillStyle = NEON.textMuted;
    ctx.font = font(600, 16);
    ctx.fillText(`Уровень ${spec.level}`, cx, emblemCY + emblemR + 104);
  }
  ctx.textAlign = 'left';

  // Аватары участников внизу панели.
  const members = (spec.members || []).slice(0, 6);
  if (members.length) {
    const avR = 18;
    const totalW = members.length * (avR * 2 + 6) - 6;
    let mx = cx - totalW / 2 + avR;
    const my = py + ph - 40;
    ctx.fillStyle = NEON.textLabel;
    ctx.font = font(600, 12);
    ctx.textAlign = 'center';
    ctx.fillText('СОСТАВ', cx, my - 30);
    ctx.textAlign = 'left';
    for (const m of members) {
      drawAvatar(ctx, m.avatar, mx, my, avR);
      mx += avR * 2 + 6;
    }
  }

  // ----- Правая зона -----
  const rx = px + pw + 24;
  const rw = width - rx - 28;
  const gap = 16;
  let ry = py + 8;

  // Сетка плиток 2x2.
  const colW = (rw - gap) / 2;
  const tileH = 96;
  const tiles = (spec.tiles || []).slice(0, 4);
  tiles.forEach((tile, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    drawTile(ctx, rx + col * (colW + gap), ry + row * (tileH + gap), colW, tileH, tile, accent);
  });
  ry += tileH * 2 + gap * 2;

  // Полоса войны.
  if (spec.war) {
    const ratio = spec.war.target > 0 ? spec.war.score / spec.war.target : 0;
    ctx.fillStyle = NEON.textLabel;
    ctx.font = font(600, 13);
    ctx.fillText((spec.war.label || 'ПРОГРЕСС ВОЙНЫ').toUpperCase(), rx, ry + 4);
    ctx.fillStyle = NEON.textPrimary;
    ctx.font = font(700, 15);
    ctx.textAlign = 'right';
    ctx.fillText(`${spec.war.score} / ${spec.war.target}`, rx + rw, ry + 4);
    ctx.textAlign = 'left';
    neonBar(ctx, rx, ry + 16, rw, 16, ratio, accent);
  }

  return cv.toBuffer('image/png');
}

module.exports = { paintClanCard };
