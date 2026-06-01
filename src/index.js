const { Client, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { commandMap, handleComponent } = require('./commands');
const Store = require('./services/store');
const { createCache } = require('./services/cache');
const createTempRooms = require('./services/tempRooms');
const createVoiceTracker = require('./services/voiceTracker');
const achievements = require('./services/achievements');
const { loadIcons } = require('./services/cardRenderer');
const { buildAchievementCard } = require('./services/profileCard');
const { COLORS, ICONS, componentPayload, errorPanel, mediaPanel, reply } = require('./ui/components');

// Отправить в канал карточку-уведомление о новом достижении (best-effort).
async function announceAchievement(channel, user, entry) {
  if (!channel || typeof channel.send !== 'function') return;
  const card = await buildAchievementCard({ name: entry.name });
  const panel = mediaPanel({
    title: 'Новое достижение!',
    icon: ICONS.trophy || '🏆',
    eyebrow: 'Достижения Onix',
    description: `${user} разблокировал **${entry.name}**.`,
    color: COLORS.warning,
    imageUrl: card?.imageUrl
  });
  await channel.send(componentPayload(panel, { files: card?.files, allowedMentions: { users: [user.id] } }));
}

function validateConfig(config) {
  const warnings = [];
  if (!config.clientId) warnings.push('DISCORD_CLIENT_ID is missing: deploy will fail.');
  if (config.guildIds.length === 0) warnings.push('No guild ids configured: deploy will register global commands.');
  if (!config.reportChannelId) warnings.push('REPORT_CHANNEL_ID/ADMIN_CHANNEL_ID is empty: reports are stored locally only.');
  return warnings;
}

async function checkCooldown(cache, interaction, cooldownMs = 3000) {
  const key = `cd:${interaction.user.id}:${interaction.commandName}`;
  const remaining = await cache.checkCooldown(key, cooldownMs);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

async function main() {
  if (!config.token) {
    throw new Error('DISCORD_TOKEN is missing in .env');
  }

  const store = new Store(config.databasePath, config);
  await store.load();

  const cache = createCache(config.redisUrl);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildPresences
    ]
  });

  // Сообщения летят часто — копим изменения в памяти и флашим по таймеру,
  // а не делаем store.save() на каждое сообщение (он пишет все гильдии).
  let dirty = false;

  const state = {
    duels: new Map(),
    music: new Map()
  };
  const voiceTracker = createVoiceTracker(store);
  const context = {
    client,
    config,
    state,
    store,
    cache,
    voiceTracker
  };
  const tempRooms = createTempRooms(context);
  context.tempRooms = tempRooms;

  client.once(Events.ClientReady, async (readyClient) => {
    for (const warning of validateConfig(config)) console.warn(warning);
    voiceTracker.hydrate(readyClient);
    await loadIcons().catch((error) => console.error('Icon preload error:', error));
    await store.save();
    setInterval(() => {
      if (!dirty) return;
      dirty = false;
      store.save().catch((error) => console.error('Periodic save error:', error));
    }, 30000);
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

  client.on(Events.MessageCreate, (message) => {
    if (!message.guildId || message.author.bot) return;
    const profile = store.addMessage(message.guildId, message.author);
    if (profile) {
      const unlocked = achievements.grant(profile);
      // Уведомляем о каждом новом достижении карточкой в канал (best-effort).
      for (const entry of unlocked) {
        announceAchievement(message.channel, message.author, entry).catch((error) => {
          console.error('Achievement announce error:', error);
        });
      }
    }
    store.addClanWarScore(message.guildId, message.author.id, 1, 'message');
    dirty = true;
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commandMap.get(interaction.commandName);
        if (!command) {
          return reply(interaction, errorPanel('Команда не найдена.'), { ephemeral: true });
        }

        const globalWait = await cache.checkGlobalRate(
          `rate:${interaction.user.id}`,
          config.globalRateLimit,
          config.globalRateWindowMs
        );
        if (globalWait > 0) {
          return reply(interaction, errorPanel(`Слишком много команд за секунду. Подожди ${Math.ceil(globalWait / 1000)} сек.`), { ephemeral: true });
        }

        const remaining = await checkCooldown(cache, interaction, command.cooldownMs);
        if (remaining > 0) {
          return reply(interaction, errorPanel(`Подожди ещё ${remaining} сек. перед повторным использованием команды.`), { ephemeral: true });
        }

        return command.execute(interaction, context);
      }

      const isRoleSelect = typeof interaction.isRoleSelectMenu === 'function' && interaction.isRoleSelectMenu();
      const isModal = typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit();
      if (interaction.isButton() || interaction.isStringSelectMenu() || isRoleSelect || isModal) {
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
    store.close();
    await cache.close().catch((error) => console.error('Cache close error:', error));
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
