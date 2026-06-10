const { randomUUID } = require('node:crypto');
const { SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  ButtonStyle,
  button,
  componentPayload,
  errorPanel,
  mediaPanel,
  reply,
  successPanel,
  update
} = require('../ui/components');
const { mentionUser } = require('../utils/format');

// Активные LFG-сборы в памяти (transient). id → состояние.
const activeLfg = new Map();
const LFG_TTL_MS = 60 * 60 * 1000;

function lfgPanel(lfg) {
  const filled = lfg.members.length;
  const full = filled >= lfg.slots;
  const roster = lfg.members.map((id, index) => `${index + 1}. ${mentionUser(id)}`).join('\n') || '—';
  return mediaPanel({
    title: `🎮 Ищу пати: ${lfg.game}`,
    icon: '🕹️',
    eyebrow: 'Поиск группы Onix',
    description: lfg.note ? lfg.note : 'Набор в группу. Жми «Присоединиться»!',
    color: full ? COLORS.success : COLORS.primary,
    lines: [
      `👥 Состав: **${filled}/${lfg.slots}**${full ? ' — набрано! ✅' : ''}`,
      roster
    ],
    actions: [
      button(`lfg:join:${lfg.id}`, '✅ Присоединиться', ButtonStyle.Success, full),
      button(`lfg:leave:${lfg.id}`, '🚪 Покинуть', ButtonStyle.Secondary),
      button(`lfg:close:${lfg.id}`, '🔒 Закрыть', ButtonStyle.Danger)
    ]
  });
}

function closedPanel(lfg, reason) {
  return mediaPanel({
    title: `🎮 Сбор закрыт: ${lfg.game}`,
    icon: '🕹️',
    eyebrow: 'Поиск группы Onix',
    description: reason || 'Набор завершён.',
    color: COLORS.neutral,
    lines: [`👥 Итоговый состав: ${lfg.members.map((id) => mentionUser(id)).join(', ') || '—'}`]
  });
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('lfg')
      .setDescription('Найти пати для игры')
      .addStringOption((option) => option.setName('игра').setDescription('Во что играем').setMaxLength(80).setRequired(true))
      .addIntegerOption((option) => option.setName('слоты').setDescription('Сколько всего человек нужно (включая тебя)').setMinValue(2).setMaxValue(20).setRequired(true))
      .addStringOption((option) => option.setName('заметка').setDescription('Доп. условия (ранг, режим)').setMaxLength(200)),
    async execute(interaction, context) {
      if (!interaction.guildId) return reply(interaction, errorPanel('Только на сервере.'), { ephemeral: true });

      const id = randomUUID().slice(0, 8);
      const lfg = {
        id,
        hostId: interaction.user.id,
        game: interaction.options.getString('игра', true),
        slots: interaction.options.getInteger('слоты', true),
        note: interaction.options.getString('заметка') || null,
        members: [interaction.user.id],
        channelId: interaction.channelId,
        messageId: null
      };

      const sent = await interaction.channel?.send(componentPayload(lfgPanel(lfg), { allowedMentions: { parse: [] } })).catch(() => null);
      if (!sent) return reply(interaction, errorPanel('Не удалось опубликовать сбор в этом канале.'), { ephemeral: true });
      lfg.messageId = sent.id;
      activeLfg.set(id, lfg);

      setTimeout(() => {
        const current = activeLfg.get(id);
        if (!current) return;
        activeLfg.delete(id);
        sent.edit(componentPayload(closedPanel(current, 'Сбор истёк по времени.'))).catch(() => null);
      }, LFG_TTL_MS).unref?.();

      return reply(interaction, successPanel('Сбор опубликован! 🎮', 'Поиск группы'), { ephemeral: true });
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton() || !interaction.customId.startsWith('lfg:')) return false;
  const [, action, id] = interaction.customId.split(':');
  if (!['join', 'leave', 'close'].includes(action) || !id) return false;

  const lfg = activeLfg.get(id);
  if (!lfg) {
    await reply(interaction, errorPanel('Этот сбор уже закрыт.'), { ephemeral: true });
    return true;
  }

  const userId = interaction.user.id;

  if (action === 'close') {
    if (userId !== lfg.hostId) {
      await reply(interaction, errorPanel('Закрыть сбор может только его создатель.'), { ephemeral: true });
      return true;
    }
    activeLfg.delete(id);
    await update(interaction, closedPanel(lfg, 'Создатель закрыл сбор.'));
    return true;
  }

  if (action === 'leave') {
    if (userId === lfg.hostId) {
      // Хост выходит — закрываем весь сбор.
      activeLfg.delete(id);
      await update(interaction, closedPanel(lfg, 'Создатель покинул сбор.'));
      return true;
    }
    lfg.members = lfg.members.filter((memberId) => memberId !== userId);
    await update(interaction, lfgPanel(lfg));
    return true;
  }

  // join
  if (lfg.members.includes(userId)) {
    await reply(interaction, errorPanel('Ты уже в составе этого сбора.'), { ephemeral: true });
    return true;
  }
  if (lfg.members.length >= lfg.slots) {
    await reply(interaction, errorPanel('Состав уже набран.'), { ephemeral: true });
    return true;
  }

  lfg.members.push(userId);
  await update(interaction, lfgPanel(lfg));

  // Состав набран — пингуем всех участников отдельным сообщением.
  if (lfg.members.length >= lfg.slots) {
    const mentions = lfg.members.map((memberId) => mentionUser(memberId)).join(' ');
    await interaction.channel
      ?.send(componentPayload(
        mediaPanel({
          title: '🎉 Состав набран!',
          icon: '🎮',
          eyebrow: 'Поиск группы Onix',
          description: `Группа для **${lfg.game}** собрана: ${mentions}`,
          color: COLORS.success
        }),
        { allowedMentions: { users: lfg.members } }
      ))
      .catch(() => null);
  }
  return true;
}

module.exports = {
  commands,
  handleComponent
};
