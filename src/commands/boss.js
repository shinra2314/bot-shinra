const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  bar,
  componentPayload,
  errorPanel,
  mediaPanel,
  reply,
  successPanel
} = require('../ui/components');
const { mentionUser } = require('../utils/format');
const { buildWarCard } = require('../services/profileCard');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function canAdmin(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

function topDamage(boss, limit = 5) {
  return Object.entries(boss.participants)
    .map(([id, damage]) => ({ id, damage: Number(damage) }))
    .sort((a, b) => b.damage - a.damage)
    .slice(0, limit);
}

function bossStatusPanel(boss) {
  const hpPercent = Math.round((boss.hp / boss.maxHp) * 100);
  const top = topDamage(boss);
  const lines = [
    `❤️ HP: **${boss.hp.toLocaleString('ru-RU')} / ${boss.maxHp.toLocaleString('ru-RU')}** (${hpPercent}%)`,
    `\`${bar(boss.hp, boss.maxHp, 16)}\``,
    `💰 Награда рейда: **${boss.reward.toLocaleString('ru-RU')} монет** (делится по урону)`,
    '',
    top.length ? '__⚔️ Топ урона:__' : '⚔️ Урона ещё никто не нанёс. Пиши в чат — каждое сообщение бьёт босса!'
  ];
  for (const [index, entry] of top.entries()) {
    lines.push(`${['🥇', '🥈', '🥉', '4.', '5.'][index]} ${mentionUser(entry.id)} — ${entry.damage.toLocaleString('ru-RU')} урона`);
  }
  return mediaPanel({
    title: `🐲 Босс: ${boss.name}`,
    icon: '⚔️',
    eyebrow: 'Рейд Onix',
    description: boss.active
      ? 'Весь сервер против одного босса! Каждое сообщение в чате наносит урон. 💥'
      : 'Босс повержен! 🎉',
    color: boss.active ? COLORS.danger : COLORS.success,
    lines
  });
}

// Анонс победы: лут по урону, топ-1 получает эпический кейс. Зовётся из index.js.
async function announceDefeat(message, context) {
  const { store } = context;
  const boss = store.getBoss(message.guildId);
  const loot = store.distributeBossLoot(message.guildId);
  await store.save();

  const lines = loot.slice(0, 10).map((entry, index) => {
    const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
    return `${medal} ${mentionUser(entry.id)} — ${entry.damage.toLocaleString('ru-RU')} урона → **${entry.coins.toLocaleString('ru-RU')} монет**${entry.bonusCase ? ' + 🎴 эпический кейс' : ''}`;
  });

  const card = await buildWarCard({
    title: 'Босс повержен!',
    subtitle: boss.name,
    a: { name: 'Сервер', score: loot.reduce((sum, entry) => sum + entry.damage, 0) },
    b: { name: boss.name, score: 0 },
    accent: '#ff5a6e'
  }).catch(() => null);

  await message.channel
    .send(componentPayload(
      mediaPanel({
        title: `🏆 ${boss.name} повержен!`,
        icon: '🐲',
        eyebrow: 'Рейд Onix',
        description: `Финальный удар нанёс ${mentionUser(message.author.id)}! 💥 Добыча разделена по вкладу:`,
        imageUrl: card?.imageUrl,
        color: COLORS.success,
        lines: lines.length ? lines : ['Никто не успел поучаствовать.']
      }),
      { files: card?.files, allowedMentions: { users: loot.slice(0, 10).map((entry) => entry.id) } }
    ))
    .catch(() => null);
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('босс')
      .setDescription('Сервер-босс: общий рейд чата')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('старт')
          .setDescription('Призвать босса (только админ)')
          .addStringOption((option) => option.setName('имя').setDescription('Имя босса').setMaxLength(60))
          .addIntegerOption((option) => option.setName('хп').setDescription('Здоровье босса (по умолчанию 10000)').setMinValue(100).setMaxValue(10000000))
          .addIntegerOption((option) => option.setName('награда').setDescription('Банк монет за победу (по умолчанию 5000)').setMinValue(0).setMaxValue(10000000))
      )
      .addSubcommand((subcommand) => subcommand.setName('статус').setDescription('Сколько HP осталось у босса')),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const { store } = context;
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'старт') {
        if (!canAdmin(interaction)) return reply(interaction, errorPanel('Нужны права управления сервером.'), { ephemeral: true });
        const current = store.getBoss(interaction.guildId);
        if (current?.active) return reply(interaction, errorPanel(`Босс **${current.name}** ещё жив (${current.hp} HP). Добейте его сначала!`), { ephemeral: true });

        const boss = store.startBoss(interaction.guildId, {
          name: interaction.options.getString('имя'),
          maxHp: interaction.options.getInteger('хп'),
          reward: interaction.options.getInteger('награда'),
          channelId: interaction.channelId
        });
        await store.save();
        // Публичный анонс в канал призыва.
        await interaction.channel?.send(componentPayload(bossStatusPanel(boss), { allowedMentions: { parse: [] } })).catch(() => null);
        return reply(interaction, successPanel(`Босс **${boss.name}** призван! ⚔️`, 'Рейд'), { ephemeral: true });
      }

      // статус
      const boss = store.getBoss(interaction.guildId);
      if (!boss) return reply(interaction, errorPanel('Босса ещё ни разу не призывали. Админ: `/босс старт`.'), { ephemeral: true });
      return reply(interaction, bossStatusPanel(boss), { ephemeral: false });
    }
  }
];

module.exports = {
  commands,
  announceDefeat
};
