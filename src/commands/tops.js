const { SlashCommandBuilder } = require('discord.js');
const { COLORS, ICONS, errorPanel, mediaPanel, reply, select, update } = require('../ui/components');

const MEDALS = ['🥇', '🥈', '🥉'];
const { formatCoins, formatMinutes, levelFromXp, mentionUser } = require('../utils/format');
const { wrap } = require('../services/cache');
const { buildLeaderboardCard } = require('../services/profileCard');

function colorToHex(color) {
  return `#${Number(color).toString(16).padStart(6, '0')}`;
}

const TOP_TTL_MS = 60_000;

// Конфиг топов по пользователям и кланам (общий для команды и селектора метрики).
const USER_TOPS = {
  баланс: { selector: (u) => u.balance || 0, format: (u) => formatCoins(u.balance), title: 'Топ по балансу', color: COLORS.economy },
  онлайн: { selector: (u) => u.voiceMinutes || 0, format: (u) => formatMinutes(u.voiceMinutes), title: 'Топ по голосовому онлайну', color: COLORS.info },
  комнаты: { selector: (u) => u.roomMinutes || 0, format: (u) => formatMinutes(u.roomMinutes), title: 'Топ по личным комнатам', color: COLORS.primary },
  любовь: { selector: (u) => u.loveMinutes || 0, format: (u) => formatMinutes(u.loveMinutes), title: 'Топ по любовным комнатам', color: COLORS.games },
  уровень: { selector: (u) => u.xp || 0, format: (u) => `ур. ${levelFromXp(u.xp).level} (${u.xp || 0} XP)`, title: 'Топ по уровням', color: COLORS.success }
};

const CLAN_TOPS = {
  рейтинг: { sort: (a, b) => (b.rating || 0) - (a.rating || 0), format: (c) => `${c.rating || 0} оч.`, title: 'Топ кланов по очкам', color: COLORS.clans },
  участники: { sort: (a, b) => (b.members?.length || 0) - (a.members?.length || 0), format: (c) => `${c.members?.length || 0} участ.`, title: 'Топ кланов по участникам', color: COLORS.clans }
};

// Порядок и подписи пунктов селектора метрики.
const METRIC_MENU = [
  { value: 'баланс', label: 'Баланс', emoji: '💰' },
  { value: 'онлайн', label: 'Голосовой онлайн', emoji: '🔊' },
  { value: 'комнаты', label: 'Личные комнаты', emoji: '🚪' },
  { value: 'любовь', label: 'Любовные комнаты', emoji: '💞' },
  { value: 'уровень', label: 'Уровень', emoji: '⭐' },
  { value: 'рейтинг', label: 'Кланы: рейтинг', emoji: '⚔️' },
  { value: 'участники', label: 'Кланы: участники', emoji: '🛡️' }
];

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function rankPrefix(index) {
  return MEDALS[index] || `**${index + 1}.**`;
}

function userRows(users, valueFormatter) {
  if (!users.length) return ['Нет данных для топа.'];
  return users.map((user, index) => `${rankPrefix(index)} ${mentionUser(user.id)} — \`${valueFormatter(user)}\``);
}

function clanRows(clans, valueFormatter) {
  if (!clans.length) return ['Кланы пока не заведены в базе.'];
  return clans.map((clan, index) => `${rankPrefix(index)} **${clan.name}** — \`${valueFormatter(clan)}\``);
}

function metricSelect(ownerId, current) {
  return select(
    `top:metric:${ownerId}`,
    'Выбрать метрику топа',
    METRIC_MENU.map((item) => ({
      label: item.label,
      value: item.value,
      emoji: item.emoji,
      default: item.value === current
    }))
  );
}

// Единый ответ топа по выбранной метрике. Возвращает { components, files } или null,
// если метрика неизвестна.
async function topResponse(context, interaction, metric) {
  const guildId = interaction.guildId;
  const cache = context.cache;
  let title;
  let color;
  let lines;
  let cardRows = [];

  if (USER_TOPS[metric]) {
    const cfg = USER_TOPS[metric];
    const users = await wrap(cache, `top:users:${guildId}:${metric}`, TOP_TTL_MS, async () =>
      context.store.topUsers(guildId, cfg.selector)
    );
    title = cfg.title;
    color = cfg.color;
    lines = userRows(users, cfg.format);
    cardRows = users.map((user, index) => ({
      rank: index + 1,
      name: user.username || 'Участник',
      value: cfg.format(user),
      avatarUrl: context.client.users.cache.get(user.id)?.displayAvatarURL({ extension: 'png', size: 64 }),
      highlight: user.id === interaction.user.id
    }));
  } else if (CLAN_TOPS[metric]) {
    const cfg = CLAN_TOPS[metric];
    const clans = await wrap(cache, `top:clans:${guildId}:${metric}`, TOP_TTL_MS, async () =>
      context.store.clans(guildId).slice().sort(cfg.sort).slice(0, 10)
    );
    title = cfg.title;
    color = cfg.color;
    lines = clanRows(clans, cfg.format);
    cardRows = clans.map((clan, index) => ({
      rank: index + 1,
      name: clan.name || 'Клан',
      value: cfg.format(clan)
    }));
  } else {
    return null;
  }

  // Карта-лидерборд (картинка) поверх текстовых строк с кликабельными упоминаниями.
  const card = cardRows.length
    ? await buildLeaderboardCard({ title, subtitle: 'Первые 10 мест сервера', accent: colorToHex(color), rows: cardRows })
    : null;

  const components = mediaPanel({
    title,
    icon: ICONS.tops,
    eyebrow: 'Топы Onix',
    color,
    imageUrl: card?.imageUrl,
    lines,
    actions: [metricSelect(interaction.user.id, metric)]
  });

  return { components, files: card?.files };
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
      const response = await topResponse(context, interaction, subcommand);
      if (!response) return reply(interaction, errorPanel('Неизвестная подкоманда.'), { ephemeral: true });
      return reply(interaction, response.components, { files: response.files });
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('top:metric:')) return false;

  const ownerId = interaction.customId.split(':')[2];
  if (ownerId && interaction.user.id !== ownerId) {
    await reply(interaction, errorPanel('Это меню открыто для другого пользователя.'), { ephemeral: true });
    return true;
  }

  const metric = interaction.values[0];
  const response = await topResponse(context, interaction, metric);
  if (!response) {
    await reply(interaction, errorPanel('Неизвестная метрика.'), { ephemeral: true });
    return true;
  }
  await update(interaction, response.components, { files: response.files });
  return true;
}

module.exports = {
  commands,
  handleComponent
};
