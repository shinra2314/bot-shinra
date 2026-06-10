const {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const {
  COLORS,
  ButtonStyle,
  button,
  componentPayload,
  errorPanel,
  panel,
  reply,
  successPanel
} = require('../ui/components');
const { ticketPanel } = require('../ui/ticketPanel');
const { mentionUser, truncate } = require('../utils/format');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function canAdmin(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

function ticketKind(arg) {
  return arg === 'report' ? 'report' : 'ticket';
}

function kindTitle(kind, n) {
  return kind === 'report' ? `Жалоба #${n}` : `Тикет #${n}`;
}

// Модалка-форма: одно многострочное поле «Информация» (как на референсе).
function ticketModal(kind) {
  return new ModalBuilder()
    .setCustomId(`ticket:submit:${ticketKind(kind)}`)
    .setTitle('Форма')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('info')
          .setLabel('Информация')
          .setPlaceholder('С какой целью вы открываете тикет?')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(3)
          .setMaxLength(1000)
          .setRequired(true)
      )
    );
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Тикеты')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('панель')
          .setDescription('Опубликовать статичную панель тикетов в этот канал (только админ)')
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('создать')
          .setDescription('Создать тикет')
          .addStringOption((option) => option.setName('тема').setDescription('Тема тикета').setMaxLength(120).setRequired(true))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'панель') {
        if (!canAdmin(interaction)) return reply(interaction, errorPanel('Нужны права управления сервером.'), { ephemeral: true });
        const sent = await interaction.channel?.send(componentPayload(ticketPanel())).catch(() => null);
        if (!sent) return reply(interaction, errorPanel('Не удалось отправить панель в этот канал.'), { ephemeral: true });
        context.store.setTicketPanelMessage(interaction.guildId, sent.id);
        await context.store.save();
        return reply(interaction, successPanel('Панель тикетов опубликована.', 'Тикеты'), { ephemeral: true });
      }

      // Совместимость: быстрый тикет без отдельного канала (как раньше).
      const ticket = context.store.addTicket(interaction.guildId, {
        userId: interaction.user.id,
        topic: interaction.options.getString('тема', true),
        source: 'discord'
      });
      await context.store.save();
      return reply(interaction, successPanel(`Тикет создан.\nID: \`${ticket.id}\``, 'Тикет'), { ephemeral: true });
    }
  }
];

async function createTicketChannel(interaction, context, kind, info) {
  const { store, config } = context;
  const guild = interaction.guild;
  const n = store.nextTicketNumber(interaction.guildId);
  const name = kind === 'report' ? `жалоба-${n}` : `тикет-${n}`;
  const allow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory
  ];

  const channel = await guild.channels
    .create({
      name,
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId || null,
      // Скрыт от @everyone: видят автор, бот и админы (Administrator обходит ViewChannel).
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow },
        { id: interaction.client.user.id, allow: [...allow, PermissionFlagsBits.ManageChannels] }
      ],
      reason: `Тикет от ${interaction.user.tag}`
    })
    .catch(() => null);

  if (!channel) return null;

  const ticket = store.addTicket(interaction.guildId, {
    userId: interaction.user.id,
    topic: info,
    kind,
    channelId: channel.id,
    source: 'discord'
  });
  await store.save();

  await channel
    .send(
      componentPayload(
        panel({
          title: kindTitle(kind, n),
          icon: '🎫',
          eyebrow: 'Поддержка Onix',
          description: `${mentionUser(interaction.user.id)} открыл обращение.`,
          color: kind === 'report' ? COLORS.danger : COLORS.info,
          fields: [{ name: '📝 Сообщение', value: truncate(info, 1000) || '—' }],
          footer: 'Администрация скоро ответит. Закрыть тикет может только администратор.',
          actions: [button(`ticket:close:${ticket.id}`, 'Закрыть тикет', ButtonStyle.Danger)]
        }),
        { allowedMentions: { users: [interaction.user.id] } }
      )
    )
    .catch(() => null);

  return channel;
}

async function handleComponent(interaction, context) {
  const isModal = interaction.isModalSubmit?.();
  if (!interaction.isButton() && !isModal) return false;
  if (!interaction.customId.startsWith('ticket:')) return false;

  const guildError = requireGuild(interaction);
  if (guildError) {
    await reply(interaction, errorPanel(guildError), { ephemeral: true });
    return true;
  }

  const [, action, arg] = interaction.customId.split(':');

  if (action === 'open') {
    await interaction.showModal(ticketModal(arg));
    return true;
  }

  if (action === 'submit') {
    const info = interaction.fields.getTextInputValue('info').trim();
    const channel = await createTicketChannel(interaction, context, ticketKind(arg), info);
    if (!channel) {
      await reply(interaction, errorPanel('Не удалось создать канал тикета. Проверь, что у бота есть право «Управление каналами».'), { ephemeral: true });
      return true;
    }
    await reply(interaction, successPanel(`Готово! Твой канал: <#${channel.id}>`, 'Тикет создан'), { ephemeral: true });
    return true;
  }

  if (action === 'close') {
    if (!canAdmin(interaction)) {
      await reply(interaction, errorPanel('Закрыть тикет может только администратор.'), { ephemeral: true });
      return true;
    }
    context.store.closeTicket(interaction.guildId, arg);
    await context.store.save();
    await reply(interaction, successPanel('Тикет закрыт. Канал будет удалён.', 'Тикет'), { ephemeral: true });
    const channel = interaction.channel;
    setTimeout(() => channel?.delete('Тикет закрыт').catch(() => null), 4000);
    return true;
  }

  return false;
}

module.exports = {
  commands,
  handleComponent
};
