const { SlashCommandBuilder } = require('discord.js');
const { COLORS, ICONS, errorPanel, mediaPanel, panel, reply } = require('../ui/components');
const { compactThumbnail, displayName, mentionUser, timeAgo } = require('../utils/format');
const { buildDropCard } = require('../services/profileCard');

const CASE_TYPES = [
  { name: 'Обычный', value: 'common' },
  { name: 'Редкий', value: 'rare' },
  { name: 'Эпический', value: 'epic' }
];

const CASE_LOOT = {
  common: [
    { weight: 50, type: 'coins', amount: 120, label: '120 монет' },
    { weight: 30, type: 'coins', amount: 250, label: '250 монет' },
    { weight: 15, type: 'xp', amount: 80, label: '80 XP' },
    { weight: 5, type: 'case', caseType: 'rare', amount: 1, label: '1 редкий кейс' }
  ],
  rare: [
    { weight: 40, type: 'coins', amount: 500, label: '500 монет' },
    { weight: 25, type: 'xp', amount: 220, label: '220 XP' },
    { weight: 25, type: 'case', caseType: 'common', amount: 2, label: '2 обычных кейса' },
    { weight: 10, type: 'rolePass', amount: 1, label: 'купон личной роли' }
  ],
  epic: [
    { weight: 35, type: 'coins', amount: 1500, label: '1500 монет' },
    { weight: 25, type: 'xp', amount: 600, label: '600 XP' },
    { weight: 20, type: 'case', caseType: 'rare', amount: 2, label: '2 редких кейса' },
    { weight: 20, type: 'rolePass', amount: 1, label: 'купон личной роли' }
  ]
};

// Иконка предмета дропа по типу приза (для карты дропа).
const PRIZE_ICON = { coins: 'coins', xp: 'level', case: 'case', rolePass: 'case' };

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function prizeValueText(prize) {
  if (prize.type === 'coins') return `+${Number(prize.amount).toLocaleString('ru-RU')} мон.`;
  if (prize.type === 'xp') return `+${Number(prize.amount)} XP`;
  return prize.label;
}

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items.at(-1);
}

function applyPrize(context, guildId, user, profile, prize) {
  if (prize.type === 'coins') {
    profile.balance += prize.amount;
    context.store.recordTransaction(guildId, {
      type: 'case',
      toId: user.id,
      amount: prize.amount,
      note: 'case prize'
    });
  }

  if (prize.type === 'xp') {
    profile.xp += prize.amount;
  }

  if (prize.type === 'case') {
    profile.cases[prize.caseType] = Number(profile.cases[prize.caseType] || 0) + prize.amount;
  }

  if (prize.type === 'rolePass') {
    profile.rolePasses = Number(profile.rolePasses || 0) + prize.amount;
  }
}

function caseLabel(type) {
  return CASE_TYPES.find((item) => item.value === type)?.name || type;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('case')
      .setDescription('Кейсы')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('инвентарь')
          .setDescription('Посмотреть количество кейсов')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь'))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('открыть')
          .setDescription('Открыть кейс')
          .addStringOption((option) =>
            option
              .setName('тип')
              .setDescription('Тип кейса')
              .addChoices(...CASE_TYPES)
          )
          .addIntegerOption((option) =>
            option
              .setName('количество')
              .setDescription('Сколько кейсов открыть')
              .setMinValue(1)
              .setMaxValue(10)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('история')
          .setDescription('История призов с кейсов')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь'))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'инвентарь') {
        const target = interaction.options.getUser('user') || interaction.user;
        const profile = context.store.ensureUser(interaction.guildId, target);
        await context.store.save();

        return reply(
          interaction,
          panel({
            title: `Инвентарь кейсов — ${displayName(target)}`,
            icon: ICONS.cases,
            eyebrow: 'Кейсы Onix',
            description: mentionUser(target.id),
            thumbnail: compactThumbnail(target),
            color: COLORS.economy,
            stats: CASE_TYPES.map((item) => ({ icon: ICONS.cases, name: item.name, value: profile.cases[item.value] || 0 }))
          }),
          { ephemeral: true }
        );
      }

      if (subcommand === 'открыть') {
        const type = interaction.options.getString('тип') || 'common';
        const amount = interaction.options.getInteger('количество') || 1;
        const profile = context.store.ensureUser(interaction.guildId, interaction.user);
        profile.cases[type] = Number(profile.cases[type] || 0);

        if (profile.cases[type] < amount) {
          return reply(
            interaction,
            panel({
              title: 'Открытие кейса',
              icon: ICONS.cases,
              eyebrow: 'Кейсы Onix',
              description: `${mentionUser(interaction.user.id)}, кажется, у вас закончились кейсы.\nЗагляните позже за голосовую активность или купите кейс в магазине.`,
              color: COLORS.warning,
              thumbnail: compactThumbnail(interaction.user),
              footer: `Нужно: ${amount} • Доступно: ${profile.cases[type]}`
            }),
            { ephemeral: false }
          );
        }

        profile.cases[type] -= amount;
        const prizes = new Map();
        let lastPrize = null;

        for (let index = 0; index < amount; index += 1) {
          const prize = pickWeighted(CASE_LOOT[type]);
          lastPrize = prize;
          applyPrize(context, interaction.guildId, interaction.user, profile, prize);
          prizes.set(prize.label, (prizes.get(prize.label) || 0) + 1);
          context.store.addCaseHistory(interaction.guildId, {
            userId: interaction.user.id,
            caseType: type,
            prize: prize.label
          });
        }

        await context.store.save();

        const prizeLines = [...prizes.entries()].map(([label, count]) =>
          count > 1 ? `**${label}** x${count}` : `**${label}**`
        );

        // Одиночное открытие — крупная карта дропа с редкостью по типу кейса.
        // Множественное — список призов на текстовой панели.
        const dropCard = amount === 1 && lastPrize
          ? await buildDropCard({
            rarity: type,
            itemName: lastPrize.label,
            itemKind: PRIZE_ICON[lastPrize.type] || 'case',
            valueText: prizeValueText(lastPrize),
            fromCase: `${caseLabel(type)} кейс`
          })
          : null;

        return reply(
          interaction,
          mediaPanel({
            title: 'Открытие кейса',
            icon: ICONS.gift,
            eyebrow: `${caseLabel(type)} кейс`,
            description: `${mentionUser(interaction.user.id)}, ваш дроп:`,
            color: COLORS.economy,
            imageUrl: dropCard?.imageUrl,
            lines: prizeLines.map((line) => `${ICONS.star} ${line}`),
            footer: `Осталось таких кейсов: ${profile.cases[type]}`
          }),
          { files: dropCard?.files }
        );
      }

      const target = interaction.options.getUser('user') || interaction.user;
      context.store.ensureUser(interaction.guildId, target);
      const history = context.store.caseHistoryFor(interaction.guildId, target.id, 10);
      await context.store.save();

      return reply(
        interaction,
        panel({
          title: `История кейсов — ${displayName(target)}`,
          icon: ICONS.cases,
          eyebrow: 'Кейсы Onix',
          description: mentionUser(target.id),
          color: COLORS.economy,
          thumbnail: compactThumbnail(target),
          lines: history.length
            ? history.map((item) => `${ICONS.star} **${caseLabel(item.caseType)}** — ${item.prize}\n-# ${timeAgo(item.createdAt)}`)
            : ['История кейсов пока пустая.']
        }),
        { ephemeral: true }
      );
    }
  }
];

module.exports = {
  commands
};
