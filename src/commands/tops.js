const { SlashCommandBuilder } = require('discord.js');
const { COLORS, errorPanel, panel, reply } = require('../ui/components');
const { formatCoins, formatMinutes, levelFromXp, mentionUser } = require('../utils/format');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function userRows(users, valueFormatter) {
  if (!users.length) return ['Нет данных для топа.'];
  return users.map((user, index) => `**${index + 1}.** ${mentionUser(user.id)} — ${valueFormatter(user)}`);
}

function clanRows(clans, valueFormatter) {
  if (!clans.length) return ['Кланы пока не заведены в базе.'];
  return clans.map((clan, index) => `**${index + 1}.** ${clan.name} — ${valueFormatter(clan)}`);
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('top')
      .setDescription('Различные топы сервера')
      .addSubcommand((subcommand) => subcommand.setName('баланс').setDescription('Топ по балансу'))
      .addSubcommand((subcommand) => subcommand.setName('онлайн').setDescription('Топ по голосовому онлайну'))
      .addSubcommand((subcommand) => subcommand.setName('комнаты').setDescription('Топ по личным комнатам'))
      .addSubcommand((subcommand) => subcommand.setName('любовь').setDescription('Топ по любовным комнатам'))
      .addSubcommand((subcommand) => subcommand.setName('уровень').setDescription('Топ по уровням'))
      .addSubcommand((subcommand) => subcommand.setName('рейтинг').setDescription('Топ кланов по очкам'))
      .addSubcommand((subcommand) => subcommand.setName('участники').setDescription('Топ кланов по участникам')),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      const configs = {
        баланс: {
          title: 'Топ по балансу',
          color: COLORS.economy,
          rows: () => userRows(context.store.topUsers(guildId, (user) => user.balance || 0), (user) => formatCoins(user.balance))
        },
        онлайн: {
          title: 'Топ по голосовому онлайну',
          color: COLORS.info,
          rows: () => userRows(context.store.topUsers(guildId, (user) => user.voiceMinutes || 0), (user) => formatMinutes(user.voiceMinutes))
        },
        комнаты: {
          title: 'Топ по личным комнатам',
          color: COLORS.primary,
          rows: () => userRows(context.store.topUsers(guildId, (user) => user.roomMinutes || 0), (user) => formatMinutes(user.roomMinutes))
        },
        любовь: {
          title: 'Топ по любовным комнатам',
          color: COLORS.games,
          rows: () => userRows(context.store.topUsers(guildId, (user) => user.loveMinutes || 0), (user) => formatMinutes(user.loveMinutes))
        },
        уровень: {
          title: 'Топ по уровням',
          color: COLORS.success,
          rows: () => userRows(context.store.topUsers(guildId, (user) => user.xp || 0), (user) => `ур. ${levelFromXp(user.xp).level} (${user.xp || 0} XP)`)
        },
        рейтинг: {
          title: 'Топ кланов по очкам',
          color: COLORS.clans,
          rows: () => clanRows(
            context.store.clans(guildId).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 10),
            (clan) => `${clan.rating || 0} оч.`
          )
        },
        участники: {
          title: 'Топ кланов по участникам',
          color: COLORS.clans,
          rows: () => clanRows(
            context.store.clans(guildId).sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0)).slice(0, 10),
            (clan) => `${clan.members?.length || 0} участ.`
          )
        }
      };

      const config = configs[subcommand];
      return reply(
        interaction,
        panel({
          title: config.title,
          description: 'Первые 10 мест.',
          color: config.color,
          lines: config.rows()
        })
      );
    }
  }
];

module.exports = {
  commands
};
