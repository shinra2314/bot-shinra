function formatCoins(value) {
  return `${Number(value || 0).toLocaleString('ru-RU')} мон.`;
}

function formatMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.floor(totalMinutes || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} мин.`;
  return `${hours} ч. ${rest} мин.`;
}

function levelFromXp(xp) {
  const safeXp = Math.max(0, Number(xp || 0));
  const level = Math.floor(Math.sqrt(safeXp / 100)) + 1;
  const currentLevelXp = (level - 1) ** 2 * 100;
  const nextLevelXp = level ** 2 * 100;
  const progress = safeXp - currentLevelXp;
  const needed = nextLevelXp - currentLevelXp;
  return { level, progress, needed, xp: safeXp };
}

function progressBar(progress, total, size = 10) {
  if (total <= 0) return '□□□□□□□□□□'.slice(0, size);
  const filled = Math.max(0, Math.min(size, Math.round((progress / total) * size)));
  return '■'.repeat(filled) + '□'.repeat(size - filled);
}

function displayName(user) {
  if (!user) return 'Неизвестно';
  return user.globalName || user.displayName || user.username || String(user.id || user);
}

function mentionUser(id) {
  return `<@${id}>`;
}

function truncate(text, max = 900) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function timeAgo(timestamp) {
  if (!timestamp) return 'никогда';
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return `${Math.floor(hours / 24)} дн. назад`;
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function compactThumbnail(user) {
  return user.displayAvatarURL({ size: 256 });
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days} д. ${hours} ч. ${minutes} мин.`;
  if (hours > 0) return `${hours} ч. ${minutes} мин.`;
  if (minutes > 0) return `${minutes} мин. ${seconds} сек.`;
  return `${seconds} сек.`;
}

module.exports = {
  compactThumbnail,
  displayName,
  formatDateTime,
  formatCoins,
  formatDuration,
  formatMinutes,
  levelFromXp,
  mentionUser,
  progressBar,
  timeAgo,
  truncate
};
