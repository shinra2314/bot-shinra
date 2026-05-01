const { Client, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { commandMap, handleComponent } = require('./commands');
const JsonStore = require('./services/jsonStore');
const createTempRooms = require('./services/tempRooms');
const createVoiceTracker = require('./services/voiceTracker');
const { errorPanel, reply } = require('./ui/components');

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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages]
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

  client.on(Events.MessageCreate, async (message) => {
    if (!message.guildId || message.author.bot) return;
    store.ensureUser(message.guildId, message.author);
    const war = store.addClanWarScore(message.guildId, message.author.id, 1, 'message');
    if (war) await store.save().catch((error) => console.error('War score save error:', error));
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

        return command.execute(interaction, context);
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
