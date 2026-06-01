// Фасад canvas-рендера. Реализация — в services/canvas/*:
//   theme.js      — неоновая палитра
//   primitives.js — низкоуровневые фигуры и эффекты свечения
//   layouts/*.js  — конкретные карты
// Контракт (CARD_AVAILABLE, loadIcons, loadRemoteImage, paint*) сохраняется,
// чтобы существующие вызовы из profileCard.js не ломались.

const primitives = require('./canvas/primitives');
const { paintHeroCard } = require('./canvas/layouts/hero');
const { paintProfileCard } = require('./canvas/layouts/profile');
const { paintLeaderboardCard } = require('./canvas/layouts/leaderboard');
const { paintResultCard } = require('./canvas/layouts/result');
const { paintClanCard } = require('./canvas/layouts/clan');
const { paintLoveCard } = require('./canvas/layouts/love');
const { paintDropCard } = require('./canvas/layouts/drop');
const { paintGridCard } = require('./canvas/layouts/grid');
const { paintWarCard } = require('./canvas/layouts/war');

module.exports = {
  CARD_AVAILABLE: primitives.CARD_AVAILABLE,
  loadIcons: primitives.loadIcons,
  loadRemoteImage: primitives.loadRemoteImage,
  paintHeroCard,
  paintProfileCard,
  paintLeaderboardCard,
  paintResultCard,
  paintClanCard,
  paintLoveCard,
  paintDropCard,
  paintGridCard,
  paintWarCard
};
