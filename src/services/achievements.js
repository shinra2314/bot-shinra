const ACHIEVEMENTS = [
  { id: 'first_timely', name: 'Первый timely', condition: (p) => p.lastTimely > 0 },
  { id: 'rich_1000', name: 'Первая тысяча', condition: (p) => (p.balance || 0) >= 1000 },
  { id: 'rich_10000', name: 'Богач', condition: (p) => (p.balance || 0) >= 10000 },
  { id: 'rich_100000', name: 'Магнат', condition: (p) => (p.balance || 0) >= 100000 },
  { id: 'voice_60', name: 'Час в войсе', condition: (p) => (p.voiceMinutes || 0) >= 60 },
  { id: 'voice_600', name: '10 часов в войсе', condition: (p) => (p.voiceMinutes || 0) >= 600 },
  { id: 'voice_3000', name: 'Голосовой монстр', condition: (p) => (p.voiceMinutes || 0) >= 3000 },
  { id: 'level_5', name: 'Уровень 5', condition: (p) => levelFromXp(p.xp).level >= 5 },
  { id: 'level_10', name: 'Уровень 10', condition: (p) => levelFromXp(p.xp).level >= 10 },
  { id: 'level_25', name: 'Уровень 25', condition: (p) => levelFromXp(p.xp).level >= 25 },
  { id: 'rep_5', name: 'Уважаемый', condition: (p) => (p.reputation || 0) >= 5 },
  { id: 'rep_25', name: 'Авторитет', condition: (p) => (p.reputation || 0) >= 25 },
  { id: 'streak_7', name: 'Недельный стрик', condition: (p) => (p.timelyStreak || 0) >= 7 },
  { id: 'streak_30', name: 'Месячный стрик', condition: (p) => (p.timelyStreak || 0) >= 30 },
  { id: 'messages_100', name: 'Сотня сообщений', condition: (p) => (p.messageCount || 0) >= 100 },
  { id: 'messages_1000', name: 'Тысяча сообщений', condition: (p) => (p.messageCount || 0) >= 1000 },
  { id: 'clan_member', name: 'В клане', condition: (p) => !!p.clanId },
  { id: 'has_role', name: 'Своя роль', condition: (p) => !!p.personalRoleId },
  { id: 'first_market', name: 'Первый лот на маркете', condition: (p) => (p.achievements || []).includes('Первый лот на маркете') },
  { id: 'love', name: 'Влюблённый', condition: (p) => !!p.lovePartnerId }
];

const { levelFromXp } = require('../utils/format');

function checkAchievements(profile) {
  profile.achievements ||= [];
  const newAchievements = [];
  for (const achievement of ACHIEVEMENTS) {
    if (profile.achievements.includes(achievement.name)) continue;
    if (achievement.condition(profile)) {
      profile.achievements.push(achievement.name);
      newAchievements.push(achievement.name);
    }
  }
  return newAchievements;
}

module.exports = {
  ACHIEVEMENTS,
  checkAchievements
};
