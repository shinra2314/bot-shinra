// Движок квестов: дневной (3/день) + недельный (3/неделю) треки. Data-driven каталог
// + прогресс из игровых событий. Чистые функции над profile (без UI/Client), чтобы
// звать из любого места (index.js, store, команды). Награда выдаётся автоматически
// при выполнении (без отдельного claim); видно в /квесты.
//
// profile.quests = {
//   date: 'YYYY-MM-DD', daily: [quest...],
//   week: 'YYYY-Www',  weekly: [quest...]
// }
// quest = { id, type, title, emoji, target, progress, reward, xp, completed }.

const DAILY_COUNT = 3;
const WEEKLY_COUNT = 3;

// type — ключ источника события (см. progress). reward — монеты.
const CATALOG = [
  { id: 'msg_20', type: 'message', title: 'Отправить 20 сообщений', emoji: '💬', target: 20, reward: 150, xp: 30 },
  { id: 'msg_50', type: 'message', title: 'Отправить 50 сообщений', emoji: '💬', target: 50, reward: 300, xp: 60 },
  { id: 'voice_30', type: 'voice', title: '30 минут в голосовом', emoji: '🔊', target: 30, reward: 200, xp: 40 },
  { id: 'voice_60', type: 'voice', title: '60 минут в голосовом', emoji: '🔊', target: 60, reward: 400, xp: 80 },
  { id: 'casino_3', type: 'casino', title: 'Сыграть 3 раза в казино', emoji: '🎰', target: 3, reward: 150, xp: 20 },
  { id: 'casino_win', type: 'casino_win', title: 'Выиграть в казино', emoji: '🏆', target: 1, reward: 250, xp: 30 },
  { id: 'case_1', type: 'case', title: 'Открыть кейс', emoji: '🎴', target: 1, reward: 200, xp: 25 },
  { id: 'rep_1', type: 'rep', title: 'Поднять кому-то репутацию', emoji: '⭐', target: 1, reward: 100, xp: 15 },
  { id: 'timely_1', type: 'timely', title: 'Забрать ежедневную награду', emoji: '🎁', target: 1, reward: 120, xp: 20 }
];

// Недельные квесты — крупные цели, крупная награда.
const WEEKLY_CATALOG = [
  { id: 'w_msg_300', type: 'message', title: 'Отправить 300 сообщений за неделю', emoji: '💬', target: 300, reward: 1500, xp: 300 },
  { id: 'w_voice_600', type: 'voice', title: '600 минут в голосовом за неделю', emoji: '🔊', target: 600, reward: 2000, xp: 400 },
  { id: 'w_casino_30', type: 'casino', title: 'Сыграть 30 раз в казино', emoji: '🎰', target: 30, reward: 1200, xp: 200 },
  { id: 'w_casino_win_10', type: 'casino_win', title: 'Выиграть 10 раз в казино', emoji: '🏆', target: 10, reward: 1800, xp: 250 },
  { id: 'w_case_10', type: 'case', title: 'Открыть 10 кейсов', emoji: '🎴', target: 10, reward: 1500, xp: 250 },
  { id: 'w_rep_5', type: 'rep', title: 'Поднять репутацию 5 раз', emoji: '⭐', target: 5, reward: 1000, xp: 150 },
  { id: 'w_timely_5', type: 'timely', title: 'Забрать награду 5 дней', emoji: '🎁', target: 5, reward: 1500, xp: 200 }
];

function dateKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

// ISO-неделя: 'YYYY-Www' (понедельник — первый день, неделя с четвергом).
function weekKey(ts = Date.now()) {
  const date = new Date(ts);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function instantiate(template) {
  return {
    id: template.id,
    type: template.type,
    title: template.title,
    emoji: template.emoji,
    target: template.target,
    progress: 0,
    reward: template.reward,
    xp: template.xp || 0,
    completed: false
  };
}

function pick(catalog, count) {
  const pool = [...catalog];
  const chosen = [];
  while (chosen.length < count && pool.length) {
    const index = Math.floor(Math.random() * pool.length);
    chosen.push(instantiate(pool.splice(index, 1)[0]));
  }
  return chosen;
}

// Гарантирует актуальные наборы (ротация дневного при смене даты, недельного — недели).
function ensure(profile) {
  if (!profile) return null;
  const today = dateKey();
  const week = weekKey();
  profile.quests ||= {};
  if (profile.quests.date !== today || !Array.isArray(profile.quests.daily)) {
    profile.quests.date = today;
    profile.quests.daily = pick(CATALOG, DAILY_COUNT);
  }
  if (profile.quests.week !== week || !Array.isArray(profile.quests.weekly)) {
    profile.quests.week = week;
    profile.quests.weekly = pick(WEEKLY_CATALOG, WEEKLY_COUNT);
  }
  return profile.quests;
}

// Продвинуть активные квесты (дневные + недельные) по источнику события. Мутирует
// profile, начисляет награду (монеты + xp) при выполнении. Возвращает выполненные.
function progress(profile, source, amount = 1) {
  if (!profile || !source || amount <= 0) return [];
  const quests = ensure(profile);
  const completed = [];
  for (const quest of [...quests.daily, ...quests.weekly]) {
    if (quest.completed || quest.type !== source) continue;
    quest.progress = Math.min(quest.target, Number(quest.progress || 0) + amount);
    if (quest.progress >= quest.target) {
      quest.completed = true;
      profile.balance = Number(profile.balance || 0) + quest.reward;
      profile.xp = Math.max(0, Number(profile.xp || 0)) + (quest.xp || 0);
      completed.push(quest);
    }
  }
  return completed;
}

module.exports = { CATALOG, WEEKLY_CATALOG, DAILY_COUNT, WEEKLY_COUNT, ensure, progress };
