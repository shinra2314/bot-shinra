const { ActionRowBuilder, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { COLORS, ICONS, ButtonStyle, button, errorPanel, panel, reply, select } = require('../ui/components');
const { displayName, formatCoins, mentionUser, truncate } = require('../utils/format');
const achievements = require('../services/achievements');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function percent(wins, games) {
  if (!games) return '0%';
  return `${Math.round((wins / games) * 100)}%`;
}

const EVENT_TYPES = [
  { name: 'Мафия', value: 'mafia' },
  { name: 'Квиз', value: 'quiz' },
  { name: 'Дуэли', value: 'duels' },
  { name: 'Голосовой актив', value: 'voice' },
  { name: 'Розыгрыш', value: 'giveaway' },
  { name: 'Турнир', value: 'tournament' },
  { name: 'Клановая битва', value: 'clan_battle' }
];

function canManageEvents(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

// ---- Извлечённая логика (общая для slash и кнопок панелей) ----

function eventStatsPanel(target, profile) {
  return panel({
    title: `Ивенты — ${displayName(target)}`,
    icon: ICONS.games,
    eyebrow: 'Ивенты Onix',
    description: mentionUser(target.id),
    color: COLORS.games,
    stats: [
      { icon: ICONS.star, name: 'Очки', value: String(profile.eventPoints || 0) },
      { icon: ICONS.up, name: 'Победы', value: String(profile.eventWins || 0) }
    ],
    statColumns: 2
  });
}

function eventListComponents(context, guildId) {
  const rows = context.store.activeEvents(guildId).slice(0, 10).map((event) =>
    `**${event.name}** (\`${event.id}\`)\nНачало: ${event.startsAtText} • Участников: ${event.participants.length}/${event.maxParticipants}\nНаграда: ${event.rewardText} • ${event.status}`
  );
  return panel({
    title: 'Ивент-центр',
    icon: ICONS.games,
    eyebrow: 'Ивенты Onix',
    description: 'Активные ивенты сервера.',
    color: COLORS.games,
    lines: rows.length ? rows : ['Активных ивентов пока нет.']
  });
}

function eventTopComponents(context, guildId) {
  const rows = context.store.topUsers(guildId, (user) => user.eventPoints || 0, 10)
    .map((user, index) => `**${index + 1}.** ${mentionUser(user.id)} — ${user.eventPoints || 0} очков`);
  return panel({
    title: 'Лидерборд ивентов',
    icon: ICONS.tops,
    eyebrow: 'Ивенты Onix',
    description: 'Топ участников по очкам ивентов.',
    color: COLORS.games,
    lines: rows.length ? rows : ['Пока нет очков ивентов.']
  });
}

async function createEvent(interaction, context, { name, type, startsAtText, rewardText, maxParticipants }) {
  if (!canManageEvents(interaction)) {
    return reply(interaction, errorPanel('Создавать ивенты могут только модераторы с правом Manage Events или Manage Server.'), { ephemeral: true });
  }
  if (!Number.isInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > 100) {
    return reply(interaction, errorPanel('Количество мест должно быть числом от 2 до 100.'), { ephemeral: true });
  }
  const event = context.store.addEvent(interaction.guildId, {
    name,
    type,
    startsAtText,
    rewardText,
    maxParticipants,
    creatorId: interaction.user.id
  });
  await context.store.save();
  return reply(interaction, panel({
    title: `Ивент: ${event.name}`,
    icon: ICONS.games,
    eyebrow: 'Новый ивент',
    color: COLORS.games,
    stats: [
      { icon: ICONS.time, name: 'Начало', value: event.startsAtText },
      { icon: ICONS.profile, name: 'Участников', value: `0/${event.maxParticipants}` },
      { icon: ICONS.gift, name: 'Награда', value: event.rewardText },
      { icon: ICONS.info, name: 'Статус', value: event.status }
    ],
    footer: `ID ивента: ${event.id}`
  }));
}

async function joinEvent(interaction, context, eventId) {
  const event = context.store.guild(interaction.guildId).events.find((item) => item.id === eventId);
  if (!event || event.status !== 'набор открыт') return reply(interaction, errorPanel('Ивент не найден или набор закрыт.'), { ephemeral: true });
  if (event.participants.includes(interaction.user.id)) return reply(interaction, errorPanel('Ты уже участвуешь в этом ивенте.'), { ephemeral: true });
  if (event.participants.length >= event.maxParticipants) return reply(interaction, errorPanel('На ивенте уже нет свободных мест.'), { ephemeral: true });

  event.participants.push(interaction.user.id);
  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  profile.eventPoints = Number(profile.eventPoints || 0) + 50;
  achievements.addNamed(profile, 'Участник ивента');
  context.store.addClanWarScore(interaction.guildId, interaction.user.id, 50, 'event');
  await context.store.save();

  return reply(interaction, panel({
    title: 'Запись на ивент',
    icon: ICONS.success,
    eyebrow: 'Ивенты Onix',
    description: `${mentionUser(interaction.user.id)} записался на **${event.name}**.\nУчастников: **${event.participants.length}/${event.maxParticipants}**.`,
    color: COLORS.success
  }));
}

async function rewardEvent(interaction, context, eventId, coins) {
  if (!canManageEvents(interaction)) {
    return reply(interaction, errorPanel('Выдавать награды могут только модераторы.'), { ephemeral: true });
  }
  const event = context.store.guild(interaction.guildId).events.find((item) => item.id === eventId);
  if (!event) return reply(interaction, errorPanel('Ивент не найден.'), { ephemeral: true });
  if (!Number.isInteger(coins) || coins < 1) return reply(interaction, errorPanel('Монеты должны быть целым числом ≥ 1.'), { ephemeral: true });

  for (const userId of event.participants) {
    // eslint-disable-next-line no-await-in-loop
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (!user) continue;
    const profile = context.store.ensureUser(interaction.guildId, user);
    profile.balance += coins;
    profile.eventWins = Number(profile.eventWins || 0) + 1;
    achievements.addNamed(profile, `Награда за ивент: ${event.name}`);
    context.store.recordTransaction(interaction.guildId, {
      type: 'event',
      toId: userId,
      amount: coins,
      note: `награда за ивент ${event.name}`
    });
  }
  event.status = 'завершён';
  await context.store.save();
  return reply(interaction, panel({
    title: 'Награды выданы',
    icon: ICONS.gift,
    eyebrow: 'Ивенты Onix',
    description: `Ивент **${event.name}** завершён.\nКаждый участник получил **${formatCoins(coins)}**.`,
    color: COLORS.success
  }));
}

function mafiaStatsPanel(target, profile) {
  return panel({
    title: `Мафия — ${displayName(target)}`,
    icon: ICONS.games,
    eyebrow: 'Мафия Onix',
    description: mentionUser(target.id),
    color: COLORS.games,
    stats: [
      { icon: ICONS.casino, name: 'Игры', value: String(profile.mafia.games || 0) },
      { icon: ICONS.up, name: 'Победы', value: `${profile.mafia.wins || 0} (${percent(profile.mafia.wins, profile.mafia.games)})` },
      { icon: ICONS.star, name: 'Рейтинг', value: String(profile.mafia.rating || 1000) },
      { icon: ICONS.fire, name: 'MVP', value: String(profile.mafia.mvp || 0) }
    ],
    statColumns: 2
  });
}

function mafiaTopComponents(context, guildId, sort) {
  const key = sort === 'mvp' ? 'mvp' : 'rating';
  const rows = context.store
    .topUsers(guildId, (user) => user.mafia?.[key] || 0, 10)
    .map((user, index) => `**${index + 1}.** ${mentionUser(user.id)} — ${user.mafia?.[key] || 0}`);
  return panel({
    title: key === 'mvp' ? 'Топ мафии по MVP' : 'Топ мафии по рейтингу',
    icon: ICONS.tops,
    eyebrow: 'Мафия Onix',
    description: rows.length ? 'Лучшие игроки мафии на сервере.' : 'Пока нет игроков в рейтинге.',
    color: COLORS.games,
    lines: rows.length ? rows : ['Нет данных.']
  });
}

function mafiaHistoryPanel(target, profile) {
  const history = profile.mafia.history?.slice(0, 8) || [];
  return panel({
    title: `История мафии — ${displayName(target)}`,
    icon: ICONS.games,
    eyebrow: 'Мафия Onix',
    description: mentionUser(target.id),
    color: COLORS.games,
    lines: history.length
      ? history.map((item, index) => `**${index + 1}.** ${truncate(item, 180)}`)
      : ['История игр пока пустая.']
  });
}

function closeStatsPanel(target, profile) {
  return panel({
    title: `Клозы — ${displayName(target)}`,
    icon: ICONS.games,
    eyebrow: 'Клозы Onix',
    description: mentionUser(target.id),
    color: COLORS.games,
    stats: [
      { icon: ICONS.casino, name: 'Игры', value: String(profile.closes.games || 0) },
      { icon: ICONS.up, name: 'Победы', value: `${profile.closes.wins || 0} (${percent(profile.closes.wins, profile.closes.games)})` },
      { icon: ICONS.star, name: 'Рейтинг', value: String(profile.closes.rating || 0) }
    ],
    statColumns: 2
  });
}

// Статичные панели (публикуются /панель).
function eventHubPanel(imageUrl) {
  return panel({
    imageUrl,
    title: 'Ивенты',
    icon: ICONS.games,
    eyebrow: 'Ивенты Onix',
    description: 'Список ивентов, запись, лидерборд и статистика. Создание и награды — для модераторов.',
    color: COLORS.games,
    actions: [
      button('event:hub:list', '📋 Список', ButtonStyle.Primary),
      button('event:hub:join', '✅ Участвовать', ButtonStyle.Success),
      button('event:hub:stats', '📊 Моя статистика', ButtonStyle.Secondary),
      button('event:hub:top', '🏆 Топ', ButtonStyle.Secondary),
      button('event:hub:create', '➕ Создать', ButtonStyle.Secondary),
      button('event:hub:reward', '🎁 Награда', ButtonStyle.Secondary)
    ]
  });
}

function mafiaHubPanel(imageUrl) {
  return panel({
    imageUrl,
    title: 'Мафия и клозы',
    icon: ICONS.games,
    eyebrow: 'Мафия Onix',
    description: 'Статистика, топ и история игр мафии, а также статистика клозов.',
    color: COLORS.games,
    actions: [
      button('mafia:hub:stats', '📊 Статистика', ButtonStyle.Primary),
      button('mafia:hub:top', '🏆 Топ', ButtonStyle.Secondary),
      button('mafia:hub:history', '📜 История', ButtonStyle.Secondary),
      button('mafia:hub:close', '🎯 Клозы', ButtonStyle.Secondary)
    ]
  });
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('event')
      .setDescription('Команды ивентов')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('статистика')
          .setDescription('Статистика ивентов')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь'))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('создать')
          .setDescription('Создать ивент')
          .addStringOption((option) => option.setName('название').setDescription('Название ивента').setMinLength(2).setMaxLength(64).setRequired(true))
          .addStringOption((option) => option.setName('тип').setDescription('Тип ивента').addChoices(...EVENT_TYPES).setRequired(true))
          .addStringOption((option) => option.setName('начало').setDescription('Когда начинается, например 20:00').setMaxLength(40).setRequired(true))
          .addStringOption((option) => option.setName('награда').setDescription('Награда, например 3000 coins + Mafia Case').setMaxLength(120).setRequired(true))
          .addIntegerOption((option) => option.setName('места').setDescription('Максимум участников').setMinValue(2).setMaxValue(100).setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('участвовать')
          .setDescription('Записаться на ивент')
          .addStringOption((option) => option.setName('ивент').setDescription('ID ивента').setRequired(true))
      )
      .addSubcommand((subcommand) => subcommand.setName('список').setDescription('Показать активные ивенты'))
      .addSubcommand((subcommand) => subcommand.setName('топ').setDescription('Лидерборд ивентов'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('награда')
          .setDescription('Выдать награду участникам ивента')
          .addStringOption((option) => option.setName('ивент').setDescription('ID ивента').setRequired(true))
          .addIntegerOption((option) => option.setName('монеты').setDescription('Монеты каждому участнику').setMinValue(1).setMaxValue(1000000).setRequired(true))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'статистика') {
        const target = interaction.options.getUser('user') || interaction.user;
        const profile = context.store.ensureUser(interaction.guildId, target);
        await context.store.save();
        return reply(interaction, eventStatsPanel(target, profile));
      }
      if (subcommand === 'создать') {
        return createEvent(interaction, context, {
          name: interaction.options.getString('название', true),
          type: interaction.options.getString('тип', true),
          startsAtText: interaction.options.getString('начало', true),
          rewardText: interaction.options.getString('награда', true),
          maxParticipants: interaction.options.getInteger('места', true)
        });
      }
      if (subcommand === 'участвовать') return joinEvent(interaction, context, interaction.options.getString('ивент', true));
      if (subcommand === 'список') return reply(interaction, eventListComponents(context, interaction.guildId));
      if (subcommand === 'топ') return reply(interaction, eventTopComponents(context, interaction.guildId));
      return rewardEvent(interaction, context, interaction.options.getString('ивент', true), interaction.options.getInteger('монеты', true));
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('mafia')
      .setDescription('Команды мафии')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('статистика')
          .setDescription('Статистика игрока мафии')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь'))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('топ')
          .setDescription('Топ игроков мафии')
          .addStringOption((option) =>
            option
              .setName('sort')
              .setDescription('Сортировка')
              .addChoices(
                { name: 'Рейтинг', value: 'rating' },
                { name: 'MVP', value: 'mvp' }
              )
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('история')
          .setDescription('Личная история игр мафии')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь'))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'статистика') {
        const target = interaction.options.getUser('user') || interaction.user;
        const profile = context.store.ensureUser(interaction.guildId, target);
        await context.store.save();
        return reply(interaction, mafiaStatsPanel(target, profile));
      }
      if (subcommand === 'топ') {
        return reply(interaction, mafiaTopComponents(context, interaction.guildId, interaction.options.getString('sort') || 'rating'));
      }
      const target = interaction.options.getUser('user') || interaction.user;
      const profile = context.store.ensureUser(interaction.guildId, target);
      await context.store.save();
      return reply(interaction, mafiaHistoryPanel(target, profile));
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('close')
      .setDescription('Команды клозов')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('статистика')
          .setDescription('Статистика клозов')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь'))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const target = interaction.options.getUser('user') || interaction.user;
      const profile = context.store.ensureUser(interaction.guildId, target);
      await context.store.save();
      return reply(interaction, closeStatsPanel(target, profile));
    }
  }
];

const EVENT_TYPE_OPTIONS = EVENT_TYPES.map((item) => ({ label: item.name, value: item.value }));

function eventCreateModal(type) {
  return new ModalBuilder()
    .setCustomId(`event:hub:create-submit:${type}`)
    .setTitle('Создать ивент')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Название ивента').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(64).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('start').setLabel('Когда начинается (например 20:00)').setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reward').setLabel('Награда').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('slots').setLabel('Мест (2-100)').setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(true))
    );
}

function rewardModal(eventId) {
  return new ModalBuilder()
    .setCustomId(`event:hub:reward-amount:${eventId}`)
    .setTitle('Награда за ивент')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('coins').setLabel('Монет каждому участнику').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(true))
    );
}

async function handleEventHub(interaction, context, sub) {
  if (sub === 'stats') {
    const profile = context.store.ensureUser(interaction.guildId, interaction.user);
    await reply(interaction, eventStatsPanel(interaction.user, profile), { ephemeral: true });
    return true;
  }
  if (sub === 'list') { await reply(interaction, eventListComponents(context, interaction.guildId), { ephemeral: true }); return true; }
  if (sub === 'top') { await reply(interaction, eventTopComponents(context, interaction.guildId), { ephemeral: true }); return true; }
  if (sub === 'join') {
    const events = context.store.activeEvents(interaction.guildId).slice(0, 25);
    if (!events.length) { await reply(interaction, errorPanel('Активных ивентов нет.'), { ephemeral: true }); return true; }
    await reply(interaction, panel({
      title: 'Запись на ивент', icon: ICONS.games, eyebrow: 'Ивенты Onix', description: 'Выбери ивент.', color: COLORS.games,
      actions: [select('event:hub:join-pick', 'Ивент', events.map((e) => ({ label: e.name.slice(0, 100), value: e.id, description: `${e.participants.length}/${e.maxParticipants} • ${e.startsAtText}`.slice(0, 100) })))]
    }), { ephemeral: true });
    return true;
  }
  if (sub === 'join-pick') { await joinEvent(interaction, context, interaction.values[0]); return true; }
  if (sub === 'create') {
    if (!canManageEvents(interaction)) { await reply(interaction, errorPanel('Создавать ивенты могут только модераторы.'), { ephemeral: true }); return true; }
    await reply(interaction, panel({
      title: 'Создать ивент', icon: ICONS.games, eyebrow: 'Ивенты Onix', description: 'Выбери тип ивента.', color: COLORS.games,
      actions: [select('event:hub:create-type', 'Тип ивента', EVENT_TYPE_OPTIONS)]
    }), { ephemeral: true });
    return true;
  }
  if (sub === 'create-type') {
    if (!canManageEvents(interaction)) { await reply(interaction, errorPanel('Недостаточно прав.'), { ephemeral: true }); return true; }
    await interaction.showModal(eventCreateModal(interaction.values[0]));
    return true;
  }
  if (sub === 'create-submit') {
    const type = interaction.customId.split(':')[3];
    await createEvent(interaction, context, {
      name: interaction.fields.getTextInputValue('name'),
      type,
      startsAtText: interaction.fields.getTextInputValue('start'),
      rewardText: interaction.fields.getTextInputValue('reward'),
      maxParticipants: Number.parseInt(interaction.fields.getTextInputValue('slots').trim(), 10)
    });
    return true;
  }
  if (sub === 'reward') {
    if (!canManageEvents(interaction)) { await reply(interaction, errorPanel('Недостаточно прав.'), { ephemeral: true }); return true; }
    const events = context.store.guild(interaction.guildId).events.slice(0, 25);
    if (!events.length) { await reply(interaction, errorPanel('Ивентов нет.'), { ephemeral: true }); return true; }
    await reply(interaction, panel({
      title: 'Награда за ивент', icon: ICONS.gift, eyebrow: 'Ивенты Onix', description: 'Выбери ивент для выдачи награды.', color: COLORS.games,
      actions: [select('event:hub:reward-pick', 'Ивент', events.map((e) => ({ label: e.name.slice(0, 100), value: e.id, description: `${e.participants.length} уч. • ${e.status}`.slice(0, 100) })))]
    }), { ephemeral: true });
    return true;
  }
  if (sub === 'reward-pick') {
    if (!canManageEvents(interaction)) { await reply(interaction, errorPanel('Недостаточно прав.'), { ephemeral: true }); return true; }
    await interaction.showModal(rewardModal(interaction.values[0]));
    return true;
  }
  if (sub === 'reward-amount') {
    const eventId = interaction.customId.split(':')[3];
    await rewardEvent(interaction, context, eventId, Number.parseInt(interaction.fields.getTextInputValue('coins').trim(), 10));
    return true;
  }
  return false;
}

async function handleMafiaHub(interaction, context, sub) {
  if (sub === 'stats') {
    const profile = context.store.ensureUser(interaction.guildId, interaction.user);
    await reply(interaction, mafiaStatsPanel(interaction.user, profile), { ephemeral: true });
    return true;
  }
  if (sub === 'history') {
    const profile = context.store.ensureUser(interaction.guildId, interaction.user);
    await reply(interaction, mafiaHistoryPanel(interaction.user, profile), { ephemeral: true });
    return true;
  }
  if (sub === 'close') {
    const profile = context.store.ensureUser(interaction.guildId, interaction.user);
    await reply(interaction, closeStatsPanel(interaction.user, profile), { ephemeral: true });
    return true;
  }
  if (sub === 'top') {
    await reply(interaction, panel({
      title: 'Топ мафии', icon: ICONS.tops, eyebrow: 'Мафия Onix', description: 'Выбери сортировку.', color: COLORS.games,
      actions: [select('mafia:hub:top-pick', 'Сортировка', [{ label: 'Рейтинг', value: 'rating' }, { label: 'MVP', value: 'mvp' }])]
    }), { ephemeral: true });
    return true;
  }
  if (sub === 'top-pick') {
    await reply(interaction, mafiaTopComponents(context, interaction.guildId, interaction.values[0]), { ephemeral: true });
    return true;
  }
  return false;
}

async function handleComponent(interaction, context) {
  const isModal = interaction.isModalSubmit?.();
  const isStringSel = interaction.isStringSelectMenu?.();
  if (!interaction.isButton() && !isModal && !isStringSel) return false;
  const id = interaction.customId || '';
  if (!id.startsWith('event:hub') && !id.startsWith('mafia:hub')) return false;

  const guildError = requireGuild(interaction);
  if (guildError) {
    await reply(interaction, errorPanel(guildError), { ephemeral: true });
    return true;
  }

  const sub = id.split(':')[2];
  if (id.startsWith('event:hub')) return handleEventHub(interaction, context, sub);
  return handleMafiaHub(interaction, context, sub);
}

module.exports = {
  commands,
  handleComponent,
  eventHubPanel,
  mafiaHubPanel
};
