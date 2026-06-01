// Одноразовый рендер карточки профиля с моковыми данными для визуальной проверки.
// Запуск: node scripts/render-sample-card.js → tmp/sample-card.png
const fs = require('fs');
const path = require('path');
const { CARD_AVAILABLE, loadIcons, paintProfileCard } = require('../src/services/cardRenderer');

async function main() {
  if (!CARD_AVAILABLE) {
    console.error('Canvas недоступен (@napi-rs/canvas / шрифт) — рендер невозможен.');
    process.exit(1);
  }
  await loadIcons();

  const buffer = paintProfileCard({
    accent: '#E0506B',
    background: { from: '#1b1d27', to: '#0b0c12' },
    avatar: null,
    name: 'оля виртовская',
    subtitle: 'Легенда Onix',
    ring: { value: 6, max: 10 },
    level: 6,
    presence: { label: 'В сети', color: '#3ba55d' },
    tags: ['#Самый активный', '#За 2 часа'],
    currencies: [
      { name: 'Монеты', sub: 'Обычная', value: '4 071', color: '#f5c451' },
      { name: 'Лотусы', sub: 'Премиум', value: '0', color: '#a78bfa' }
    ],
    chips: [
      { kind: 'love', text: 'Холост', accent: '#fb7185' },
      { kind: 'role', text: 'Born of Madness', icon: null, color: '#e0506b' },
      { kind: 'clan', text: 'Нет клана', icon: 'clan' }
    ],
    tiles: [
      { icon: 'voice', label: 'Онлайн', value: '36 ч 28 м' },
      { icon: 'messages', label: 'Сообщений', value: '5 528' },
      { icon: 'trophy', label: 'В топе', value: 'Вне топа' },
      { icon: 'level', label: 'Достижений', value: '1' }
    ],
    achievements: ['Первый профиль']
  });

  const outDir = path.join(__dirname, '..', 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'sample-card.png');
  fs.writeFileSync(file, buffer);
  console.log('Сохранено:', file);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
