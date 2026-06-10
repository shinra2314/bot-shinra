// Прогрессия (XP/уровни) — единая точка начисления опыта. Источники (сообщения,
// войс, casino, кейсы, дуэли) зовут awardXp вместо прямого profile.xp += N, чтобы
// один пересчёт уровня кормил level-роли, уведомления и (позже) квесты/сезон.
//
// awardXp — чистая мутация profile.xp + возврат инфо о level-up. Побочные эффекты
// (выдача роли, отправка панели) делает вызывающий код в index.js, где есть member
// и канал. Так сервис не тянет зависимость на discord.js Client.

const { levelFromXp, mentionUser } = require('../utils/format');
const { COLORS, ICONS, mediaPanel } = require('../ui/components');

// Множитель опыта за престиж: +5% за каждый уровень престижа, потолок +50%.
function prestigeMultiplier(profile) {
  return 1 + 0.05 * Math.min(Number(profile?.prestige || 0), 10);
}

// Начислить XP. Чистая функция над profile: мутирует profile.xp, возвращает
// { gained, leveledUp, oldLevel, newLevel }. Учитывает множитель престижа.
function awardXp(profile, amount) {
  const gain = Math.floor((Number(amount) || 0) * prestigeMultiplier(profile));
  if (!profile || gain <= 0) {
    const level = profile ? levelFromXp(profile.xp).level : 0;
    return { gained: 0, leveledUp: false, oldLevel: level, newLevel: level };
  }
  const oldLevel = levelFromXp(profile.xp).level;
  profile.xp = Math.max(0, Number(profile.xp || 0)) + gain;
  const newLevel = levelFromXp(profile.xp).level;
  return { gained: gain, leveledUp: newLevel > oldLevel, oldLevel, newLevel };
}

// XP за сообщение с анти-спам-кулдауном (profile.lastXpAt). Возвращает результат
// awardXp либо null, если ещё рано (сообщение в окне кулдауна не даёт XP).
function awardMessageXp(profile, settings) {
  if (!profile) return null;
  const now = Date.now();
  if (now - Number(profile.lastXpAt || 0) < settings.cooldownMs) return null;
  profile.lastXpAt = now;
  const span = Math.max(0, settings.messageMax - settings.messageMin);
  const amount = settings.messageMin + Math.floor(Math.random() * (span + 1));
  return awardXp(profile, amount);
}

// XP за минуты войса (без кулдауна — минуты уже агрегированы вызывающим).
function awardVoiceXp(profile, minutes, settings) {
  return awardXp(profile, Math.floor(Number(minutes) || 0) * settings.voicePerMinute);
}

// Привести level-роли участника к достигнутому уровню (rank-стиль: держим только
// высший заслуженный тир, низшие снимаем). Best-effort: нехватка прав / иерархия
// не должны ронять обработчик. Возвращает id выданных ролей.
async function syncLevelRoles(member, level, levelRoles) {
  if (!member?.roles || !Array.isArray(levelRoles) || levelRoles.length === 0) return [];
  const sorted = levelRoles
    .filter((entry) => entry && entry.roleId)
    .sort((a, b) => a.level - b.level);
  const earned = sorted.filter((entry) => level >= entry.level);
  if (earned.length === 0) return [];

  const target = earned[earned.length - 1];
  const added = [];
  try {
    if (!member.roles.cache.has(target.roleId)) {
      await member.roles.add(target.roleId);
      added.push(target.roleId);
    }
    const toRemove = sorted
      .filter((entry) => entry.roleId !== target.roleId && member.roles.cache.has(entry.roleId))
      .map((entry) => entry.roleId);
    if (toRemove.length) await member.roles.remove(toRemove).catch(() => null);
  } catch (error) {
    // best-effort: нет прав / роль выше бота в иерархии
  }
  return added;
}

// Панель-уведомление о новом уровне (Components v2). imageUrl — canvas-карта level-up
// (если canvas доступен), иначе панель показывается с аватаром-thumbnail.
function levelUpPanel(user, info, addedRoleId = null, imageUrl = null) {
  const lines = [`${ICONS.xp} Уровень **${info.oldLevel}** → **${info.newLevel}**`];
  if (addedRoleId) lines.push(`${ICONS.success} Выдана роль <@&${addedRoleId}>`);
  return mediaPanel({
    title: 'Новый уровень!',
    icon: ICONS.level,
    eyebrow: 'Прогресс Onix',
    description: `${mentionUser(user.id)} достиг **${info.newLevel} уровня**! ${ICONS.fire}`,
    color: COLORS.warning,
    imageUrl: imageUrl || undefined,
    thumbnail: imageUrl ? undefined : (typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 256 }) : undefined),
    lines
  });
}

module.exports = {
  awardXp,
  awardMessageXp,
  awardVoiceXp,
  prestigeMultiplier,
  syncLevelRoles,
  levelUpPanel
};
