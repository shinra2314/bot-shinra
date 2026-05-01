const { panel, COLORS, componentPayload } = require('../ui/components');
const { mentionUser } = require('../utils/format');

function createLogger(context) {
  function settings(guildId) {
    const guild = context.store.guild(guildId);
    guild.logSettings ||= { enabled: false, channelId: null };
    return guild.logSettings;
  }

  function addLog(guildId, entry) {
    const guild = context.store.guild(guildId);
    guild.logs ||= [];
    guild.logs.unshift({ createdAt: Date.now(), ...entry });
    guild.logs = guild.logs.slice(0, 500);
  }

  async function sendLog(guildId, embedData) {
    const cfg = settings(guildId);
    if (!cfg.enabled || !cfg.channelId) return;
    try {
      const channel = await context.client.channels.fetch(cfg.channelId).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send(componentPayload(panel(embedData)));
      }
    } catch {
      // no access to log channel
    }
  }

  async function logJoin(member) {
    addLog(member.guild.id, {
      type: 'join',
      userId: member.id,
      username: member.user.globalName || member.user.username
    });

    const accountAge = Date.now() - member.user.createdTimestamp;
    const days = Math.floor(accountAge / 86400000);
    const warning = days < 7 ? '\n⚠️ **Новый аккаунт!** Создан менее 7 дней назад.' : '';

    await sendLog(member.guild.id, {
      title: '📥 Участник присоединился',
      description: `${mentionUser(member.id)} (${member.user.username})${warning}`,
      color: COLORS.success,
      fields: [
        { name: '🆔 ID', value: member.id },
        { name: '📅 Аккаунт создан', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` },
        { name: '👥 Участников', value: String(member.guild.memberCount) }
      ]
    });
    await context.store.save().catch(() => null);
  }

  async function logLeave(member) {
    addLog(member.guild.id, {
      type: 'leave',
      userId: member.id,
      username: member.user.globalName || member.user.username
    });
    await sendLog(member.guild.id, {
      title: '📤 Участник покинул сервер',
      description: `**${member.user.globalName || member.user.username}** (${member.user.username})`,
      color: COLORS.danger,
      fields: [
        { name: '🆔 ID', value: member.id },
        { name: '📅 Был на сервере с', value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'неизвестно' },
        { name: '👥 Участников', value: String(member.guild.memberCount) }
      ]
    });
    await context.store.save().catch(() => null);
  }

  async function logNickChange(oldMember, newMember) {
    if (oldMember.nickname === newMember.nickname) return;
    addLog(newMember.guild.id, {
      type: 'nick',
      userId: newMember.id,
      oldNick: oldMember.nickname || oldMember.user.username,
      newNick: newMember.nickname || newMember.user.username
    });
    await sendLog(newMember.guild.id, {
      title: '✏️ Смена никнейма',
      description: mentionUser(newMember.id),
      color: COLORS.warning,
      fields: [
        { name: 'Было', value: oldMember.nickname || oldMember.user.username },
        { name: 'Стало', value: newMember.nickname || newMember.user.username }
      ]
    });
    await context.store.save().catch(() => null);
  }

  async function logDeletedMessage(message) {
    if (!message.guildId || message.author?.bot) return;
    const content = message.content || '(пустое сообщение)';
    addLog(message.guildId, {
      type: 'delete',
      userId: message.author?.id,
      channelId: message.channelId,
      content: content.slice(0, 200)
    });
    await sendLog(message.guildId, {
      title: '🗑️ Сообщение удалено',
      description: `Канал: <#${message.channelId}>`,
      color: COLORS.danger,
      fields: [
        { name: '👤 Автор', value: message.author ? mentionUser(message.author.id) : 'неизвестен' },
        { name: '📝 Содержимое', value: content.length > 800 ? content.slice(0, 800) + '…' : content }
      ]
    });
    await context.store.save().catch(() => null);
  }

  async function logAutomod(guildId, userId, result) {
    addLog(guildId, {
      type: 'automod',
      userId,
      violation: result.violation,
      muted: result.muted,
      warningCount: result.warningCount
    });
    const muteText = result.muted ? '\n🔇 **Пользователь получил мьют.**' : '';
    await sendLog(guildId, {
      title: '🛡️ AutoMod',
      description: `${mentionUser(userId)} — ${result.violation}${muteText}`,
      color: COLORS.warning,
      fields: [
        { name: '⚠️ Предупреждений (24ч)', value: String(result.warningCount) }
      ]
    });
  }

  function getLogs(guildId, type, limit = 20) {
    const guild = context.store.guild(guildId);
    guild.logs ||= [];
    if (type) return guild.logs.filter((l) => l.type === type).slice(0, limit);
    return guild.logs.slice(0, limit);
  }

  function modStats(guildId) {
    const history = context.store.guild(guildId).moderationHistory || [];
    const stats = {};
    for (const action of history) {
      if (!action.moderatorId) continue;
      stats[action.moderatorId] ||= { total: 0, warns: 0, bans: 0, automod: 0 };
      stats[action.moderatorId].total++;
      if (action.type === 'warn') stats[action.moderatorId].warns++;
      if (action.type === 'ban') stats[action.moderatorId].bans++;
      if (action.type === 'automod' || action.type === 'automute') stats[action.moderatorId].automod++;
    }
    return Object.entries(stats)
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.total - a.total);
  }

  return { settings, logJoin, logLeave, logNickChange, logDeletedMessage, logAutomod, getLogs, modStats };
}

module.exports = createLogger;
