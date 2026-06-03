const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  ButtonStyle,
  COLORS,
  ICONS,
  button,
  componentPayload,
  errorPanel,
  panel,
  reply,
  successPanel,
  update
} = require('../ui/components');
const { formatCoins, mentionUser } = require('../utils/format');

// Жалоба считается «в ожидании», пока модерация не сменила статус (см. moderation.js).
const ACTIVE_REPORT_STATUS = 'ожидает проверки';

function truncate(value, max) {
  const str = String(value || '');
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function formatUptime(ms) {
  const total = Math.floor((ms || 0) / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}д`);
  if (hours) parts.push(`${hours}ч`);
  parts.push(`${minutes}м`);
  return parts.join(' ');
}

function backHome() {
  return button('admin:home', '← Назад', ButtonStyle.Secondary);
}

async function sendAdminLog(interaction, context, components) {
  const channelId = context.config.adminChannelId || context.config.reportChannelId;
  if (!channelId) return false;
  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return false;
  await channel.send(componentPayload(components));
  return true;
}

// Главная панель-хаб: живые статы + кнопки навигации/действий.
function buildHub(interaction, context) {
  const guild = context.store.guild(interaction.guildId);
  const { client } = interaction;
  const openTickets = guild.tickets.filter((ticket) => ticket.status !== 'closed').length;
  const pendingReports = guild.reports.filter((report) => report.status === ACTIVE_REPORT_STATUS).length;

  return panel({
    title: 'Панель управления',
    icon: '🛠️',
    eyebrow: 'Админка Onix',
    description: 'Состояние бота и быстрые действия.',
    color: COLORS.info,
    stats: [
      { icon: ICONS.profile, name: 'Пользователей', value: String(Object.keys(guild.users).length) },
      { icon: ICONS.clan, name: 'Кланов', value: String(Object.keys(guild.clans).length) },
      { icon: '⚔️', name: 'Активных войн', value: String(guild.clanWars.filter((war) => war.status === 'active').length) },
      { icon: ICONS.shop, name: 'Лотов маркета', value: String(guild.marketListings.filter((item) => item.status === 'active').length) },
      { icon: '🎫', name: 'Открытых тикетов', value: String(openTickets) },
      { icon: ICONS.moderation, name: 'Жалоб в ожидании', value: String(pendingReports) },
      { icon: '📶', name: 'Пинг шлюза', value: `${Math.max(0, Math.round(client.ws?.ping ?? -1))} ms` },
      { icon: ICONS.time, name: 'Аптайм', value: formatUptime(client.uptime) }
    ],
    statColumns: 2,
    footer: client.user?.tag || 'Onix',
    actions: [
      button('admin:refresh', '🔄 Обновить', ButtonStyle.Primary),
      button('admin:reports', '🛡️ Жалобы', ButtonStyle.Secondary),
      button('admin:tickets', '🎫 Тикеты', ButtonStyle.Secondary),
      button('admin:backup', '💾 Backup', ButtonStyle.Secondary)
    ]
  });
}

// Подпанель: список жалоб в ожидании (резолв — кнопками в канале модерации).
function buildReports(interaction, context) {
  const guild = context.store.guild(interaction.guildId);
  const pending = guild.reports.filter((report) => report.status === ACTIVE_REPORT_STATUS).slice(0, 8);
  const lines = pending.length === 0
    ? ['-# Активных жалоб нет.']
    : pending.map((report) => {
        const when = new Date(report.createdAt).toLocaleString('ru-RU');
        return [
          `🛡️ **На ${mentionUser(report.targetId)}** — \`${report.status}\``,
          `-# от ${mentionUser(report.reporterId)} · ${when}`,
          truncate(report.reason, 140)
        ].join('\n');
      });

  return panel({
    title: 'Жалобы',
    icon: ICONS.moderation,
    eyebrow: 'Админка Onix',
    description: `В ожидании: ${pending.length}`,
    color: COLORS.warning,
    lines,
    footer: 'Резолв — кнопками под жалобой в канале модерации.',
    actions: [backHome()]
  });
}

// Подпанель: список открытых тикетов.
function buildTickets(interaction, context) {
  const open = context.store.tickets(interaction.guildId).filter((ticket) => ticket.status !== 'closed').slice(0, 8);
  const lines = open.length === 0
    ? ['-# Открытых тикетов нет.']
    : open.map((ticket) => {
        const when = new Date(ticket.createdAt).toLocaleString('ru-RU');
        return [
          `🎫 **${truncate(ticket.topic || 'Без темы', 60)}** — \`${ticket.id}\``,
          `-# ${mentionUser(ticket.userId)} · ${when} · ${ticket.source || 'discord'}`
        ].join('\n');
      });

  return panel({
    title: 'Тикеты',
    icon: '🎫',
    eyebrow: 'Админка Onix',
    description: `Открытых: ${open.length}`,
    color: COLORS.info,
    lines,
    footer: 'Полная переписка и ответы — в веб-дашборде.',
    actions: [backHome()]
  });
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('admin')
      .setDescription('Диагностика и обслуживание бота')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((subcommand) => subcommand.setName('диагностика').setDescription('Открыть панель управления'))
      .addSubcommand((subcommand) => subcommand.setName('backup').setDescription('Сделать backup базы JSON'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('выдать')
          .setDescription('Выдать валюту пользователю')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь').setRequired(true))
          .addStringOption((option) =>
            option
              .setName('валюта')
              .setDescription('Что выдать')
              .addChoices(
                { name: 'Монеты', value: 'balance' },
                { name: 'Лотусы', value: 'lotuses' },
                { name: 'Снежки', value: 'snowballs' }
              )
              .setRequired(true)
          )
          .addIntegerOption((option) =>
            option.setName('сумма').setDescription('Количество').setMinValue(1).setMaxValue(100000000).setRequired(true)
          )
          .addStringOption((option) =>
            option.setName('причина').setDescription('Причина выдачи').setMaxLength(300)
          )
      ),
    async execute(interaction, context) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return reply(interaction, errorPanel('Нужны права Manage Server.'), { ephemeral: true });
      }

      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'backup') {
        const target = await context.store.backup();
        return reply(interaction, successPanel(`Backup создан:\n\`${target}\``, 'Backup'), { ephemeral: true });
      }

      if (subcommand === 'выдать') {
        const target = interaction.options.getUser('user', true);
        const currency = interaction.options.getString('валюта', true);
        const amount = interaction.options.getInteger('сумма', true);
        const reason = interaction.options.getString('причина') || 'админская выдача';
        const profile = context.store.ensureUser(interaction.guildId, target);
        profile[currency] = Number(profile[currency] || 0) + amount;

        context.store.recordTransaction(interaction.guildId, {
          type: 'admin_grant',
          toId: target.id,
          amount,
          note: `${reason} (${currency})`
        });
        await context.store.save();

        const labels = {
          balance: 'монет',
          lotuses: 'лотусов',
          snowballs: 'снежков'
        };
        const logView = panel({
          title: 'Админская выдача валюты',
          icon: ICONS.economy,
          eyebrow: 'Админка Onix',
          description: `${mentionUser(interaction.user.id)} выдал ${mentionUser(target.id)} **${amount} ${labels[currency]}**.`,
          color: COLORS.economy,
          fields: [
            { name: '📝 Причина', value: reason },
            { name: `${ICONS.coins} Новый баланс`, value: currency === 'balance' ? formatCoins(profile.balance) : String(profile[currency]) }
          ]
        });
        await sendAdminLog(interaction, context, logView);

        return reply(interaction, successPanel(`${mentionUser(target.id)} получил **${amount} ${labels[currency]}**.`, 'Валюта выдана'), { ephemeral: true });
      }

      return reply(interaction, buildHub(interaction, context), { ephemeral: true });
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('admin:')) return false;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await reply(interaction, errorPanel('Нужны права Manage Server.'), { ephemeral: true });
    return true;
  }

  const action = interaction.customId.slice('admin:'.length);

  if (action === 'reports') {
    await update(interaction, buildReports(interaction, context));
    return true;
  }

  if (action === 'tickets') {
    await update(interaction, buildTickets(interaction, context));
    return true;
  }

  if (action === 'backup') {
    const target = await context.store.backup();
    await update(interaction, panel({
      title: 'Backup создан',
      icon: ICONS.success,
      eyebrow: 'Админка Onix',
      description: `\`${target}\``,
      color: COLORS.success,
      actions: [backHome()]
    }));
    return true;
  }

  // refresh и home — оба перерисовывают хаб свежими данными.
  await update(interaction, buildHub(interaction, context));
  return true;
}

module.exports = {
  commands,
  handleComponent
};
