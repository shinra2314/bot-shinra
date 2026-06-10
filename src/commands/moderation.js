const { ActionRowBuilder, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { COLORS, ICONS, ButtonStyle, button, componentPayload, errorPanel, panel, reply, successPanel, update, userSelect } = require('../ui/components');
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

function reportsComponents(guild) {
  const reports = guild.reports.filter((report) => report.status === 'ожидает проверки').slice(0, 10);
  return panel({
    title: 'Очередь жалоб',
    icon: ICONS.moderation,
    eyebrow: 'Модерация Onix',
    description: reports.length ? 'Репорты ожидают проверки.' : 'Очередь пустая.',
    color: COLORS.danger,
    lines: reports.map(reportLine)
  });
}

async function applyWarn(interaction, context, target, reason) {
  context.store.ensureUser(interaction.guildId, target);
  context.store.addModerationAction(interaction.guildId, {
    type: 'warn',
    targetId: target.id,
    moderatorId: interaction.user.id,
    reason
  });
  await context.store.save();
  context.eventLogger?.emit(interaction.guildId, 'warnAdd', {
    description: `${mentionUser(target.id)} получил предупреждение.`,
    fields: [{ name: 'Причина', value: truncate(reason, 500) }],
    footer: `Модератор: ${interaction.user.username}`
  });
  return reply(interaction, successPanel(`${mentionUser(target.id)} получил warn.\nПричина: ${reason}`, 'Warn выдан'));
}

function historyComponents(context, guildId, target) {
  const history = context.store.moderationHistoryFor(guildId, target.id, 10);
  return panel({
    title: `История наказаний — ${target.username}`,
    icon: ICONS.moderation,
    eyebrow: 'Модерация Onix',
    description: mentionUser(target.id),
    color: COLORS.danger,
    lines: history.length
      ? history.map((item) => `${ICONS.warning} **${item.type}** — ${formatDateTime(item.createdAt)}\n-# Модератор: ${mentionUser(item.moderatorId)} • ${item.reason || 'без причины'}`)
      : ['История пустая.']
  });
}

// Статичная панель модерации (публикуется /панель). Все кнопки — только для модераторов.
function hubPanel(imageUrl) {
  return panel({
    imageUrl,
    title: 'Модерация',
    icon: ICONS.moderation,
    eyebrow: 'Модерация Onix',
    description: 'Очередь жалоб, выдача предупреждений и история наказаний.',
    color: COLORS.danger,
    footer: 'Кнопки доступны только модераторам (ModerateMembers / BanMembers / ManageGuild).',
    actions: [
      button('mod:hub:reports', '🛡️ Жалобы', ButtonStyle.Primary),
      button('mod:hub:warn', '⚠️ Варн', ButtonStyle.Secondary),
      button('mod:hub:history', '📜 История', ButtonStyle.Secondary)
    ]
  });
}

function warnModal(userId) {
  return new ModalBuilder()
    .setCustomId(`mod:hub:warn-reason:${userId}`)
    .setTitle('Выдать предупреждение')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Причина')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(2)
          .setMaxLength(500)
          .setRequired(true)
      )
    );
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
        return reply(interaction, reportsComponents(guild), { ephemeral: true });
      }
      if (subcommand === 'варн') {
        return applyWarn(interaction, context, interaction.options.getUser('user', true), interaction.options.getString('причина', true));
      }
      return reply(interaction, historyComponents(context, interaction.guildId, interaction.options.getUser('user', true)), { ephemeral: true });
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
  }
];

async function handleComponent(interaction, context) {
  const isModal = interaction.isModalSubmit?.();
  const isUserSel = interaction.isUserSelectMenu?.();
  if (!interaction.isButton() && !isModal && !isUserSel) return false;
  if (!interaction.customId.startsWith('mod:')) return false;
  if (!canModerate(interaction)) {
    await reply(interaction, errorPanel('Недостаточно прав модерации.'), { ephemeral: true });
    return true;
  }

  const parts = interaction.customId.split(':');

  // Кнопки статичной панели модерации (mod:hub:*).
  if (parts[1] === 'hub') {
    const sub = parts[2];
    if (sub === 'reports') {
      await reply(interaction, reportsComponents(context.store.guild(interaction.guildId)), { ephemeral: true });
      return true;
    }
    if (sub === 'warn') {
      await reply(interaction, panel({
        title: 'Выдать предупреждение',
        icon: ICONS.moderation,
        eyebrow: 'Модерация Onix',
        description: 'Выбери пользователя.',
        color: COLORS.danger,
        actions: [userSelect('mod:hub:warn-pick', 'Кому выдать warn', 1, 1)]
      }), { ephemeral: true });
      return true;
    }
    if (sub === 'warn-pick') {
      await interaction.showModal(warnModal(interaction.values[0]));
      return true;
    }
    if (sub === 'warn-reason') {
      const target = await interaction.client.users.fetch(parts[3]).catch(() => null);
      if (!target) {
        await reply(interaction, errorPanel('Пользователь не найден.'), { ephemeral: true });
        return true;
      }
      await applyWarn(interaction, context, target, interaction.fields.getTextInputValue('reason').trim());
      return true;
    }
    if (sub === 'history') {
      await reply(interaction, panel({
        title: 'История наказаний',
        icon: ICONS.moderation,
        eyebrow: 'Модерация Onix',
        description: 'Выбери пользователя.',
        color: COLORS.danger,
        actions: [userSelect('mod:hub:history-pick', 'Чью историю показать', 1, 1)]
      }), { ephemeral: true });
      return true;
    }
    if (sub === 'history-pick') {
      const target = await interaction.client.users.fetch(interaction.values[0]).catch(() => null);
      if (!target) {
        await reply(interaction, errorPanel('Пользователь не найден.'), { ephemeral: true });
        return true;
      }
      await reply(interaction, historyComponents(context, interaction.guildId, target), { ephemeral: true });
      return true;
    }
    return true;
  }

  if (!interaction.isButton()) return false;
  const [, action, reportId] = parts;
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
    context.store.addTicket(interaction.guildId, {
      id: `report-${report.id}`,
      userId: report.reporterId,
      targetId: report.targetId,
      topic: `Жалоба ${report.id}`,
      source: 'discord'
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
  handleComponent,
  hubPanel
};
