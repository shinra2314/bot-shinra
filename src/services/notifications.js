// Уведомления о стримах (Twitch Helix). Поллит статус настроенных стримеров по всем
// гильдиям; на переходе offline→live постит анонс в канал гильдии с пингом роли.
//
// Требует TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET (app access token, client_credentials).
// Без них фича выключена (poll сразу выходит). Состояние live хранится в памяти —
// на рестарте уже идущие стримы не переанонсируются (первый поллинг лишь фиксирует
// состояние без анонса).

const { COLORS, componentPayload, mediaPanel } = require('../ui/components');

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const STREAMS_URL = 'https://api.twitch.tv/helix/streams';

// `${guildId}:${login}` → boolean (последнее известное состояние live).
const liveState = new Map();
let token = null;
let tokenExpiresAt = 0;

function isEnabled(config) {
  return Boolean(config.twitch?.clientId && config.twitch?.clientSecret);
}

async function getToken(config) {
  if (token && Date.now() < tokenExpiresAt - 60000) return token;
  const params = new URLSearchParams({
    client_id: config.twitch.clientId,
    client_secret: config.twitch.clientSecret,
    grant_type: 'client_credentials'
  });
  const res = await fetch(`${TOKEN_URL}?${params.toString()}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Twitch token error: ${res.status}`);
  const data = await res.json();
  token = data.access_token;
  tokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return token;
}

// Возвращает Map(login → streamObject) для живых из переданного списка (до 100).
async function fetchLive(config, logins) {
  if (logins.length === 0) return new Map();
  const accessToken = await getToken(config);
  const params = new URLSearchParams();
  for (const login of logins.slice(0, 100)) params.append('user_login', login);
  const res = await fetch(`${STREAMS_URL}?${params.toString()}`, {
    headers: { 'Client-Id': config.twitch.clientId, Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Twitch streams error: ${res.status}`);
  const data = await res.json();
  const live = new Map();
  for (const stream of data.data || []) live.set(String(stream.user_login).toLowerCase(), stream);
  return live;
}

function announcePanel(stream, roleId) {
  const thumb = String(stream.thumbnail_url || '')
    .replace('{width}', '440')
    .replace('{height}', '248');
  // Components V2 не поддерживает top-level content — пинг роли кладём в текст панели.
  const description = `${roleId ? `<@&${roleId}> ` : ''}**${stream.title || 'Без названия'}**`;
  return mediaPanel({
    title: `🔴 ${stream.user_name} в эфире!`,
    icon: '🎥',
    eyebrow: 'Стримы Onix',
    description,
    color: COLORS.danger,
    imageUrl: thumb || undefined,
    lines: [
      stream.game_name ? `🎮 Игра: **${stream.game_name}**` : null,
      `👁️ Зрителей: **${stream.viewer_count || 0}**`,
      `🔗 https://twitch.tv/${stream.user_login}`
    ].filter(Boolean),
    footer: 'Twitch'
  });
}

// Один проход поллинга по всем гильдиям. Зовётся из интервала в index.js.
async function poll(context) {
  const { client, store, config } = context;
  if (!isEnabled(config)) return;

  // Собираем уникальные логины со всех гильдий — один запрос к Twitch на всех.
  const guildConfigs = [];
  const allLogins = new Set();
  for (const guild of client.guilds.cache.values()) {
    const cfg = store.getStreamConfig(guild.id);
    if (!cfg.channelId || cfg.streamers.length === 0) continue;
    guildConfigs.push({ guildId: guild.id, cfg });
    for (const login of cfg.streamers) allLogins.add(login);
  }
  if (allLogins.size === 0) return;

  let live;
  try {
    live = await fetchLive(config, [...allLogins]);
  } catch (error) {
    console.error('Twitch poll error:', error.message);
    return;
  }

  for (const { guildId, cfg } of guildConfigs) {
    for (const login of cfg.streamers) {
      const key = `${guildId}:${login}`;
      const wasLive = liveState.get(key);
      const stream = live.get(login);
      const isLive = Boolean(stream);

      // Анонсируем только реальный переход offline→live (не первый замер).
      if (isLive && wasLive === false) {
        const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
        if (channel?.isTextBased?.()) {
          await channel
            .send(componentPayload(announcePanel(stream, cfg.roleId), {
              allowedMentions: cfg.roleId ? { roles: [cfg.roleId] } : { parse: [] }
            }))
            .catch(() => null);
        }
      }
      liveState.set(key, isLive);
    }
  }
}

module.exports = { isEnabled, poll };
