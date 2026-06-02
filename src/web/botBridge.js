// Мост между веб-слоем и Discord-клиентом. Живёт в том же процессе, что и бот,
// поэтому держит прямую ссылку на client. Под шардингом гильдия/канал могут быть
// на другом шарде — тогда падаем в broadcastEval как фоллбэк.
//
// Все исходящие сообщения бота по умолчанию глушат упоминания
// (allowedMentions parse:[]), чтобы веб-композер/релей не пинговал @everyone и т.п.

const { PermissionFlagsBits } = require('discord.js');

function normalizePayload(payload) {
  const base = typeof payload === 'string' ? { content: payload } : { ...payload };
  if (!base.allowedMentions) base.allowedMentions = { parse: [] };
  return base;
}

// Отправка в канал по id. Возвращает { ok, error? }.
async function sendToChannel(client, channelId, payload) {
  const data = normalizePayload(payload);
  // Локальный путь.
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel) {
    if (!channel.isTextBased?.()) return { ok: false, error: 'NOT_TEXT_CHANNEL' };
    try {
      await channel.send(data);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || 'SEND_FAILED' };
    }
  }
  // Кросс-шард фоллбэк.
  if (client.shard) {
    try {
      const results = await client.shard.broadcastEval(
        async (c, { cid, p }) => {
          const ch = c.channels.cache.get(cid);
          if (!ch || !ch.isTextBased?.()) return null;
          await ch.send(p);
          return true;
        },
        { context: { cid: channelId, p: data } }
      );
      if (results.some(Boolean)) return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || 'BROADCAST_FAILED' };
    }
  }
  return { ok: false, error: 'CHANNEL_NOT_FOUND' };
}

function mapTextChannel(client, ch) {
  const me = ch.guild?.members?.me;
  const perms = me ? ch.permissionsFor(me) : null;
  const canSend = perms ? perms.has(PermissionFlagsBits.SendMessages) && perms.has(PermissionFlagsBits.ViewChannel) : true;
  return { id: ch.id, name: ch.name, parent: ch.parent?.name || null, canSend };
}

// Текстовые каналы гильдии, куда бот может писать (для дропдауна композера).
async function listTextChannels(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (guild) {
    return guild.channels.cache
      .filter((ch) => ch.isTextBased?.() && !ch.isThread?.())
      .map((ch) => mapTextChannel(client, ch))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  if (client.shard) {
    try {
      const results = await client.shard.broadcastEval(
        (c, { gid }) => {
          const g = c.guilds.cache.get(gid);
          if (!g) return null;
          return g.channels.cache
            .filter((ch) => ch.isTextBased?.() && !ch.isThread?.())
            .map((ch) => ({ id: ch.id, name: ch.name, parent: ch.parent ? ch.parent.name : null, canSend: true }));
        },
        { context: { gid: guildId } }
      );
      const hit = results.find(Boolean);
      if (hit) return hit.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      return [];
    }
  }
  return [];
}

// Список гильдий бота (для дашборда). Под шардингом агрегируем по шардам.
async function listGuilds(client) {
  const local = client.guilds.cache.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.iconURL ? g.iconURL({ extension: 'png', size: 64 }) : null,
    memberCount: g.memberCount
  }));
  if (!client.shard) return local;
  try {
    const results = await client.shard.broadcastEval((c) =>
      c.guilds.cache.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL ? g.iconURL({ extension: 'png', size: 64 }) : null,
        memberCount: g.memberCount
      }))
    );
    return results.flat();
  } catch (error) {
    return local;
  }
}

module.exports = { sendToChannel, listTextChannels, listGuilds, normalizePayload };
