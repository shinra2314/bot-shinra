const { Client, Events, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const { commandMap, handleComponent } = require('./commands');
const Store = require('./services/store');
const { createCache } = require('./services/cache');
const createTempRooms = require('./services/tempRooms');
const createVoiceTracker = require('./services/voiceTracker');
const eventLogger = require('./services/eventLogger');
const automod = require('./services/automod');
const achievements = require('./services/achievements');
const progression = require('./services/progression');
const quests = require('./services/quests');
const drops = require('./commands/drops');
const giveaway = require('./commands/giveaway');
const season = require('./commands/season');
const boss = require('./commands/boss');
const notifications = require('./services/notifications');
const { loadIcons } = require('./services/cardRenderer');
const { buildAchievementCard, buildLevelUpCard, buildRoomHubCard } = require('./services/profileCard');
const { createWebServer } = require('./web/server');
const { COLORS, ICONS, componentPayload, errorPanel, mediaPanel, reply } = require('./ui/components');
const { roomHubPanel } = require('./ui/roomHubPanel');
const { ticketPanel } = require('./ui/ticketPanel');

// Резолвит текстовый канал по id (через кэш/fetch). Возвращает fallback, если
// канал недоступен (нет прав / удалён / id не задан).
async function resolveTextChannel(client, channelId, fallback = null) {
  if (!channelId) return fallback;
  const cached = client.channels.cache.get(channelId);
  if (cached?.isTextBased?.()) return cached;
  const fetched = await client.channels.fetch(channelId).catch(() => null);
  return fetched?.isTextBased?.() ? fetched : fallback;
}

// Собирает человекочитаемую строку вызова слэш-команды: /команда подкоманда опт:знач …
function describeCommand(interaction) {
  const parts = [`/${interaction.commandName}`];
  let options = interaction.options?.data || [];
  // Разворачиваем группу/подкоманду.
  while (options.length === 1 && (options[0].type === 1 || options[0].type === 2)) {
    parts.push(options[0].name);
    options = options[0].options || [];
  }
  for (const opt of options) {
    parts.push(`${opt.name}:${opt.value}`);
  }
  return parts.join(' ');
}

// Логирует использование слэш-команды карточкой в канал config.commandLogChannelId (best-effort).
async function logCommandUsage(client, interaction) {
  const channel = await resolveTextChannel(client, config.commandLogChannelId);
  if (!channel) return;
  const where = interaction.channelId ? `<#${interaction.channelId}>` : '—';
  const panel = mediaPanel({
    title: 'Команда выполнена',
    icon: ICONS.info,
    eyebrow: 'Логи команд',
    description: `${interaction.user} использовал команду.`,
    color: COLORS.primary,
    stats: [
      { icon: ICONS.info, name: 'Команда', value: `\`${describeCommand(interaction)}\`` },
      { icon: ICONS.profile, name: 'Пользователь', value: `${interaction.user.tag} (${interaction.user.id})` },
      { icon: ICONS.voice, name: 'Канал', value: where }
    ],
    statColumns: 1
  });
  await channel.send(componentPayload(panel, { allowedMentions: { parse: [] } }));
}

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

// Обработать level-up: привести level-роли участника к новому уровню и отправить
// панель-уведомление (в config.levelUpChannelId либо в канал сообщения). Best-effort.
async function announceLevelUp(message, info, context) {
  const { client, config, store } = context;
  const member = message.member
    || await message.guild?.members.fetch(message.author.id).catch(() => null);
  let addedRoleId = null;
  if (member) {
    const added = await progression.syncLevelRoles(member, info.newLevel, config.levelRoles);
    addedRoleId = added[0] || null;
  }
  const channel = await resolveTextChannel(client, config.levelUpChannelId, message.channel);
  if (!channel?.send) return;
  const profile = store.getUser(message.guildId, message.author.id);
  const card = profile
    ? await buildLevelUpCard({ user: message.author, profile, oldLevel: info.oldLevel, newLevel: info.newLevel }).catch(() => null)
    : null;
  const panel = progression.levelUpPanel(message.author, info, addedRoleId, card?.imageUrl);
  await channel.send(componentPayload(panel, { files: card?.files, allowedMentions: { users: [message.author.id] } }));
}

// Чистим «мёртвые» записи комнат: если голосовой канал удалён вручную, запись в
// БД остаётся навсегда. На старте проходим по кэшу каналов и сносим осиротевшее.
function cleanupDeadRooms(client, store) {
  for (const guild of client.guilds.cache.values()) {
    const rooms = store.guild(guild.id).tempRooms;
    for (const channelId of Object.keys(rooms)) {
      if (!guild.channels.cache.has(channelId)) delete rooms[channelId];
    }
  }
}

// Постит (или обновляет) статичную панель управления комнатами в канал-хаб.
// Хранит id сообщения в store, чтобы при рестарте редактировать, а не плодить копии.
async function syncRoomPanel(client, store, config) {
  const channelId = config.roomPanelChannelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  const guildId = channel.guildId || channel.guild?.id;
  if (!guildId) return;

  const card = await buildRoomHubCard().catch(() => null);
  const payload = componentPayload(roomHubPanel(card?.imageUrl), { files: card?.files });
  const existingId = store.getRoomPanelMessage(guildId);
  if (existingId) {
    const message = await channel.messages.fetch(existingId).catch(() => null);
    if (message) {
      await message.edit(payload).catch(() => null);
      return;
    }
  }
  const sent = await channel.send(payload).catch(() => null);
  if (sent) {
    store.setRoomPanelMessage(guildId, sent.id);
    await store.save();
  }
}

// Постит (или обновляет) статичную панель тикетов в канал. Хранит id сообщения,
// чтобы при рестарте редактировать, а не плодить копии (как syncRoomPanel).
async function syncTicketPanel(client, store, config) {
  const channelId = config.ticketPanelChannelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  const guildId = channel.guildId || channel.guild?.id;
  if (!guildId) return;

  const payload = componentPayload(ticketPanel());
  const existingId = store.getTicketPanelMessage(guildId);
  if (existingId) {
    const message = await channel.messages.fetch(existingId).catch(() => null);
    if (message) {
      await message.edit(payload).catch(() => null);
      return;
    }
  }
  const sent = await channel.send(payload).catch(() => null);
  if (sent) {
    store.setTicketPanelMessage(guildId, sent.id);
    await store.save();
  }
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
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.MessageContent, // текст сообщений для автомода + логов правок/удалений
      GatewayIntentBits.GuildMembers,   // вход/выход/кик/смена ника и ролей
      GatewayIntentBits.GuildModeration // бан/разбан (не привилегированный)
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User]
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

  // Логи событий сервера: вешаем слушатели gateway-событий (голос, сообщения,
  // участники, баны и т.д.) и роутим их в каналы из store.getLogConfig.
  context.eventLogger = eventLogger;
  eventLogger.register(client, context);

  // Веб-дашборд (тикеты + отправка от имени бота). Поднимаем сразу, не дожидаясь
  // ClientReady — иначе при долгом/неуспешном логине порт не слушается и сайт не
  // открывается. До готовности клиента API вернёт пустые гильдии — это норм.
  let webServer = null;
  if (config.webEnabled) {
    webServer = createWebServer(context);
    webServer.start();
  }

  client.once(Events.ClientReady, async (readyClient) => {
    for (const warning of validateConfig(config)) console.warn(warning);
    voiceTracker.hydrate(readyClient);
    await loadIcons().catch((error) => console.error('Icon preload error:', error));
    cleanupDeadRooms(readyClient, store);
    await store.save();
    await syncRoomPanel(readyClient, store, config).catch((error) => console.error('Room panel sync error:', error));
    await syncTicketPanel(readyClient, store, config).catch((error) => console.error('Ticket panel sync error:', error));
    // Поллинг Twitch-стримов (если заданы client_id/secret).
    if (notifications.isEnabled(config)) {
      setInterval(() => {
        notifications.poll(context).catch((error) => console.error('Stream poll error:', error));
      }, config.twitch.pollMs).unref?.();
    }
    // Авто-спавн таинственных коробок в заданный канал (если настроен).
    if (config.dropChannelId) {
      setInterval(async () => {
        const channel = await resolveTextChannel(readyClient, config.dropChannelId);
        if (channel) await drops.spawnDrop(channel).catch((error) => console.error('Drop spawn error:', error));
      }, config.dropIntervalMs).unref?.();
    }
    setInterval(() => {
      let changed = dirty;
      dirty = false;
      // Авто-расчёт истёкших аукционов по всем гильдиям (best-effort).
      for (const guild of readyClient.guilds.cache.values()) {
        try {
          if (store.settleExpiredAuctions(guild.id).length) changed = true;
        } catch (error) {
          console.error('Auction settle error:', error);
        }
        // Завершаем истёкшие розыгрыши (async, best-effort; флашится своим save).
        if (store.dueGiveaways(guild.id).length) {
          giveaway.finishDueGiveaways(readyClient, store, guild.id)
            .then((didChange) => { if (didChange) store.save().catch(() => null); })
            .catch((error) => console.error('Giveaway finish error:', error));
        }
        // Авто-завершение истёкшего сезона.
        if (store.isSeasonDue(guild.id)) {
          season.finishDueSeason(readyClient, store, config, guild.id)
            .then((didEnd) => { if (didEnd) store.save().catch(() => null); })
            .catch((error) => console.error('Season finish error:', error));
        }
      }
      if (!changed) return;
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

  client.on(Events.MessageCreate, async (message) => {
    if (!message.guildId || message.author.bot) return;
    // Автомод: при нарушении сообщение удаляется — прерываем дальнейшую обработку.
    if (await automod.checkAndEnforce(message, context)) return;
    const profile = store.addMessage(message.guildId, message.author);
    if (profile) {
      // XP за сообщение (с анти-спам-кулдауном). При level-up — выдаём роль и шлём панель.
      const xpResult = progression.awardMessageXp(profile, config.levelXp);
      if (xpResult?.leveledUp) {
        announceLevelUp(message, xpResult, context).catch((error) => {
          console.error('Level-up announce error:', error);
        });
      }
      if (xpResult?.gained) store.addSeasonXp(message.guildId, message.author.id, xpResult.gained);
      quests.progress(profile, 'message');
      // Сервер-босс: каждое сообщение бьёт босса на 1–3 урона.
      const bossHit = store.damageBoss(message.guildId, message.author.id, 1 + Math.floor(Math.random() * 3));
      if (bossHit?.defeated) {
        boss.announceDefeat(message, context).catch((error) => {
          console.error('Boss defeat announce error:', error);
        });
      }
      const unlocked = achievements.grant(profile);
      // Уведомляем о каждом новом достижении карточкой в выделенный канал достижений
      // (config.achievementChannelId), а не в чат, где набралось условие. Best-effort.
      if (unlocked.length > 0) {
        const target = await resolveTextChannel(client, config.achievementChannelId, message.channel);
        for (const entry of unlocked) {
          announceAchievement(target, message.author, entry).catch((error) => {
            console.error('Achievement announce error:', error);
          });
        }
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

        logCommandUsage(client, interaction).catch((error) => {
          console.error('Command log error:', error);
        });
        return command.execute(interaction, context);
      }

      const isRoleSelect = typeof interaction.isRoleSelectMenu === 'function' && interaction.isRoleSelectMenu();
      const isUserSelect = typeof interaction.isUserSelectMenu === 'function' && interaction.isUserSelectMenu();
      const isModal = typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit();
      if (interaction.isButton() || interaction.isStringSelectMenu() || isRoleSelect || isUserSelect || isModal) {
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
    if (webServer) await webServer.stop().catch((error) => console.error('Web shutdown error:', error));
    await voiceTracker.stopAll().catch((error) => console.error('Voice shutdown error:', error));
    await store.save().catch((error) => console.error('Store save error:', error));
    store.close();
    await cache.close().catch((error) => console.error('Cache close error:', error));
    client.destroy();
    process.exit(0);
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await loginWithRetry(client, config.token);
}

// Логин с экспоненциальным backoff: временный сетевой сбой (ETIMEDOUT,
// ECONNRESET, обрыв канала / DPI-флап) не должен ронять процесс целиком.
async function loginWithRetry(client, token, { attempts = 5, baseMs = 2000, maxMs = 30000 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await client.login(token);
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      const delay = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      console.error(
        `Login failed (attempt ${attempt}/${attempts}): ${error.code || error.message}. Retrying in ${Math.round(delay / 1000)}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
