const path = require('node:path');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function colorFromEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const normalized = value.trim().replace(/^#/, '0x');
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function listFromEnv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

// Парсит LEVEL_ROLES вида "5:roleId,10:roleId2,25:roleId3" → [{ level, roleId }].
// Невалидные пары пропускаются. Результат отсортирован по уровню.
function levelRolesFromEnv(name) {
  return listFromEnv(name)
    .map((pair) => {
      const [levelRaw, roleId] = pair.split(':').map((part) => part.trim());
      const level = Number(levelRaw);
      return Number.isFinite(level) && level > 0 && roleId ? { level, roleId } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.level - b.level);
}

const primaryGuildId = process.env.DISCORD_GUILD_ID || null;
const guildIds = [...new Set([
  ...listFromEnv('DISCORD_GUILD_IDS'),
  ...(primaryGuildId ? [primaryGuildId] : [])
])];

module.exports = {
  projectRoot,
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: primaryGuildId,
  guildIds,
  adminChannelId: process.env.ADMIN_CHANNEL_ID || null,
  reportChannelId: process.env.REPORT_CHANNEL_ID || process.env.ADMIN_CHANNEL_ID || null,
  tempRoomTriggerChannelId: process.env.TEMP_ROOM_TRIGGER_CHANNEL_ID || null,
  tempRoomCategoryId: process.env.TEMP_ROOM_CATEGORY_ID || null,
  // Текстовый канал, куда бот постит статичную панель управления комнатами (для всех).
  roomPanelChannelId: process.env.ROOM_PANEL_CHANNEL_ID || '1308371582426681416',
  // Текстовый канал, куда бот постит статичную панель тикетов (кнопки → модалка → канал тикет-N).
  ticketPanelChannelId: process.env.TICKET_PANEL_CHANNEL_ID || null,
  // Категория, в которой создаются приватные каналы тикетов/жалоб (null = без категории).
  ticketCategoryId: process.env.TICKET_CATEGORY_ID || null,
  // Цена покупки личной (постоянной) комнаты в магазине.
  roomPrice: numberFromEnv('ROOM_PRICE', 10000),
  databasePath: path.resolve(projectRoot, process.env.DATABASE_PATH || 'data/onix.db'),
  redisUrl: process.env.REDIS_URL || null,
  // Веб-дашборд. Без авторизации — по умолчанию слушаем только localhost.
  // Перед публичным хостингом (WEB_HOST=0.0.0.0) задай DASHBOARD_TOKEN.
  webEnabled: /^(1|true|yes)$/i.test(String(process.env.WEB_ENABLED || '')),
  webHost: process.env.WEB_HOST || '127.0.0.1',
  webPort: numberFromEnv('WEB_PORT', 3000),
  webToken: process.env.DASHBOARD_TOKEN || null,
  globalRateLimit: numberFromEnv('GLOBAL_RATE_LIMIT', 5),
  globalRateWindowMs: numberFromEnv('GLOBAL_RATE_WINDOW_MS', 1000),
  accentColor: colorFromEnv('ACCENT_COLOR', 0x7C3AED),
  startBalance: numberFromEnv('START_BALANCE', 500),
  timelyReward: numberFromEnv('TIMELY_REWARD', 250),
  timelySnowballs: numberFromEnv('TIMELY_SNOWBALLS', 4),
  timelyCooldownHours: numberFromEnv('TIMELY_COOLDOWN_HOURS', 12),
  personalRolePrice: numberFromEnv('PERSONAL_ROLE_PRICE', 5000),
  // Прогрессия (XP/уровни). Сообщения дают XP с анти-спам-кулдауном, войс — за минуту.
  levelXp: {
    messageMin: numberFromEnv('XP_MESSAGE_MIN', 15),
    messageMax: numberFromEnv('XP_MESSAGE_MAX', 25),
    cooldownMs: numberFromEnv('XP_MESSAGE_COOLDOWN_MS', 60000),
    voicePerMinute: numberFromEnv('XP_VOICE_PER_MINUTE', 8)
  },
  // Авто-роли за уровень: LEVEL_ROLES="5:roleId,10:roleId2,25:roleId3".
  levelRoles: levelRolesFromEnv('LEVEL_ROLES'),
  // Канал для уведомлений о новом уровне (пусто = в канал, где набрался уровень).
  levelUpChannelId: process.env.LEVEL_UP_CHANNEL_ID || null,
  // Таинственные коробки (mystery box). Канал авто-спавна (пусто = только /drop вручную).
  dropChannelId: process.env.DROP_CHANNEL_ID || null,
  dropIntervalMs: numberFromEnv('DROP_INTERVAL_MS', 30 * 60 * 1000),
  // Сезоны. Канал итогов сезона (пусто = ADMIN_CHANNEL_ID) и роль-награда победителю.
  seasonChannelId: process.env.SEASON_CHANNEL_ID || null,
  seasonWinnerRoleId: process.env.SEASON_WINNER_ROLE_ID || null,
  // Уведомления о стримах (Twitch). Без client_id/secret фича выключена.
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID || null,
    clientSecret: process.env.TWITCH_CLIENT_SECRET || null,
    pollMs: numberFromEnv('TWITCH_POLL_MS', 3 * 60 * 1000)
  },
  // Канал-приёмник логов по умолчанию (мастер-канал, если для события не задан свой).
  logChannelId: process.env.LOG_CHANNEL_ID || null,
  // Канал, куда постятся карточки новых достижений (а не в чат, где набралось условие).
  achievementChannelId: process.env.ACHIEVEMENT_CHANNEL_ID || '1114534572340805673',
  // Канал логов использования слэш-команд (кто какую команду вызвал).
  commandLogChannelId: process.env.COMMAND_LOG_CHANNEL_ID || '1512210717762257137',
  // Дефолты автомодерации. Переопределяются per-guild через дашборд/команду /automod.
  automod: {
    enabled: boolFromEnv('AUTOMOD_ENABLED', true),
    spamCount: numberFromEnv('AUTOMOD_SPAM_COUNT', 10),
    spamWindowMs: numberFromEnv('AUTOMOD_SPAM_WINDOW_MS', 60000),
    mentionLimit: numberFromEnv('AUTOMOD_MENTION_LIMIT', 5),
    mentionRate: numberFromEnv('AUTOMOD_MENTION_RATE', 8),
    mentionRateMs: numberFromEnv('AUTOMOD_MENTION_RATE_MS', 30000),
    blockInvites: boolFromEnv('AUTOMOD_BLOCK_INVITES', true),
    blockLinks: boolFromEnv('AUTOMOD_BLOCK_LINKS', false),
    linkWhitelist: [...new Set([...listFromEnv('AUTOMOD_LINK_WHITELIST'), 'google.', 'youtube.', 'youtu.be'])],
    capsEnabled: boolFromEnv('AUTOMOD_CAPS', true),
    emojiLimit: numberFromEnv('AUTOMOD_EMOJI_LIMIT', 10),
    newlineLimit: numberFromEnv('AUTOMOD_NEWLINE_LIMIT', 8),
    badwords: listFromEnv('AUTOMOD_BADWORDS'),
    bypassRoleIds: listFromEnv('AUTOMOD_BYPASS_ROLE_IDS'),
    strikeWindowMs: numberFromEnv('AUTOMOD_STRIKE_WINDOW_MS', 600000),
    timeoutSteps: [
      { strikes: 3, ms: 5 * 60 * 1000 },
      { strikes: 5, ms: 60 * 60 * 1000 },
      { strikes: 8, ms: 24 * 60 * 60 * 1000 }
    ]
  }
};
