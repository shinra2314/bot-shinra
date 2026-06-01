// Единая dark-neon палитра для canvas-карт.
const NEON = {
  bgFrom: '#0a0b14',
  bgTo: '#06070d',
  grid: 'rgba(124,92,247,0.05)', // линии техно-сетки
  textPrimary: '#F2F4FF',
  textMuted: '#8A90B0',
  textLabel: '#5A6080',
  panelFill: 'rgba(255,255,255,0.035)',
  panelStroke: 'rgba(168,85,247,0.18)'
};

// Доменные неон-акценты (используются как accent в spec лейаутов).
const ACCENT = {
  profile: '#A855F7',
  info: '#22D3EE',
  success: '#34F5A0',
  danger: '#FF3B6B',
  love: '#FF3B6B',
  casino: '#FF3B6B',
  gold: '#FFD24A',
  voice: '#22D3EE'
};

// Цвет редкости для дроп-карт.
const RARITY = {
  common: '#8A90B0',
  rare: '#22D3EE',
  epic: '#A855F7',
  legendary: '#FFD24A'
};

module.exports = { NEON, ACCENT, RARITY };
