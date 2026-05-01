const { PermissionFlagsBits } = require('discord.js');

const DEFAULT_SETTINGS = {
  enabled: false,
  spamFilter: true,
  capsFilter: true,
  linkFilter: false,
  antiRaid: true,
  maxDuplicates: 3,
  duplicateWindow: 10000,
  capsThreshold: 0.7,
  capsMinLength: 10,
  raidThreshold: 8,
  raidWindow: 10000,
  muteMinutes: 10,
  warnThreshold: 3,
  whitelistedRoles: [],
  whitelistedChannels: [],
  logChannelId: null
};

function createAutomod(context) {
  const messageCache = new Map();
  const joinCache = new Map();

  function settings(guildId) {
    const guild = context.store.guild(guildId);
    guild.automod ||= { ...DEFAULT_SETTINGS };
    return guild.automod;
  }

  function isWhitelisted(message, cfg) {
    if (!message.member) return true;
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
    if (cfg.whitelistedChannels.includes(message.channelId)) return true;
    return cfg.whitelistedRoles.some((roleId) => message.member.roles.cache.has(roleId));
  }

  function getMessageHistory(userId, guildId) {
    const key = `${guildId}:${userId}`;
    if (!messageCache.has(key)) messageCache.set(key, []);
    return messageCache.get(key);
  }

  function addToHistory(userId, guildId, content) {
    const history = getMessageHistory(userId, guildId);
    history.push({ content: content.toLowerCase().trim(), timestamp: Date.now() });
    const cutoff = Date.now() - 30000;
    while (history.length > 0 && history[0].timestamp < cutoff) history.shift();
    if (history.length > 20) history.splice(0, history.length - 20);
  }

  function checkSpam(message, cfg) {
    const history = getMessageHistory(message.author.id, message.guildId);
    const window = Date.now() - cfg.duplicateWindow;
    const recent = history.filter((item) => item.timestamp > window);
    const content = message.content.toLowerCase().trim();
    const duplicates = recent.filter((item) => item.content === content).length;
    return duplicates >= cfg.maxDuplicates;
  }

  function checkCaps(message, cfg) {
    const text = message.content.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
    if (text.length < cfg.capsMinLength) return false;
    const upper = text.replace(/[^A-ZА-ЯЁ]/g, '').length;
    return (upper / text.length) >= cfg.capsThreshold;
  }

  function checkLinks(message) {
    return /https?:\/\/\S+|discord\.gg\/\S+/i.test(message.content);
  }

  function addWarning(guildId, userId, reason) {
    const guild = context.store.guild(guildId);
    guild.automodWarnings ||= {};
    guild.automodWarnings[userId] ||= [];
    guild.automodWarnings[userId].push({ reason, createdAt: Date.now() });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    guild.automodWarnings[userId] = guild.automodWarnings[userId].filter((w) => w.createdAt > cutoff);
    return guild.automodWarnings[userId].length;
  }

  function getWarnings(guildId, userId) {
    const guild = context.store.guild(guildId);
    guild.automodWarnings ||= {};
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return (guild.automodWarnings[userId] || []).filter((w) => w.createdAt > cutoff).length;
  }

  async function muteUser(message, reason, cfg) {
    try {
      const member = message.member;
      if (!member || !member.moderatable) return;
      const duration = cfg.muteMinutes * 60 * 1000;
      await member.timeout(duration, `[AutoMod] ${reason}`);
    } catch {
      // no permission to mute
    }
  }

  async function handleMessage(message) {
    if (!message.guildId || message.author.bot) return null;
    const cfg = settings(message.guildId);
    if (!cfg.enabled) return null;
    if (isWhitelisted(message, cfg)) return null;

    let violation = null;

    if (cfg.spamFilter && checkSpam(message, cfg)) {
      violation = 'спам (повтор сообщений)';
    } else if (cfg.capsFilter && checkCaps(message, cfg)) {
      violation = 'злоупотребление КАПСОМ';
    } else if (cfg.linkFilter && checkLinks(message)) {
      violation = 'ссылка в сообщении';
    }

    addToHistory(message.author.id, message.guildId, message.content);

    if (!violation) return null;

    const warningCount = addWarning(message.guildId, message.author.id, violation);

    try {
      await message.delete();
    } catch {
      // missing perms
    }

    context.store.addModerationAction(message.guildId, {
      type: 'automod',
      targetId: message.author.id,
      moderatorId: context.client.user.id,
      reason: violation
    });

    if (warningCount >= cfg.warnThreshold) {
      await muteUser(message, `${warningCount} нарушений за 24ч`, cfg);
      context.store.addModerationAction(message.guildId, {
        type: 'automute',
        targetId: message.author.id,
        moderatorId: context.client.user.id,
        reason: `Автоматический мьют: ${warningCount} нарушений за 24ч (${violation})`
      });
      await context.store.save();
      return { violation, muted: true, warningCount };
    }

    await context.store.save();
    return { violation, muted: false, warningCount };
  }

  function handleJoin(member) {
    const cfg = settings(member.guild.id);
    if (!cfg.enabled || !cfg.antiRaid) return false;

    const guildId = member.guild.id;
    if (!joinCache.has(guildId)) joinCache.set(guildId, []);
    const joins = joinCache.get(guildId);
    joins.push(Date.now());

    const window = Date.now() - cfg.raidWindow;
    while (joins.length > 0 && joins[0] < window) joins.shift();

    return joins.length >= cfg.raidThreshold;
  }

  function modReputation(guildId) {
    const history = context.store.guild(guildId).moderationHistory || [];
    const mods = {};
    for (const action of history) {
      if (!action.moderatorId || action.type === 'automod' || action.type === 'automute') continue;
      mods[action.moderatorId] ||= { actions: 0, warns: 0, bans: 0, accepts: 0, rejects: 0 };
      mods[action.moderatorId].actions++;
      if (action.type === 'warn') mods[action.moderatorId].warns++;
      if (action.type === 'ban') mods[action.moderatorId].bans++;
      if (action.type === 'accept') mods[action.moderatorId].accepts++;
      if (action.type === 'reject') mods[action.moderatorId].rejects++;
    }

    return Object.entries(mods)
      .map(([id, stats]) => {
        const score = stats.accepts * 3 + stats.warns * 2 + stats.bans * 1 - stats.rejects * 1;
        return { id, ...stats, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  return { settings, handleMessage, handleJoin, modReputation, getWarnings, DEFAULT_SETTINGS };
}

module.exports = createAutomod;
