// Единая dark-neon палитра для canvas-карт.
const NEON = {
  bgFrom: '#0a0b14',
  bgTo: '#06070d',
  grid: 'rgba(124,92,247,0.045)', // линии техно-сетки (чуть мягче)
  textPrimary: '#F2F4FF',
  textMuted: '#8A90B0',
  textLabel: '#6E76A0', // капс-подписи плиток — поднят контраст для читаемости
  panelFill: 'rgba(255,255,255,0.035)',
  panelStroke: 'rgba(168,85,247,0.18)'
};

// Дизайн-токены canvas-карт: единые радиусы скруглений, силы свечения и шкала
// типографики. Лейауты берут значения отсюда вместо хардкод-литералов, чтобы
// ритм карт был консистентным.
const RADIUS = {
  panel: 28, // крупные identity-панели
  card: 18,  // стат-плитки, ячейки сетки, чипы
  row: 16,   // строки лидерборда, плитки валют
  chip: 14,  // мелкие плитки фактов, бейдж уровня
  box: 24,   // центральный бокс дроп-карты
  pill: 999  // полностью скруглённые пилюли/бары
};

const GLOW = {
  sm: 8,  // подписи, мелкие значения, обводки плиток
  md: 12, // имена, значения, заголовки строк
  lg: 16, // кольца, бейджи, акцент-заголовки
  xl: 24  // крупные центральные итоги (дроп/исход/сердце)
};

// Шкала типографики (px). Имена — по семантической роли, значения совпадают с
// самыми частыми текущими размерами, поэтому применение токенов не двигает вёрстку.
const TYPE = {
  micro: 12,   // мелкие капс-подписи
  label: 13,   // капс-подписи плиток
  small: 16,   // приглушённые подзаголовки/сноски
  body: 17,    // текст чипов/фактов
  value: 22,   // средние значения
  h3: 26,      // имена в парных/клан-картах
  h2: 30,      // значения плиток, заголовки правой зоны
  name: 34,    // крупное имя hero-карты
  h1: 36       // заголовок дроп-карты
};

// Единый источник доменной палитры (hex). И canvas-карты (ACCENT), и текстовые
// панели Components v2 (COLORS) берут цвета отсюда — раньше они дублировались в
// двух местах и расходились. Алиасы (economy=gold и т.п.) намеренные.
const DOMAIN = {
  primary: '#A855F7',
  profile: '#A855F7',
  success: '#34F5A0',
  warning: '#FFD24A',
  danger: '#FF3B6B',
  info: '#22D3EE',
  economy: '#FFD24A',
  gold: '#FFD24A',
  games: '#FF3B6B',
  casino: '#FF3B6B',
  clans: '#34F5A0',
  music: '#A78BFA',
  love: '#FF3B6B',
  voice: '#22D3EE',
  neutral: '#12131A'
};

// '#RRGGBB' → 0xRRGGBB. Для Components v2 (.setAccentColor ждёт int).
function hexToInt(hex) {
  return parseInt(String(hex).replace('#', ''), 16);
}

// Доменные неон-акценты для accent в spec лейаутов (подмножество DOMAIN).
const ACCENT = {
  profile: DOMAIN.profile,
  info: DOMAIN.info,
  success: DOMAIN.success,
  danger: DOMAIN.danger,
  love: DOMAIN.love,
  casino: DOMAIN.casino,
  gold: DOMAIN.gold,
  voice: DOMAIN.voice
};

// Цвет редкости для дроп-карт (выводится из единой палитры).
const RARITY = {
  common: NEON.textMuted,
  rare: DOMAIN.info,
  epic: DOMAIN.primary,
  legendary: DOMAIN.gold
};

module.exports = { NEON, DOMAIN, hexToInt, ACCENT, RARITY, RADIUS, GLOW, TYPE };
