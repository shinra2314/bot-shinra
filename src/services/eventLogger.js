// Система логов сервера. Регистрирует слушатели gateway-событий и шлёт панели
// Components V2 в каналы, заданные в store.getLogConfig(guildId). Маршрутизация:
// у каждого события свой ключ; канал берётся из override события → мастер-канал
// логов → ADMIN_CHANNEL_ID. Событие логируется только если включено (enabled).
//
// Часть «событий» (warnAdd/warnRemove/automod/xpChange) приходит не из gateway,
// а изнутри кода — для них вызывают eventLogger.emit(...) напрямую.

const { Events, AuditLogEvent } = require('discord.js');
const { COLORS, componentPayload, panel } = require('../ui/components');

// Каталог событий: ключ → { label (рус.), icon, color, category }. Единый
// источник истины — используется и дашбордом (через web/api) для рендера списка.
const LOG_EVENTS = {
  // Голос
  voiceJoin: { label: 'Участник зашёл в голосовой канал', icon: '🔊', color: COLORS.success, category: 'Голос' },
  voiceLeave: { label: 'Участник покинул голосовой канал', icon: '🔇', color: COLORS.danger, category: 'Голос' },
  voiceMove: { label: 'Участник перешёл в другой голосовой канал', icon: '🔀', color: COLORS.info, category: 'Голос' },
  // Трибуна
  stageOpen: { label: 'Трибуна открыта', icon: '🎙️', color: COLORS.success, category: 'Трибуна' },
  stageClose: { label: 'Трибуна закрыта', icon: '🚫', color: COLORS.danger, category: 'Трибуна' },
  stageUpdate: { label: 'Трибуна обновлена', icon: '📡', color: COLORS.info, category: 'Трибуна' },
  // Сообщения
  messageEdit: { label: 'Сообщение было отредактировано', icon: '✏️', color: COLORS.info, category: 'Сообщения' },
  messageDelete: { label: 'Сообщение было удалено', icon: '🗑️', color: COLORS.danger, category: 'Сообщения' },
  messageBulkDelete: { label: 'Сообщения были очищены', icon: '🧹', color: COLORS.danger, category: 'Сообщения' },
  // Участники
  memberJoin: { label: 'Присоединился новый участник', icon: '📥', color: COLORS.success, category: 'Участники' },
  memberLeave: { label: 'Участник покинул сервер', icon: '📤', color: COLORS.warning, category: 'Участники' },
  memberKick: { label: 'Участник был изгнан', icon: '👢', color: COLORS.danger, category: 'Участники' },
  memberBan: { label: 'Участник был забанен', icon: '⛔', color: COLORS.danger, category: 'Участники' },
  memberUnban: { label: 'Участник был разбанен', icon: '♻️', color: COLORS.success, category: 'Участники' },
  memberTimeout: { label: 'Участник был замьючен', icon: '🔕', color: COLORS.warning, category: 'Участники' },
  memberUntimeout: { label: 'Участник был размьючен', icon: '🔔', color: COLORS.success, category: 'Участники' },
  memberRolesUpdate: { label: 'Обновлены роли участника', icon: '🔄', color: COLORS.info, category: 'Участники' },
  memberNickUpdate: { label: 'Никнейм участника был изменён', icon: '📝', color: COLORS.info, category: 'Участники' },
  // Боты
  botAdd: { label: 'Бот был добавлен на сервер', icon: '🤖', color: COLORS.neutral, category: 'Боты' },
  botRemove: { label: 'Бот покинул сервер', icon: '🤖', color: COLORS.neutral, category: 'Боты' },
  // Модерация
  warnAdd: { label: 'Участник получил предупреждение', icon: '⚠️', color: COLORS.warning, category: 'Модерация' },
  warnRemove: { label: 'Предупреждение было снято или сброшено', icon: '✅', color: COLORS.success, category: 'Модерация' },
  automod: { label: 'Сработала автомодерация', icon: '🛡️', color: COLORS.danger, category: 'Модерация' }
};

let ctx = null;

function userTag(user) {
  if (!user) return 'неизвестно';
  const name = user.globalName || user.username || user.id;
  return `${name} (<@${user.id}>)`;
}

// Отправка панели лога для события. spec: { title?, description?, lines?, fields?, footer? }.
async function emit(guildId, eventKey, spec = {}) {
  if (!ctx || !guildId) return;
  const meta = LOG_EVENTS[eventKey];
  if (!meta) return;
  try {
    const channelId = ctx.store.logChannelFor(guildId, eventKey);
    if (!channelId) return;
    const channel = await ctx.client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;
    const components = panel({
      title: spec.title || meta.label,
      icon: meta.icon,
      eyebrow: 'Логи сервера',
      description: spec.description,
      color: meta.color,
      lines: spec.lines || [],
      fields: spec.fields || [],
      footer: spec.footer || `${new Date().toLocaleString('ru-RU')}`
    });
    await channel.send(componentPayload(components, { allowedMentions: { parse: [] } }));
  } catch (error) {
    console.error(`[eventLogger] emit ${eventKey} error:`, error);
  }
}

function clip(value, max = 900) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Попытка определить, был ли уход участника киком (best-effort, нужен ViewAuditLog).
async function wasKicked(guild, userId) {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 5 });
    const entry = logs.entries.find(
      (e) => e.target?.id === userId && Date.now() - e.createdTimestamp < 8000
    );
    return entry ? { executor: entry.executor, reason: entry.reason } : null;
  } catch {
    return null;
  }
}

function register(client, context) {
  ctx = context;

  // ---- Голос ----
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const guildId = newState.guild?.id || oldState.guild?.id;
    const member = newState.member || oldState.member;
    if (!guildId || !member) return;
    const before = oldState.channelId;
    const after = newState.channelId;
    if (!before && after) {
      emit(guildId, 'voiceJoin', { description: `${userTag(member.user)} зашёл в <#${after}>.` });
    } else if (before && !after) {
      emit(guildId, 'voiceLeave', { description: `${userTag(member.user)} покинул <#${before}>.` });
    } else if (before && after && before !== after) {
      emit(guildId, 'voiceMove', { description: `${userTag(member.user)}: <#${before}> → <#${after}>.` });
    }
  });

  // ---- Сообщения ----
  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    try {
      const msg = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
      if (!msg?.guildId || msg.author?.bot) return;
      if (oldMessage.content === msg.content) return;
      emit(msg.guildId, 'messageEdit', {
        description: `${userTag(msg.author)} отредактировал сообщение в <#${msg.channelId}>.`,
        fields: [
          { name: 'Было', value: clip(oldMessage.partial ? '*недоступно (не в кэше)*' : oldMessage.content || '—') },
          { name: 'Стало', value: clip(msg.content || '—') }
        ],
        footer: `ID сообщения: ${msg.id}`
      });
    } catch (error) {
      console.error('[eventLogger] messageEdit error:', error);
    }
  });

  client.on(Events.MessageDelete, (message) => {
    if (!message.guildId || message.author?.bot) return;
    emit(message.guildId, 'messageDelete', {
      description: message.author ? `Сообщение ${userTag(message.author)} удалено в <#${message.channelId}>.` : `Сообщение удалено в <#${message.channelId}>.`,
      fields: [{ name: 'Содержимое', value: clip(message.partial ? '*недоступно (не в кэше)*' : message.content || '—') }],
      footer: `ID сообщения: ${message.id}`
    });
  });

  client.on(Events.MessageBulkDelete, (messages, channel) => {
    const guildId = channel?.guildId || channel?.guild?.id;
    if (!guildId) return;
    emit(guildId, 'messageBulkDelete', {
      description: `Очищено сообщений: **${messages.size}** в <#${channel.id}>.`
    });
  });

  // ---- Участники ----
  client.on(Events.GuildMemberAdd, (member) => {
    const key = member.user.bot ? 'botAdd' : 'memberJoin';
    emit(member.guild.id, key, {
      description: `${userTag(member.user)} ${member.user.bot ? 'добавлен на сервер' : 'присоединился к серверу'}.`,
      footer: `Аккаунт создан: ${member.user.createdAt.toLocaleDateString('ru-RU')}`
    });
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.user.bot) {
      emit(member.guild.id, 'botRemove', { description: `${userTag(member.user)} покинул сервер.` });
      return;
    }
    const kick = await wasKicked(member.guild, member.id);
    if (kick) {
      emit(member.guild.id, 'memberKick', {
        description: `${userTag(member.user)} был изгнан.`,
        fields: kick.reason ? [{ name: 'Причина', value: clip(kick.reason, 500) }] : [],
        footer: kick.executor ? `Модератор: ${kick.executor.username}` : undefined
      });
    } else {
      emit(member.guild.id, 'memberLeave', { description: `${userTag(member.user)} покинул сервер.` });
    }
  });

  client.on(Events.GuildBanAdd, (ban) => {
    emit(ban.guild.id, 'memberBan', {
      description: `${userTag(ban.user)} был забанен.`,
      fields: ban.reason ? [{ name: 'Причина', value: clip(ban.reason, 500) }] : []
    });
  });

  client.on(Events.GuildBanRemove, (ban) => {
    emit(ban.guild.id, 'memberUnban', { description: `${userTag(ban.user)} был разбанен.` });
  });

  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    const guildId = newMember.guild.id;
    // Смена ника
    if (oldMember.nickname !== newMember.nickname) {
      emit(guildId, 'memberNickUpdate', {
        description: `${userTag(newMember.user)} сменил никнейм.`,
        fields: [
          { name: 'Было', value: oldMember.nickname || '—' },
          { name: 'Стало', value: newMember.nickname || '—' }
        ]
      });
    }
    // Изменение ролей
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;
    const added = newRoles.filter((r) => !oldRoles.has(r.id)).map((r) => `<@&${r.id}>`);
    const removed = oldRoles.filter((r) => !newRoles.has(r.id)).map((r) => `<@&${r.id}>`);
    if (added.length || removed.length) {
      const lines = [];
      if (added.length) lines.push(`➕ Добавлены: ${added.join(', ')}`);
      if (removed.length) lines.push(`➖ Сняты: ${removed.join(', ')}`);
      emit(guildId, 'memberRolesUpdate', { description: `Роли ${userTag(newMember.user)} обновлены.`, lines });
    }
    // Таймаут (мут)
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
    const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;
    if (!oldTimeout && newTimeout) {
      emit(guildId, 'memberTimeout', {
        description: `${userTag(newMember.user)} был замьючен.`,
        footer: `До: ${new Date(newTimeout).toLocaleString('ru-RU')}`
      });
    } else if (oldTimeout && !newTimeout) {
      emit(guildId, 'memberUntimeout', { description: `${userTag(newMember.user)} был размьючен.` });
    }
  });

  // ---- Трибуна (best-effort, события могут не приходить без нужных интентов) ----
  client.on(Events.StageInstanceCreate, (stage) => {
    emit(stage.guild?.id, 'stageOpen', { description: `Трибуна открыта: «${stage.topic}» в <#${stage.channelId}>.` });
  });
  client.on(Events.StageInstanceDelete, (stage) => {
    emit(stage.guild?.id, 'stageClose', { description: `Трибуна закрыта в <#${stage.channelId}>.` });
  });
  client.on(Events.StageInstanceUpdate, (oldStage, newStage) => {
    emit(newStage.guild?.id, 'stageUpdate', { description: `Трибуна обновлена: «${newStage.topic}».` });
  });
}

module.exports = { register, emit, LOG_EVENTS };
