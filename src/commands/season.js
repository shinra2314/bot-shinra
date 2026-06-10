const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  componentPayload,
  errorPanel,
  mediaPanel,
  panel,
  reply,
  successPanel
} = require('../ui/components');
const { mentionUser, formatDuration } = require('../utils/format');
const { buildLeaderboardCard } = require('../services/profileCard');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function canAdmin(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

// Лидерборд сезона картой (если canvas доступен), иначе текстом.
async function seasonBoardReply(interaction, context, ephemeral = false) {
  const { store, client } = context;
  const season = store.getSeason(interaction.guildId);
  if (!season || season.ended) {
    return reply(interaction, panel({
      title: 'Сезон',
      icon: '🏆',
      eyebrow: 'Сезоны Onix',
      description: 'Сейчас нет активного сезона. Админ запускает его командой `/сезон старт`.',
      color: COLORS.neutral
    }), { ephemeral });
  }

  const standings = store.seasonStandings(interaction.guildId, 10);
  const remaining = season.endsAt ? `Завершение: <t:${Math.floor(season.endsAt / 1000)}:R>` : 'Без срока';

  const rows = standings.map((entry, index) => {
    const user = client.users.cache.get(entry.id);
    return {
      rank: index + 1,
      name: entry.username || (user ? user.username : entry.id),
      value: `${entry.seasonXp} XP`,
      avatarUrl: user ? user.displayAvatarURL({ extension: 'png', size: 128 }) : null,
      highlight: entry.id === interaction.user.id
    };
  });

  const card = rows.length
    ? await buildLeaderboardCard({ title: season.name, subtitle: 'Таблица сезона', rows, accent: '#facc15' }).catch(() => null)
    : null;

  const lines = rows.length
    ? rows.map((row) => `**${row.rank}.** ${mentionUser(standings[row.rank - 1].id)} — ${row.value}`)
    : ['Пока никто не набрал сезонный опыт. Будь первым! 💬🔊'];

  return reply(
    interaction,
    mediaPanel({
      title: `🏆 ${season.name}`,
      icon: '🏆',
      eyebrow: 'Сезоны Onix',
      description: `Сезонный опыт за активность (чат + голосовой). ${remaining}`,
      imageUrl: card?.imageUrl,
      color: COLORS.warning,
      lines
    }),
    { files: card?.files, ephemeral }
  );
}

// Завершить сезон: объявить итоги, выдать роль-награду #1 (если настроена).
async function finishSeason(client, store, config, guildId, { announce = true } = {}) {
  const { season, standings } = store.endSeason(guildId);
  if (!season) return null;

  if (config.seasonWinnerRoleId && standings[0]) {
    const guild = client.guilds.cache.get(guildId);
    const member = guild ? await guild.members.fetch(standings[0].id).catch(() => null) : null;
    if (member) await member.roles.add(config.seasonWinnerRoleId).catch(() => null);
  }

  if (announce) {
    const channelId = config.seasonChannelId || config.adminChannelId;
    const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
    if (channel?.isTextBased?.()) {
      const top = standings.slice(0, 3)
        .map((entry, index) => `${['🥇', '🥈', '🥉'][index]} ${mentionUser(entry.id)} — ${entry.seasonXp} XP`)
        .join('\n') || 'никто не участвовал';
      await channel.send(componentPayload(panel({
        title: `🏁 ${season.name} завершён!`,
        icon: '🏆',
        eyebrow: 'Сезоны Onix',
        description: 'Итоги сезона:',
        color: COLORS.success,
        lines: [top],
        footer: config.seasonWinnerRoleId && standings[0] ? 'Победитель получил сезонную роль 🎖️' : undefined
      }), { allowedMentions: { users: standings.slice(0, 3).map((entry) => entry.id) } })).catch(() => null);
    }
  }
  return { season, standings };
}

// Авто-завершение истёкшего сезона (зовётся из интервала index.js).
async function finishDueSeason(client, store, config, guildId) {
  if (!store.isSeasonDue(guildId)) return false;
  await finishSeason(client, store, config, guildId);
  return true;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('сезон')
      .setDescription('Сезонный рейтинг активности')
      .addSubcommand((subcommand) => subcommand.setName('таблица').setDescription('Показать таблицу сезона'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('старт')
          .setDescription('Запустить новый сезон (только админ)')
          .addStringOption((option) => option.setName('имя').setDescription('Название сезона').setMaxLength(60))
          .addIntegerOption((option) => option.setName('дни').setDescription('Длительность в днях (0 = без срока)').setMinValue(0).setMaxValue(365))
      )
      .addSubcommand((subcommand) => subcommand.setName('стоп').setDescription('Завершить текущий сезон (только админ)')),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const { store, client, config } = context;
      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'старт') {
        if (!canAdmin(interaction)) return reply(interaction, errorPanel('Нужны права управления сервером.'), { ephemeral: true });
        const current = store.getSeason(guildId);
        if (current && !current.ended) {
          return reply(interaction, errorPanel(`Сезон **${current.name}** уже идёт. Заверши его командой /сезон стоп перед запуском нового.`), { ephemeral: true });
        }
        const name = interaction.options.getString('имя') || undefined;
        const days = interaction.options.getInteger('дни') ?? 30;
        const season = store.startSeason(guildId, name, days);
        await store.save();
        return reply(interaction, successPanel(`Сезон **${season.name}** запущен!${season.endsAt ? ` Завершение <t:${Math.floor(season.endsAt / 1000)}:R>.` : ''}`, 'Сезоны'), { ephemeral: false });
      }

      if (subcommand === 'стоп') {
        if (!canAdmin(interaction)) return reply(interaction, errorPanel('Нужны права управления сервером.'), { ephemeral: true });
        const current = store.getSeason(guildId);
        if (!current || current.ended) return reply(interaction, errorPanel('Сейчас нет активного сезона.'), { ephemeral: true });
        await finishSeason(client, store, config, guildId);
        await store.save();
        return reply(interaction, successPanel('Сезон завершён. Итоги опубликованы.', 'Сезоны'), { ephemeral: true });
      }

      return seasonBoardReply(interaction, context, false);
    }
  }
];

module.exports = {
  commands,
  finishDueSeason
};
