// Движок достижений: каталог порогов + ленивая выдача.
// Достижение хранится в profile.achievements как { id, name, at }.
// test(profile) — предикат разблокировки; вычисляется дёшево по уже собранным полям.

const { levelFromXp } = require('../utils/format');

const ACHIEVEMENTS = [
  { id: 'msg_100', name: 'Болтун (100 сообщений)', test: (p) => (p.messages || 0) >= 100 },
  { id: 'msg_1000', name: 'Активист (1000 сообщений)', test: (p) => (p.messages || 0) >= 1000 },
  { id: 'msg_5000', name: 'Голос чата (5000 сообщений)', test: (p) => (p.messages || 0) >= 5000 },
  { id: 'voice_600', name: 'Завсегдатай войса (10 ч)', test: (p) => (p.voiceMinutes || 0) >= 600 },
  { id: 'voice_3600', name: 'Голосовой монстр (60 ч)', test: (p) => (p.voiceMinutes || 0) >= 3600 },
  { id: 'rich_10k', name: 'Богач (10 000 монет)', test: (p) => (p.balance || 0) >= 10000 },
  { id: 'rich_100k', name: 'Магнат (100 000 монет)', test: (p) => (p.balance || 0) >= 100000 },
  { id: 'level_10', name: 'Десятый уровень', test: (p) => levelFromXp(p.xp).level >= 10 },
  { id: 'level_25', name: 'Двадцать пятый уровень', test: (p) => levelFromXp(p.xp).level >= 25 },
  { id: 'in_clan', name: 'Командный игрок', test: (p) => Boolean(p.clanId) },
  { id: 'in_love', name: 'Не один', test: (p) => Boolean(p.lovePartnerId) }
];

// Все id, условия которых выполнены.
function evaluate(profile) {
  if (!profile) return [];
  return ACHIEVEMENTS.filter((achievement) => {
    try {
      return achievement.test(profile);
    } catch (error) {
      return false;
    }
  }).map((achievement) => achievement.id);
}

// Выдать новые достижения. Мутирует profile.achievements, возвращает список новых.
function grant(profile) {
  if (!profile) return [];
  profile.achievements ||= [];
  const owned = new Set(profile.achievements.map((item) => item && item.id).filter(Boolean));
  const unlocked = [];
  for (const achievement of ACHIEVEMENTS) {
    if (owned.has(achievement.id)) continue;
    let ok = false;
    try {
      ok = achievement.test(profile);
    } catch (error) {
      ok = false;
    }
    if (!ok) continue;
    const entry = { id: achievement.id, name: achievement.name, at: Date.now() };
    profile.achievements.push(entry);
    owned.add(achievement.id);
    unlocked.push(entry);
  }
  return unlocked;
}

// Ручное достижение (из команд) в едином формате, с дедупом по имени.
function addNamed(profile, name) {
  if (!profile) return false;
  profile.achievements ||= [];
  const exists = profile.achievements.some((item) => (item && item.name ? item.name : item) === name);
  if (exists) return false;
  profile.achievements.unshift({ id: null, name, at: Date.now() });
  return true;
}

module.exports = { ACHIEVEMENTS, evaluate, grant, addNamed };
