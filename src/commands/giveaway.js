const { randomUUID } = require('node:crypto');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  ButtonStyle,
  button,
  componentPayload,
  errorPanel,
  mediaPanel,
  panel,
  reply,
  successPanel
} = require('../ui/components');
const { mentionUser } = require('../utils/format');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function canAdmin(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

function giveawayPanel(giveaway) {
  const ends = Math.floor(Number(giveaway.endsAt) / 1000);
  return mediaPanel({
    title: `🎉 Розыгрыш: ${giveaway.prize}`,
    icon: '🎁',
    eyebrow: 'Розыгрыши Onix',
    description: 'Нажми кнопку ниже, чтобы участвовать!',
    color: COLORS.primary,
    lines: [
      `🏆 Победителей: **${giveaway.winnersCount}**`,
      `⏳ Завершение: <t:${ends}:R>`,
      `👤 Организатор: ${mentionUser(giveaway.hostId)}`
    ],
    actions: [button(`giveaway:join:${giveaway.id}`, '🎉 Участвовать', ButtonStyle.Success)]
  });
}

function resultPanel(giveaway, winners) {
  const winnersText = winners.length
    ? winners.map((id) => mentionUser(id)).join(', ')
    : 'никто не участвовал 😢';
  return panel({
    title: `🎉 Розыгрыш завершён: ${giveaway.prize}`,
    icon: '🏆',
    eyebrow: 'Розыгрыши Onix',
    description: `Победител${winners.length === 1 ? 'ь' : 'и'}: ${winnersText}`,
    color: COLORS.success,
    footer: `Участников: ${giveaway.entrants.length}`
  });
}

// Завершить один розыгрыш: объявить победителей, перерисовать исходное сообщение.
async function finishGiveaway(client, store, guildId, giveaway) {
  const winners = store.endGiveaway(guildId, giveaway.id);
  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (channel?.isTextBased?.()) {
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (message) await message.edit(componentPayload(resultPanel(giveaway, winners))).catch(() => null);
    const mention = winners.length ? winners.map((id) => mentionUser(id)).join(', ') : null;
    await channel
      .send(
        componentPayload(
          panel({
            title: '🎉 Итоги розыгрыша',
            description: mention
              ? `Поздравляем ${mention}! Приз: **${giveaway.prize}**.`
              : `На розыгрыш **${giveaway.prize}** никто не записался.`,
            color: COLORS.success
          }),
          { allowedMentions: { users: winners } }
        )
      )
      .catch(() => null);
  }
  return winners;
}

// Завершить все истёкшие розыгрыши гильдии (зовётся из интервала index.js).
async function finishDueGiveaways(client, store, guildId) {
  const due = store.dueGiveaways(guildId);
  let changed = false;
  for (const giveaway of due) {
    await finishGiveaway(client, store, guildId, giveaway);
    changed = true;
  }
  return changed;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Розыгрыши (только админ)')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('создать')
          .setDescription('Запустить розыгрыш в этом канале')
          .addStringOption((option) => option.setName('приз').setDescription('Что разыгрываем').setMaxLength(200).setRequired(true))
          .addIntegerOption((option) => option.setName('минуты').setDescription('Длительность в минутах').setMinValue(1).setMaxValue(20160).setRequired(true))
          .addIntegerOption((option) => option.setName('победители').setDescription('Сколько победителей (1 по умолчанию)').setMinValue(1).setMaxValue(20))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('завершить')
          .setDescription('Завершить розыгрыш досрочно')
          .addStringOption((option) => option.setName('id').setDescription('ID розыгрыша').setRequired(true))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });
      if (!canAdmin(interaction)) return reply(interaction, errorPanel('Нужны права управления сервером.'), { ephemeral: true });

      const { store, client } = context;
      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'завершить') {
        const id = interaction.options.getString('id', true);
        const giveaway = store.getGiveaway(guildId, id);
        if (!giveaway || giveaway.ended) return reply(interaction, errorPanel('Активный розыгрыш с таким ID не найден.'), { ephemeral: true });
        await finishGiveaway(client, store, guildId, giveaway);
        await store.save();
        return reply(interaction, successPanel('Розыгрыш завершён.', 'Розыгрыши'), { ephemeral: true });
      }

      const prize = interaction.options.getString('приз', true);
      const minutes = interaction.options.getInteger('минуты', true);
      const winnersCount = interaction.options.getInteger('победители') || 1;
      const id = randomUUID().slice(0, 8);
      const endsAt = Date.now() + minutes * 60 * 1000;

      const draft = { id, channelId: interaction.channelId, messageId: null, prize, winnersCount, endsAt, hostId: interaction.user.id };
      const sent = await interaction.channel?.send(componentPayload(giveawayPanel(draft))).catch(() => null);
      if (!sent) return reply(interaction, errorPanel('Не удалось опубликовать розыгрыш в этом канале.'), { ephemeral: true });

      store.addGiveaway(guildId, { ...draft, messageId: sent.id });
      await store.save();
      return reply(interaction, successPanel(`Розыгрыш запущен. ID: \`${id}\``, 'Розыгрыши'), { ephemeral: true });
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton() || !interaction.customId.startsWith('giveaway:')) return false;
  const [, action, id] = interaction.customId.split(':');
  if (action !== 'join' || !id) return false;

  const guildError = requireGuild(interaction);
  if (guildError) {
    await reply(interaction, errorPanel(guildError), { ephemeral: true });
    return true;
  }

  const result = context.store.joinGiveaway(interaction.guildId, id, interaction.user.id);
  if (result.already) {
    await reply(interaction, errorPanel('Ты уже участвуешь в этом розыгрыше.'), { ephemeral: true });
    return true;
  }
  if (!result.ok) {
    await reply(interaction, errorPanel('Розыгрыш уже завершён или не найден.'), { ephemeral: true });
    return true;
  }

  await context.store.save();
  const giveaway = context.store.getGiveaway(interaction.guildId, id);
  await reply(interaction, successPanel(`Ты в игре! 🎉 Участников: **${giveaway.entrants.length}**.`, 'Розыгрыши'), { ephemeral: true });
  return true;
}

module.exports = {
  commands,
  handleComponent,
  finishDueGiveaways
};
