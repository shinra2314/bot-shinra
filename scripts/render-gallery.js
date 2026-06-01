// Рендер всех карт с моковыми данными для визуальной проверки.
// Запуск: node scripts/render-gallery.js           — рендерит все
//         node scripts/render-gallery.js profile    — только одну
const fs = require('fs');
const path = require('path');
const renderer = require('../src/services/cardRenderer');

const OUT = path.join(__dirname, '..', 'tmp', 'gallery');

// name → () => Buffer. Пополняется по мере добавления лейаутов.
function buildCards() {
  return {
    profile: () => renderer.paintProfileCard({
      accent: '#A855F7',
      background: { from: '#0a0b14', to: '#06070d' },
      avatar: null,
      name: 'оля виртовская',
      subtitle: 'Легенда Onix',
      ring: { value: 6, max: 10 },
      level: 6,
      presence: { label: 'В сети', color: '#34F5A0' },
      tags: ['#Самый активный', '#За 2 часа'],
      currencies: [
        { name: 'Монеты', sub: 'Обычная', value: '4 071', color: '#FFD24A' },
        { name: 'Лотусы', sub: 'Премиум', value: '128', color: '#A855F7' }
      ],
      chips: [
        { kind: 'love', text: 'Холост', accent: '#FF3B6B' },
        { kind: 'role', text: 'Born of Madness', icon: null, color: '#A855F7' },
        { kind: 'clan', text: 'Нет клана', icon: 'clan' }
      ],
      tiles: [
        { icon: 'voice', label: 'Онлайн', value: '36 ч 28 м' },
        { icon: 'messages', label: 'Сообщений', value: '5 528' },
        { icon: 'trophy', label: 'В топе', value: '#3' },
        { icon: 'level', label: 'Достижений', value: '1' }
      ],
      achievements: ['Первый профиль']
    }),
    balance: () => renderer.paintHeroCard({
      accent: '#FFD24A',
      avatar: null,
      name: 'оля виртовская',
      subtitle: 'Экономика Onix',
      ring: { value: 6, max: 10 },
      level: 6,
      title: 'Текущий баланс',
      tiles: [
        { icon: 'coins', label: 'Монеты', value: '4 071', accent: '#FFD24A' },
        { icon: 'lotus', label: 'Лотусы', value: '128' },
        { icon: 'snow', label: 'Снежки', value: '12' },
        { icon: 'level', label: 'Уровень', value: '6' }
      ]
    }),
    leaderboard: () => renderer.paintLeaderboardCard({
      accent: '#FFD24A',
      title: 'Топ по монетам',
      subtitle: 'Сервер Onix • обновлено только что',
      rows: [
        { rank: 1, name: 'оля виртовская', value: '128 400', avatar: null },
        { rank: 2, name: 'darkmoon', value: '96 120', avatar: null },
        { rank: 3, name: 'Никита', value: '74 980', avatar: null },
        { rank: 4, name: 'sael', value: '51 200', avatar: null },
        { rank: 5, name: 'я просто кот', value: '40 015', avatar: null, highlight: true },
        { rank: 6, name: 'mira', value: '38 700', avatar: null },
        { rank: 7, name: 'воин света', value: '21 050', avatar: null },
        { rank: 8, name: 'lex', value: '12 400', avatar: null }
      ]
    }),
    result: () => renderer.paintResultCard({
      outcome: 'win',
      name: 'оля виртовская',
      avatar: null,
      delta: '+1 250',
      lines: ['Ставка: 500', 'Слоты 🍒🍒🍒', 'Баланс: 5 321']
    }),
    result_lose: () => renderer.paintResultCard({
      outcome: 'lose',
      name: 'darkmoon',
      avatar: null,
      delta: '-500',
      lines: ['Ставка: 500', 'Рулетка: чёрное', 'Баланс: 1 820']
    }),
    clan: () => renderer.paintClanCard({
      accent: '#34F5A0',
      name: 'Born of Madness',
      tag: 'BOM',
      level: 7,
      ring: { value: 7, max: 10 },
      members: [{}, {}, {}, {}, {}],
      tiles: [
        { icon: 'coins', label: 'Казна', value: '214 000', accent: '#FFD24A' },
        { icon: 'clan', label: 'Состав', value: '24 / 30' },
        { icon: 'trophy', label: 'Побед', value: '48' },
        { icon: 'level', label: 'Уровень', value: '7' }
      ],
      war: { score: 1340, target: 2000, label: 'Прогресс войны' }
    }),
    love: () => renderer.paintLoveCard({
      a: { name: 'оля виртовская', avatar: null },
      b: { name: 'darkmoon', avatar: null },
      days: 128,
      compatibility: 87,
      tiles: [
        { label: 'Подарков', value: '42' },
        { label: 'Свиданий', value: '17' },
        { label: 'Рейтинг', value: '#2' }
      ]
    }),
    love_single: () => renderer.paintLoveCard({
      a: { name: 'я просто кот', avatar: null },
      b: null,
      compatibility: 0,
      tiles: [{ label: 'Подарков', value: '0' }]
    }),
    drop: () => renderer.paintDropCard({
      rarity: 'epic',
      itemName: 'Купон личной роли',
      itemKind: 'case',
      valueText: '≈ 9 000 мон.',
      fromCase: 'Редкий кейс'
    }),
    drop_legendary: () => renderer.paintDropCard({
      rarity: 'legendary',
      itemName: '50 000 монет',
      itemKind: 'coins',
      valueText: 'Джекпот!',
      fromCase: 'Эпический кейс'
    }),
    grid: () => renderer.paintGridCard({
      accent: '#A855F7',
      title: 'Магазин Onix',
      subtitle: 'Категория: Баннеры',
      items: [
        { icon: 'case', name: 'Обычный кейс', price: '350' },
        { icon: 'case', name: 'Редкий кейс', price: '900' },
        { icon: 'lotus', name: 'Violet Dream', price: '5 000', owned: true },
        { icon: 'trophy', name: 'Golden Hour', price: '5 000' },
        { icon: 'heart', name: 'Love Core', price: '8 000' },
        { icon: 'coins', name: 'Купон роли', price: '500', owned: true }
      ]
    }),
    achievement: () => renderer.paintDropCard({
      rarity: 'legendary',
      topLabel: 'ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО',
      itemName: 'Голосовой монстр (60 ч)',
      itemKind: 'trophy',
      footnote: ''
    }),
    war: () => renderer.paintWarCard({
      title: 'Клановая война',
      subtitle: 'До конца: 14 ч 32 мин',
      a: { name: 'Born of Madness', score: 1340 },
      b: { name: 'Shadow Pact', score: 980 }
    })
  };
}

async function main() {
  if (!renderer.CARD_AVAILABLE) {
    console.error('Canvas недоступен (@napi-rs/canvas / шрифт).');
    process.exit(1);
  }
  await renderer.loadIcons();
  fs.mkdirSync(OUT, { recursive: true });
  const cards = buildCards();
  const only = process.argv[2];
  const names = only ? [only] : Object.keys(cards);
  for (const name of names) {
    if (!cards[name]) { console.error('Нет карты:', name); continue; }
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, cards[name]());
    console.log('Сохранено:', file);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
