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
  databasePath: path.resolve(projectRoot, process.env.DATABASE_PATH || 'data/onix.db'),
  redisUrl: process.env.REDIS_URL || null,
  // Веб-дашборд. Без авторизации — по умолчанию слушаем только localhost.
  // Перед публичным хостингом (WEB_HOST=0.0.0.0) задай DASHBOARD_TOKEN.
  webEnabled: /^(1|true|yes)$/i.test(String(process.env.WEB_ENABLED || '')),
  webHost: process.env.WEB_HOST || '127.0.0.1',
  webPort: numberFromEnv('WEB_PORT', 3000),
  webToken: process.env.DASHBOARD_TOKEN || null,
  webRelayChannelId: process.env.WEB_RELAY_CHANNEL_ID || process.env.REPORT_CHANNEL_ID || process.env.ADMIN_CHANNEL_ID || null,
  globalRateLimit: numberFromEnv('GLOBAL_RATE_LIMIT', 5),
  globalRateWindowMs: numberFromEnv('GLOBAL_RATE_WINDOW_MS', 1000),
  accentColor: colorFromEnv('ACCENT_COLOR', 0x7C3AED),
  startBalance: numberFromEnv('START_BALANCE', 500),
  timelyReward: numberFromEnv('TIMELY_REWARD', 250),
  timelySnowballs: numberFromEnv('TIMELY_SNOWBALLS', 4),
  timelyCooldownHours: numberFromEnv('TIMELY_COOLDOWN_HOURS', 12),
  personalRolePrice: numberFromEnv('PERSONAL_ROLE_PRICE', 5000)
};
