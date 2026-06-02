// Dev-утилита для визуального контроля canvas-карт без Discord и сети.
// Рендерит каждый paint* со синтетическими данными (avatar = null → плейсхолдер)
// в tmp/cards/*.png. Запуск: npm run render:samples.
//
// Не часть бота — служит «глазным» тестом при полировке визуала: снять базовый
// набор PNG до правок, затем сравнить после.

const fs = require('fs');
const path = require('path');

const renderer = require('../src/services/cardRenderer');

const OUT_DIR = path.join(__dirname, '..', 'tmp', 'cards');

function write(name, buffer) {
  if (!buffer) {
    console.warn(`! ${name}: пустой буфер, пропуск`);
    return;
  }
  const file = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(file, buffer);
  console.log(`✓ ${name}.png (${buffer.length} B)`);
}

// Общие синтетические поля.
const ringHalf = { value: 6, max: 10 };

const SAMPLES = {
  hero: () =>
    renderer.paintHeroCard({
      accent: '#A855F7',
      avatar: null,
      name: 'NightMore',
      subtitle: 'Экономика Onix',
      ring: ringHalf,
      level: 27,
      title: 'Текущий баланс',
      tiles: [
        { icon: 'coins', label: 'Монеты', value: '1 280 540', accent: '#f5c451' },
        { icon: 'lotus', label: 'Лотусы', value: '342' },
        { icon: 'snow', label: 'Снежки', value: '57' },
        { icon: 'level', label: 'Уровень', value: '27' }
      ]
    }),

  profile: () =>
    renderer.paintProfileCard({
      accent: '#E0506B',
      background: { from: '#1b1d27', to: '#0b0c12' },
      avatar: null,
      name: 'NightMore',
      subtitle: 'Легенда Onix',
      ring: ringHalf,
      level: 42,
      currencies: [
        { name: 'Монеты', sub: 'Обычная', value: '1 280 540', color: '#f5c451' },
        { name: 'Лотусы', sub: 'Премиум', value: '342', color: '#a78bfa' }
      ],
      chips: [
        { kind: 'love', text: 'В паре', accent: '#fb7185' },
        { kind: 'role', text: 'Администратор', icon: null, color: '#38bdf8' },
        { kind: 'clan', text: 'Onix Core', icon: 'clan' }
      ],
      presence: { label: 'В сети', color: '#3ba55d' },
      tags: ['Актив', 'Голос', 'Топ-1'],
      tiles: [
        { icon: 'voice', label: 'Онлайн', value: '128 ч' },
        { icon: 'messages', label: 'Сообщений', value: '24 901' },
        { icon: 'trophy', label: 'В топе', value: '#3' },
        { icon: 'level', label: 'Достижений', value: '17' }
      ],
      achievements: ['Первая кровь', 'Голосовой монстр', 'Богач']
    }),

  balance: () =>
    renderer.paintHeroCard({
      accent: '#f5c451',
      avatar: null,
      name: 'NightMore',
      subtitle: 'Экономика Onix',
      ring: ringHalf,
      level: 27,
      title: 'Текущий баланс',
      tiles: [
        { icon: 'coins', label: 'Монеты', value: '1 280 540', accent: '#f5c451' },
        { icon: 'lotus', label: 'Лотусы', value: '342' },
        { icon: 'snow', label: 'Снежки', value: '57' },
        { icon: 'level', label: 'Уровень', value: '27' }
      ]
    }),

  timely: () =>
    renderer.paintHeroCard({
      accent: '#7CFFB2',
      avatar: null,
      name: 'NightMore',
      subtitle: 'Печенье с предсказанием',
      ring: ringHalf,
      level: 27,
      title: 'Награда дня',
      tiles: [
        { icon: 'coins', label: 'Монеты', value: '+500', accent: '#7CFFB2' },
        { icon: 'snow', label: 'Снежки', value: '+3', accent: '#7CFFB2' },
        { icon: 'level', label: 'Опыт', value: '+120', accent: '#7CFFB2' }
      ]
    }),

  leaderboard: () =>
    renderer.paintLeaderboardCard({
      accent: '#FFD24A',
      title: 'Топ по балансу',
      subtitle: 'Первые 10 мест сервера',
      rows: Array.from({ length: 10 }, (_, i) => ({
        rank: i + 1,
        name: `Игрок ${i + 1}`,
        value: `${(10 - i) * 100000}`,
        avatar: null,
        highlight: i === 3
      }))
    }),

  result_win: () =>
    renderer.paintResultCard({
      outcome: 'win',
      title: 'ПОБЕДА',
      avatar: null,
      name: 'NightMore',
      delta: '+2 500',
      lines: ['Слоты', 'Ставка 1 000', 'x2.5']
    }),

  result_lose: () =>
    renderer.paintResultCard({
      outcome: 'lose',
      avatar: null,
      name: 'NightMore',
      delta: '-1 000',
      lines: ['Кости', 'Ставка 1 000', 'Меньше 7']
    }),

  clan: () =>
    renderer.paintClanCard({
      accent: '#34F5A0',
      name: 'Onix Core',
      tag: 'ONX',
      level: 7,
      ring: { value: 7, max: 10 },
      members: Array.from({ length: 6 }, () => ({ avatar: null })),
      tiles: [
        { icon: 'coins', label: 'Банк', value: '540 000', accent: '#FFD24A' },
        { icon: 'clan', label: 'Состав', value: '24' },
        { icon: 'trophy', label: 'Рейтинг', value: '1 820' },
        { icon: 'level', label: 'Уровень', value: '7' }
      ],
      war: { score: 320, target: 500, label: 'Прогресс войны' }
    }),

  love: () =>
    renderer.paintLoveCard({
      accent: '#FF3B6B',
      a: { name: 'NightMore', avatar: null },
      b: { name: 'Луна', avatar: null },
      days: 128,
      compatibility: 87,
      tiles: [
        { label: 'Уровень', value: 'ур. 12' },
        { label: 'Серия', value: '14 дн.' },
        { label: 'Настроение', value: 'Искрит' }
      ]
    }),

  love_single: () =>
    renderer.paintLoveCard({
      accent: '#FF3B6B',
      a: { name: 'NightMore', avatar: null },
      b: null,
      days: null,
      compatibility: null,
      tiles: []
    }),

  drop: () =>
    renderer.paintDropCard({
      rarity: 'epic',
      itemName: 'Neon Dragon',
      itemKind: 'case',
      valueText: '15 000 монет',
      fromCase: 'Эпический кейс'
    }),

  achievement: () =>
    renderer.paintDropCard({
      rarity: 'legendary',
      topLabel: 'ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО',
      itemName: 'Легенда Onix',
      itemKind: 'trophy',
      footnote: ''
    }),

  grid: () =>
    renderer.paintGridCard({
      accent: '#A855F7',
      title: 'Магазин',
      subtitle: 'Баннеры профиля',
      items: [
        { icon: 'coins', name: 'Golden Hour', price: '5 000', owned: false },
        { icon: 'lotus', name: 'Violet Dream', price: '5 000', owned: true },
        { icon: 'snow', name: 'Ocean', price: '5 000', owned: false },
        { icon: 'heart', name: 'Love Core', price: '8 000', owned: false },
        { icon: 'clan', name: 'Mafia Night', price: '8 000', owned: false },
        { icon: 'trophy', name: 'Onix Night', price: '0', owned: true }
      ]
    }),

  war: () =>
    renderer.paintWarCard({
      title: 'Клановая война',
      subtitle: 'Осталось 3 дня',
      a: { name: 'Onix Core', score: 320 },
      b: { name: 'Shadow', score: 180 },
      accent: '#FF3B6B'
    })
};

function main() {
  if (!renderer.CARD_AVAILABLE) {
    console.error('CARD_AVAILABLE=false — @napi-rs/canvas недоступен, рендер пропущен.');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Иконки кэшируются один раз; loadIcons асинхронна.
  renderer
    .loadIcons()
    .then(() => {
      for (const [name, fn] of Object.entries(SAMPLES)) {
        try {
          write(name, fn());
        } catch (error) {
          console.error(`✗ ${name}: ${error.message}`);
        }
      }
      console.log(`\nГотово → ${OUT_DIR}`);
    })
    .catch((error) => {
      console.error('Ошибка loadIcons:', error.message);
      process.exit(1);
    });
}

main();
