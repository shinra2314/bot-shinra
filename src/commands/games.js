const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { COLORS, ICONS, errorPanel, panel, reply } = require('../ui/components');
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

        return reply(
          interaction,
          panel({
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
          })
        );
      }

      if (subcommand === 'создать') {
        if (!canManageEvents(interaction)) {
          return reply(interaction, errorPanel('Создавать ивенты могут только модераторы с правом Manage Events или Manage Server.'), { ephemeral: true });
        }

        const event = context.store.addEvent(interaction.guildId, {
          name: interaction.options.getString('название', true),
          type: interaction.options.getString('тип', true),
          startsAtText: interaction.options.getString('начало', true),
          rewardText: interaction.options.getString('награда', true),
          maxParticipants: interaction.options.getInteger('места', true),
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

      if (subcommand === 'участвовать') {
        const event = context.store.guild(interaction.guildId).events.find((item) => item.id === interaction.options.getString('ивент', true));
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

      if (subcommand === 'список') {
        const rows = context.store.activeEvents(interaction.guildId).slice(0, 10).map((event) =>
          `**${event.name}** (\`${event.id}\`)\nНачало: ${event.startsAtText} • Участников: ${event.participants.length}/${event.maxParticipants}\nНаграда: ${event.rewardText} • ${event.status}`
        );
        return reply(interaction, panel({
          title: 'Ивент-центр',
          icon: ICONS.games,
          eyebrow: 'Ивенты Onix',
          description: 'Активные ивенты сервера.',
          color: COLORS.games,
          lines: rows.length ? rows : ['Активных ивентов пока нет.']
        }));
      }

      if (subcommand === 'топ') {
        const rows = context.store.topUsers(interaction.guildId, (user) => user.eventPoints || 0, 10)
          .map((user, index) => `**${index + 1}.** ${mentionUser(user.id)} — ${user.eventPoints || 0} очков`);
        return reply(interaction, panel({
          title: 'Лидерборд ивентов',
          icon: ICONS.tops,
          eyebrow: 'Ивенты Onix',
          description: 'Топ участников по очкам ивентов.',
          color: COLORS.games,
          lines: rows.length ? rows : ['Пока нет очков ивентов.']
        }));
      }

      if (!canManageEvents(interaction)) {
        return reply(interaction, errorPanel('Выдавать награды могут только модераторы.'), { ephemeral: true });
      }

      const event = context.store.guild(interaction.guildId).events.find((item) => item.id === interaction.options.getString('ивент', true));
      if (!event) return reply(interaction, errorPanel('Ивент не найден.'), { ephemeral: true });
      const coins = interaction.options.getInteger('монеты', true);
      for (const userId of event.participants) {
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

      return reply(
        interaction,
        panel({
          title: 'Награды выданы',
          icon: ICONS.gift,
          eyebrow: 'Ивенты Onix',
          description: `Ивент **${event.name}** завершён.\nКаждый участник получил **${formatCoins(coins)}**.`,
          color: COLORS.success,
        })
      );
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

        return reply(
          interaction,
          panel({
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
          })
        );
      }

      if (subcommand === 'топ') {
        const sort = interaction.options.getString('sort') || 'rating';
        const rows = context.store
          .topUsers(interaction.guildId, (user) => user.mafia?.[sort] || 0, 10)
          .map((user, index) => `**${index + 1}.** ${mentionUser(user.id)} — ${user.mafia?.[sort] || 0}`);

        return reply(
          interaction,
          panel({
            title: sort === 'mvp' ? 'Топ мафии по MVP' : 'Топ мафии по рейтингу',
            icon: ICONS.tops,
            eyebrow: 'Мафия Onix',
            description: rows.length ? 'Лучшие игроки мафии на сервере.' : 'Пока нет игроков в рейтинге.',
            color: COLORS.games,
            lines: rows.length ? rows : ['Нет данных.']
          })
        );
      }

      const target = interaction.options.getUser('user') || interaction.user;
      const profile = context.store.ensureUser(interaction.guildId, target);
      const history = profile.mafia.history?.slice(0, 8) || [];
      await context.store.save();

      return reply(
        interaction,
        panel({
          title: `История мафии — ${displayName(target)}`,
          icon: ICONS.games,
          eyebrow: 'Мафия Onix',
          description: mentionUser(target.id),
          color: COLORS.games,
          lines: history.length
            ? history.map((item, index) => `**${index + 1}.** ${truncate(item, 180)}`)
            : ['История игр пока пустая.']
        })
      );
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

      return reply(
        interaction,
        panel({
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
        })
      );
    }
  }
];

module.exports = {
  commands
};
