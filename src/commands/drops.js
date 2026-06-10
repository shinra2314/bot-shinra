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
  update
} = require('../ui/components');
const { mentionUser } = require('../utils/format');

// Активные дропы в памяти (ephemeral, переживать рестарт не нужно): id → состояние.
const activeDrops = new Map();
const DROP_TTL_MS = 10 * 60 * 1000;

// Взвешенный розыгрыш суммы (редкость).
const DROP_TIERS = [
  { weight: 50, amount: 100, label: 'обычная' },
  { weight: 30, amount: 250, label: 'неплохая' },
  { weight: 15, amount: 500, label: 'редкая' },
  { weight: 5, amount: 1000, label: 'джекпот' }
];

function rollDrop() {
  const total = DROP_TIERS.reduce((sum, tier) => sum + tier.weight, 0);
  let roll = Math.random() * total;
  for (const tier of DROP_TIERS) {
    roll -= tier.weight;
    if (roll < 0) return tier;
  }
  return DROP_TIERS[0];
}

function dropPanel(dropId) {
  return mediaPanel({
    title: 'Таинственная коробка 🎁',
    icon: '📦',
    eyebrow: 'Дроп Onix',
    description: 'В чате появилась коробка! **Первый**, кто нажмёт кнопку, забирает награду. 💨',
    color: COLORS.warning,
    actions: [button(`drop:claim:${dropId}`, '📦 Забрать', ButtonStyle.Success)]
  });
}

function claimedPanel(userId, amount, tierLabel) {
  return panel({
    title: 'Коробка забрана! 🎉',
    icon: '📦',
    eyebrow: 'Дроп Onix',
    description: `${mentionUser(userId)} успел первым и забрал **${amount} монет** (${tierLabel} награда)! 🪙`,
    color: COLORS.success
  });
}

function expiredPanel() {
  return panel({
    title: 'Коробка исчезла 💨',
    icon: '📦',
    eyebrow: 'Дроп Onix',
    description: 'Никто не успел забрать награду вовремя.',
    color: COLORS.neutral
  });
}

// Спавнит дроп в канал. Возвращает сообщение или null. Чистит себя по TTL.
async function spawnDrop(channel) {
  if (!channel?.send) return null;
  const dropId = randomUUID();
  const sent = await channel.send(componentPayload(dropPanel(dropId))).catch(() => null);
  if (!sent) return null;
  activeDrops.set(dropId, { claimed: false, messageId: sent.id, channelId: channel.id });

  setTimeout(() => {
    const drop = activeDrops.get(dropId);
    if (!drop || drop.claimed) {
      activeDrops.delete(dropId);
      return;
    }
    activeDrops.delete(dropId);
    sent.edit(componentPayload(expiredPanel())).catch(() => null);
  }, DROP_TTL_MS).unref?.();

  return sent;
}

function canAdmin(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('drop')
      .setDescription('Создать таинственную коробку в этом канале (только админ)'),
    async execute(interaction, context) {
      if (!interaction.guildId) return reply(interaction, errorPanel('Только на сервере.'), { ephemeral: true });
      if (!canAdmin(interaction)) return reply(interaction, errorPanel('Нужны права управления сервером.'), { ephemeral: true });
      const sent = await spawnDrop(interaction.channel);
      if (!sent) return reply(interaction, errorPanel('Не удалось создать дроп в этом канале.'), { ephemeral: true });
      return reply(interaction, panel({ title: 'Дроп создан 📦', description: 'Коробка появилась в канале.', color: COLORS.success }), { ephemeral: true });
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton() || !interaction.customId.startsWith('drop:')) return false;
  const [, action, dropId] = interaction.customId.split(':');
  if (action !== 'claim' || !dropId) return false;

  const drop = activeDrops.get(dropId);
  if (!drop || drop.claimed) {
    await reply(interaction, errorPanel('Коробку уже забрали или она исчезла.'), { ephemeral: true });
    return true;
  }

  drop.claimed = true;
  const tier = rollDrop();
  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  profile.balance = Number(profile.balance || 0) + tier.amount;
  context.store.recordTransaction(interaction.guildId, {
    type: 'drop',
    toId: interaction.user.id,
    amount: tier.amount,
    note: 'mystery drop'
  });
  await context.store.save();
  activeDrops.delete(dropId);

  await update(interaction, claimedPanel(interaction.user.id, tier.amount, tier.label));
  return true;
}

module.exports = {
  commands,
  handleComponent,
  spawnDrop
};
