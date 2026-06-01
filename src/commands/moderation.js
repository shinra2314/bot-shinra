const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { COLORS, ICONS, componentPayload, errorPanel, panel, reply, successPanel, update } = require('../ui/components');
const { formatDateTime, mentionUser, truncate } = require('../utils/format');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function canModerate(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function reportLine(report) {
  return `**${report.id}** — ${mentionUser(report.targetId)}\nОтправил: ${mentionUser(report.reporterId)} • Статус: ${report.status}\nПричина: ${truncate(report.reason, 160)}`;
}

async function sendAdminCopy(interaction, context, components) {
  const channelId = context.config.adminChannelId || context.config.reportChannelId;
  if (!channelId) return false;
  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return false;
  await channel.send(componentPayload(components));
  return true;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('mod')
      .setDescription('Модерация 2.0')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addSubcommand((subcommand) => subcommand.setName('репорты').setDescription('Очередь жалоб'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('варн')
          .setDescription('Выдать предупреждение')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь').setRequired(true))
          .addStringOption((option) => option.setName('причина').setDescription('Причина').setMaxLength(500).setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('история')
          .setDescription('История наказаний')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь').setRequired(true))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });
      if (!canModerate(interaction)) return reply(interaction, errorPanel('Недостаточно прав модерации.'), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
      const guild = context.store.guild(interaction.guildId);

      if (subcommand === 'репорты') {
        const reports = guild.reports.filter((report) => report.status === 'ожидает проверки').slice(0, 10);
        return reply(interaction, panel({
          title: 'Очередь жалоб',
          icon: ICONS.moderation,
          eyebrow: 'Модерация Onix',
          description: reports.length ? 'Репорты ожидают проверки.' : 'Очередь пустая.',
          color: COLORS.danger,
          lines: reports.map(reportLine)
        }), { ephemeral: true });
      }

      if (subcommand === 'варн') {
        const target = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('причина', true);
        context.store.ensureUser(interaction.guildId, target);
        context.store.addModerationAction(interaction.guildId, {
          type: 'warn',
          targetId: target.id,
          moderatorId: interaction.user.id,
          reason
        });
        await context.store.save();
        return reply(interaction, successPanel(`${mentionUser(target.id)} получил warn.\nПричина: ${reason}`, 'Warn выдан'));
      }

      const target = interaction.options.getUser('user', true);
      const history = context.store.moderationHistoryFor(interaction.guildId, target.id, 10);
      return reply(interaction, panel({
        title: `История наказаний — ${target.username}`,
        icon: ICONS.moderation,
        eyebrow: 'Модерация Onix',
        description: mentionUser(target.id),
        color: COLORS.danger,
        lines: history.length
          ? history.map((item) => `${ICONS.warning} **${item.type}** — ${formatDateTime(item.createdAt)}\n-# Модератор: ${mentionUser(item.moderatorId)} • ${item.reason || 'без причины'}`)
          : ['История пустая.']
      }), { ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('appeal')
      .setDescription('Подать апелляцию')
      .addStringOption((option) => option.setName('текст').setDescription('Текст апелляции').setMinLength(5).setMaxLength(1000).setRequired(true)),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      context.store.addModerationAction(interaction.guildId, {
        type: 'appeal',
        targetId: interaction.user.id,
        moderatorId: interaction.user.id,
        reason: interaction.options.getString('текст', true)
      });
      await context.store.save();
      await sendAdminCopy(interaction, context, panel({
        title: 'Новая апелляция',
        icon: '📨',
        eyebrow: 'Модерация Onix',
        description: `${mentionUser(interaction.user.id)} отправил апелляцию.`,
        color: COLORS.warning,
        fields: [
          { name: '📝 Текст', value: truncate(interaction.options.getString('текст', true), 900) }
        ]
      }));
      return reply(interaction, successPanel('Апелляция отправлена модерации.', 'Апелляция'), { ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Тикеты')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('создать')
          .setDescription('Создать тикет')
          .addStringOption((option) => option.setName('тема').setDescription('Тема тикета').setMaxLength(120).setRequired(true))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const ticket = {
        id: `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`,
        userId: interaction.user.id,
        topic: interaction.options.getString('тема', true),
        status: 'open',
        createdAt: Date.now()
      };
      context.store.guild(interaction.guildId).tickets.unshift(ticket);
      await context.store.save();
      await sendAdminCopy(interaction, context, panel({
        title: 'Новый тикет',
        icon: '🎫',
        eyebrow: 'Поддержка Onix',
        description: `${mentionUser(interaction.user.id)} создал тикет.`,
        color: COLORS.info,
        fields: [
          { name: '🗂 Тема', value: ticket.topic },
          { name: '🆔 ID', value: ticket.id }
        ]
      }));
      return reply(interaction, successPanel(`Тикет создан.\nID: \`${ticket.id}\``, 'Тикет'), { ephemeral: true });
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('mod:')) return false;
  if (!canModerate(interaction)) {
    await reply(interaction, errorPanel('Недостаточно прав модерации.'), { ephemeral: true });
    return true;
  }

  const [, action, reportId] = interaction.customId.split(':');
  const report = context.store.guild(interaction.guildId).reports.find((item) => item.id === reportId);
  if (!report) {
    await reply(interaction, errorPanel('Репорт не найден.'), { ephemeral: true });
    return true;
  }

  const statusMap = {
    accept: 'принят',
    reject: 'отклонён',
    warn: 'warn выдан',
    ban: 'ban выдан',
    ticket: 'тикет открыт'
  };
  report.status = statusMap[action] || report.status;
  report.actions ||= [];
  report.actions.push({ action, moderatorId: interaction.user.id, createdAt: Date.now() });

  if (action === 'warn') {
    context.store.addModerationAction(interaction.guildId, {
      type: 'warn',
      targetId: report.targetId,
      moderatorId: interaction.user.id,
      reason: `Report ${report.id}: ${report.reason}`
    });
  }

  if (action === 'ban') {
    const member = await interaction.guild.members.fetch(report.targetId).catch(() => null);
    if (member?.bannable) {
      await member.ban({ reason: `Report ${report.id}: ${report.reason}` }).catch(() => null);
      context.store.addModerationAction(interaction.guildId, {
        type: 'ban',
        targetId: report.targetId,
        moderatorId: interaction.user.id,
        reason: report.reason
      });
    } else {
      report.status = 'ban не удался';
    }
  }

  if (action === 'ticket') {
    context.store.guild(interaction.guildId).tickets.unshift({
      id: `report-${report.id}`,
      userId: report.reporterId,
      targetId: report.targetId,
      topic: `Жалоба ${report.id}`,
      status: 'open',
      createdAt: Date.now()
    });
  }

  await context.store.save();
  await update(interaction, panel({
    title: `Жалоба ${report.id}`,
    icon: ICONS.moderation,
    eyebrow: 'Модерация Onix',
    description: `На пользователя: ${mentionUser(report.targetId)}\nОтправил: ${mentionUser(report.reporterId)}\nСтатус: **${report.status}**`,
    color: COLORS.danger,
    fields: [
      { name: '📝 Причина', value: truncate(report.reason, 500) },
      { name: '🔗 Доказательство', value: truncate(report.evidence, 500) }
    ],
    footer: `Модератор: ${interaction.user.username}`
  }));
  return true;
}

module.exports = {
  commands,
  handleComponent
};
