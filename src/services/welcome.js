const { panel, COLORS, componentPayload } = require('../ui/components');
const { mentionUser } = require('../utils/format');

const DEFAULT_SETTINGS = {
  enabled: false,
  welcomeChannelId: null,
  farewellChannelId: null,
  welcomeMessage: 'Добро пожаловать на сервер, {user}! 🎉\nТы стал **{count}-м** участником.',
  farewellMessage: '**{username}** покинул нас. Нас осталось **{count}**.',
  autoRoles: [],
  guideChannelId: null,
  guideMessage: null
};

function createWelcome(context) {
  function settings(guildId) {
    const guild = context.store.guild(guildId);
    guild.welcomeSettings ||= { ...DEFAULT_SETTINGS };
    return guild.welcomeSettings;
  }

  function formatMessage(template, member) {
    return template
      .replace(/{user}/g, mentionUser(member.id))
      .replace(/{username}/g, member.user.globalName || member.user.username)
      .replace(/{tag}/g, member.user.username)
      .replace(/{server}/g, member.guild.name)
      .replace(/{count}/g, String(member.guild.memberCount));
  }

  async function handleJoin(member) {
    const cfg = settings(member.guild.id);
    if (!cfg.enabled) return;

    if (cfg.autoRoles.length > 0) {
      for (const roleId of cfg.autoRoles) {
        try {
          await member.roles.add(roleId);
        } catch {
          // role doesn't exist or no perms
        }
      }
    }

    if (cfg.welcomeChannelId) {
      try {
        const channel = await member.guild.channels.fetch(cfg.welcomeChannelId).catch(() => null);
        if (channel?.isTextBased()) {
          const message = formatMessage(cfg.welcomeMessage, member);
          const welcomePanel = panel({
            title: '👋 Добро пожаловать!',
            description: message,
            color: COLORS.success,
            thumbnail: member.user.displayAvatarURL({ size: 256 })
          });
          await channel.send(componentPayload(welcomePanel));
        }
      } catch {
        // no access
      }
    }

    if (cfg.guideChannelId && cfg.guideMessage) {
      try {
        const dm = await member.createDM().catch(() => null);
        if (dm) {
          const guide = formatMessage(cfg.guideMessage, member);
          const guidePanel = panel({
            title: `📖 Гайд по серверу ${member.guild.name}`,
            description: guide,
            color: COLORS.info,
            footer: `Канал-гайд: #${cfg.guideChannelId}`
          });
          await dm.send(componentPayload(guidePanel)).catch(() => null);
        }
      } catch {
        // DMs closed
      }
    }
  }

  async function handleLeave(member) {
    const cfg = settings(member.guild.id);
    if (!cfg.enabled || !cfg.farewellChannelId) return;

    try {
      const channel = await member.guild.channels.fetch(cfg.farewellChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        const message = formatMessage(cfg.farewellMessage, member);
        const farewellPanel = panel({
          title: '👋 До свидания!',
          description: message,
          color: COLORS.danger
        });
        await channel.send(componentPayload(farewellPanel));
      }
    } catch {
      // no access
    }
  }

  return { settings, handleJoin, handleLeave, DEFAULT_SETTINGS };
}

module.exports = createWelcome;
