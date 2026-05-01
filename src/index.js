const { Client, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { commandMap, handleComponent } = require('./commands');
const JsonStore = require('./services/jsonStore');
const createTempRooms = require('./services/tempRooms');
const createVoiceTracker = require('./services/voiceTracker');
const createAutomod = require('./services/automod');
const createLogger = require('./services/logger');
const createWelcome = require('./services/welcome');
const { errorPanel, panel, reply, COLORS, componentPayload } = require('./ui/components');
const { levelFromXp, mentionUser } = require('./utils/format');
const { checkAchievements } = require('./services/achievements');
const { checkAutoTitles } = require('./commands/titles');

function validateConfig(config) {
  const warnings = [];
  if (!config.clientId) warnings.push('DISCORD_CLIENT_ID is missing: deploy will fail.');
  if (!config.guildId) warnings.push('DISCORD_GUILD_ID is empty: commands will be global.');
  if (!config.reportChannelId) warnings.push('REPORT_CHANNEL_ID is empty: reports are stored locally only.');
  if (!config.tempRoomTriggerChannelId) warnings.push('TEMP_ROOM_TRIGGER_CHANNEL_ID is empty: temp rooms are disabled.');
  return warnings;
}

function checkCooldown(state, interaction, cooldownMs = 3000) {
  const key = `${interaction.user.id}:${interaction.commandName}`;
  const now = Date.now();
  const until = state.cooldowns.get(key) || 0;
  if (until > now) return Math.ceil((until - now) / 1000);
  state.cooldowns.set(key, now + cooldownMs);
  return 0;
}

async function main() {
  if (!config.token) {
    throw new Error('DISCORD_TOKEN is missing in .env');
  }

  const store = new JsonStore(config.databasePath, config);
  await store.load();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions
    ]
  });

  const state = {
    cooldowns: new Map(),
    duels: new Map(),
    music: new Map()
  };
  const voiceTracker = createVoiceTracker(store);
  const context = {
    client,
    config,
    state,
    store,
    voiceTracker
  };
  const tempRooms = createTempRooms(context);
  context.tempRooms = tempRooms;
  const automod = createAutomod(context);
  context.automod = automod;
  const logger = createLogger(context);
  context.logger = logger;
  const welcome = createWelcome(context);
  context.welcome = welcome;

  client.once(Events.ClientReady, async (readyClient) => {
    for (const warning of validateConfig(config)) console.warn(warning);
    voiceTracker.hydrate(readyClient);
    await store.save();
    console.log(`Logged in as ${readyClient.user.tag}.`);
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    voiceTracker.handleVoiceStateUpdate(oldState, newState).catch((error) => {
      console.error('Voice tracker error:', error);
    });
    tempRooms.handleVoiceStateUpdate(oldState, newState).catch((error) => {
      console.error('Temp room error:', error);
    });
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const isRaid = automod.handleJoin(member);
      if (isRaid) {
        await logger.logAutomod(member.guild.id, member.id, { violation: 'возможный рейд', muted: false, warningCount: 0 });
      }
      await welcome.handleJoin(member);
      await logger.logJoin(member);
    } catch (error) {
      console.error('GuildMemberAdd error:', error);
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      await welcome.handleLeave(member);
      await logger.logLeave(member);
    } catch (error) {
      console.error('GuildMemberRemove error:', error);
    }
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      await logger.logNickChange(oldMember, newMember);
    } catch (error) {
      console.error('GuildMemberUpdate error:', error);
    }
  });

  client.on(Events.MessageDelete, async (message) => {
    try {
      await logger.logDeletedMessage(message);
    } catch (error) {
      console.error('MessageDelete error:', error);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.guildId || message.author.bot) return;

    const automodResult = await automod.handleMessage(message).catch((error) => {
      console.error('Automod error:', error);
      return null;
    });
    if (automodResult) {
      await logger.logAutomod(message.guildId, message.author.id, automodResult);
      if (automodResult.muted) return;
    }

    const profile = store.ensureUser(message.guildId, message.author);
    const war = store.addClanWarScore(message.guildId, message.author.id, 1, 'message');

    profile.messageCount = (profile.messageCount || 0) + 1;
    if (profile.messageCount % 5 === 0) {
      const prevLevel = levelFromXp(profile.xp).level;
      profile.xp += 3;
      const newLevel = levelFromXp(profile.xp).level;

      if (newLevel > prevLevel) {
        const levelUpMsg = panel({
          title: '🎉 Новый уровень!',
          description: `${mentionUser(message.author.id)} достиг **${newLevel} уровня**!`,
          color: COLORS.success
        });
        message.channel.send(componentPayload(levelUpMsg)).catch(() => null);
      }
    }

    const newAchievements = checkAchievements(profile);
    if (newAchievements.length > 0) {
      const achievementMsg = panel({
        title: '🏆 Новая ачивка!',
        description: `${mentionUser(message.author.id)} получил: **${newAchievements.join(', ')}**`,
        color: COLORS.warning
      });
      message.channel.send(componentPayload(achievementMsg)).catch(() => null);
    }

    const newTitles = checkAutoTitles(profile);
    if (newTitles.length > 0) {
      const titleMsg = panel({
        title: '🏷️ Новый титул!',
        description: `${mentionUser(message.author.id)} разблокировал: **${newTitles.map((t) => t.name).join(', ')}**`,
        color: COLORS.primary
      });
      message.channel.send(componentPayload(titleMsg)).catch(() => null);
    }

    if (war || profile.messageCount % 5 === 0 || newAchievements.length > 0 || newTitles.length > 0) {
      await store.save().catch((error) => console.error('Message processing save error:', error));
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commandMap.get(interaction.commandName);
        if (!command) {
          return reply(interaction, errorPanel('Команда не найдена.'), { ephemeral: true });
        }

        const remaining = checkCooldown(state, interaction, command.cooldownMs);
        if (remaining > 0) {
          return reply(interaction, errorPanel(`Подожди ещё ${remaining} сек. перед повторным использованием команды.`), { ephemeral: true });
        }

        const result = await command.execute(interaction, context);

        if (interaction.guildId) {
          const profile = store.getUser(interaction.guildId, interaction.user.id);
          if (profile) {
            const earned = checkAchievements(profile);
            if (earned.length > 0) {
              await store.save().catch(() => null);
              const ch = interaction.channel;
              if (ch?.isTextBased()) {
                ch.send(componentPayload(panel({
                  title: '🏆 Новая ачивка!',
                  description: `${mentionUser(interaction.user.id)} получил: **${earned.join(', ')}**`,
                  color: COLORS.warning
                }))).catch(() => null);
              }
            }
          }
        }

        return result;
      }

      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const handled = await handleComponent(interaction, context);
        if (!handled) {
          return reply(interaction, errorPanel('Этот компонент уже не обрабатывается.'), { ephemeral: true });
        }
      }
    } catch (error) {
      console.error('Interaction error:', error);
      if (interaction.isRepliable()) {
        await reply(interaction, errorPanel('Произошла ошибка при выполнении команды.'), { ephemeral: true }).catch(() => null);
      }
    }
  });

  async function shutdown(signal) {
    console.log(`Received ${signal}, saving data...`);
    await voiceTracker.stopAll().catch((error) => console.error('Voice shutdown error:', error));
    await store.save().catch((error) => console.error('Store save error:', error));
    client.destroy();
    process.exit(0);
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await client.login(config.token);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
