const { SlashCommandBuilder } = require('discord.js');
const { COLORS, ICONS, ButtonStyle, button, componentPayload, errorPanel, mediaPanel, panel, reply, select, update } = require('../ui/components');
const { compactThumbnail, displayName, mentionUser, timeAgo } = require('../utils/format');
const { buildDropCard } = require('../services/profileCard');
const quests = require('../services/quests');

const CASE_TYPES = [
  { name: 'Обычный', value: 'common' },
  { name: 'Редкий', value: 'rare' },
  { name: 'Эпический', value: 'epic' },
  { name: 'Легендарный', value: 'legendary' }
];

// Таблицы лута. weight — относительный вес; rarity (необязательно) переопределяет
// редкость карты дропа для конкретного приза (джекпот из обычного кейса всё равно
// рисуется золотой легендарной картой). Без rarity берётся редкость самого кейса.
const CASE_LOOT = {
  common: [
    { weight: 45, type: 'coins', amount: 120, label: '120 монет' },
    { weight: 28, type: 'coins', amount: 250, label: '250 монет' },
    { weight: 14, type: 'xp', amount: 80, label: '80 XP' },
    { weight: 8, type: 'snowballs', amount: 5, label: '5 снежков' },
    { weight: 4, type: 'case', caseType: 'rare', amount: 1, label: '1 редкий кейс', rarity: 'rare' },
    { weight: 1, type: 'rolePass', amount: 1, label: 'купон личной роли', rarity: 'legendary' }
  ],
  rare: [
    { weight: 35, type: 'coins', amount: 500, label: '500 монет' },
    { weight: 23, type: 'xp', amount: 220, label: '220 XP' },
    { weight: 12, type: 'snowballs', amount: 10, label: '10 снежков' },
    { weight: 15, type: 'case', caseType: 'common', amount: 2, label: '2 обычных кейса', rarity: 'common' },
    { weight: 8, type: 'lotus', amount: 1, label: '1 лотус', rarity: 'epic' },
    { weight: 5, type: 'rolePass', amount: 1, label: 'купон личной роли', rarity: 'legendary' },
    { weight: 2, type: 'case', caseType: 'epic', amount: 1, label: '1 эпический кейс', rarity: 'epic' }
  ],
  epic: [
    { weight: 30, type: 'coins', amount: 1500, label: '1500 монет' },
    { weight: 22, type: 'xp', amount: 600, label: '600 XP' },
    { weight: 16, type: 'lotus', amount: 2, label: '2 лотуса', rarity: 'epic' },
    { weight: 15, type: 'case', caseType: 'rare', amount: 2, label: '2 редких кейса', rarity: 'rare' },
    { weight: 12, type: 'rolePass', amount: 1, label: 'купон личной роли', rarity: 'legendary' },
    { weight: 5, type: 'case', caseType: 'legendary', amount: 1, label: '1 легендарный кейс', rarity: 'legendary' }
  ],
  legendary: [
    { weight: 28, type: 'coins', amount: 4000, label: '4000 монет' },
    { weight: 20, type: 'xp', amount: 1500, label: '1500 XP' },
    { weight: 20, type: 'lotus', amount: 5, label: '5 лотусов', rarity: 'epic' },
    { weight: 17, type: 'rolePass', amount: 2, label: '2 купона личной роли', rarity: 'legendary' },
    { weight: 10, type: 'case', caseType: 'epic', amount: 2, label: '2 эпических кейса', rarity: 'epic' },
    { weight: 5, type: 'coins', amount: 10000, label: '10000 монет (джекпот)', rarity: 'legendary' }
  ]
};

// Иконка предмета дропа по типу приза (для карты дропа — ключи assets/icons).
const PRIZE_ICON = { coins: 'coins', xp: 'level', case: 'case', rolePass: 'case', lotus: 'lotus', snowballs: 'snow' };

// Эмодзи приза по типу (для текстовых строк панелей — Components v2 не встраивает картинки).
const PRIZE_EMOJI = { coins: ICONS.coins, xp: ICONS.xp, case: ICONS.cases, rolePass: '🎟️', lotus: ICONS.lotus, snowballs: ICONS.snow };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Редкость карты для конкретного приза: собственная rarity приза → fallback на тип кейса.
function prizeRarity(prize, type) {
  return prize.rarity || type;
}

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function prizeValueText(prize) {
  if (prize.type === 'coins') return `+${Number(prize.amount).toLocaleString('ru-RU')} мон.`;
  if (prize.type === 'xp') return `+${Number(prize.amount)} XP`;
  if (prize.type === 'lotus') return `+${Number(prize.amount)} 🌸`;
  if (prize.type === 'snowballs') return `+${Number(prize.amount)} ❄️`;
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

  if (prize.type === 'lotus') {
    profile.lotuses = Number(profile.lotuses || 0) + prize.amount;
  }

  if (prize.type === 'snowballs') {
    profile.snowballs = Number(profile.snowballs || 0) + prize.amount;
  }
}

function caseLabel(type) {
  return CASE_TYPES.find((item) => item.value === type)?.name || type;
}

function prizeEmoji(prize) {
  return PRIZE_EMOJI[prize.type] || ICONS.star;
}

// Строки шансов: вес → %, по убыванию.
function oddsLines(type) {
  const loot = CASE_LOOT[type] || [];
  const total = loot.reduce((sum, item) => sum + item.weight, 0) || 1;
  return loot
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((item) => {
      const pct = (item.weight / total) * 100;
      const pctText = pct >= 10 ? pct.toFixed(0) : pct.toFixed(1);
      return `${prizeEmoji(item)} **${item.label}** — ${pctText}%`;
    });
}

function oddsPanel(type) {
  return panel({
    title: `Шансы — ${caseLabel(type)} кейс`,
    icon: ICONS.games,
    eyebrow: 'Кейсы Onix',
    description: 'Вероятность выпадения призов:',
    color: COLORS.economy,
    lines: oddsLines(type),
    footer: 'Сумма ≈ 100%. Чем реже приз — тем меньше шанс.'
  });
}

// Кадр «рулетки» при вскрытии кейса (анимация через серию правок сообщения).
function spinFramePanel(type, label) {
  return panel({
    title: 'Открытие кейса',
    icon: ICONS.casino,
    eyebrow: `${caseLabel(type)} кейс`,
    description: `🎰 Вскрываем…\n\n> ${ICONS.star} **${label}**`,
    color: COLORS.economy
  });
}

function randomLootLabel(type) {
  const loot = CASE_LOOT[type] || [];
  return loot[Math.floor(Math.random() * loot.length)]?.label || '???';
}

// Прокрутка кадров: 3 «случайных» лейбла с задержкой, через editFrame(panel).
async function spinReveal(type, editFrame) {
  for (let i = 0; i < 3; i += 1) {
    await sleep(550);
    await editFrame(spinFramePanel(type, randomLootLabel(type)));
  }
  await sleep(600);
}

function casesInventoryPanel(target, profile) {
  return panel({
    title: `Инвентарь кейсов — ${displayName(target)}`,
    icon: ICONS.cases,
    eyebrow: 'Кейсы Onix',
    description: mentionUser(target.id),
    thumbnail: compactThumbnail(target),
    color: COLORS.economy,
    stats: CASE_TYPES.map((item) => ({ icon: ICONS.cases, name: item.name, value: profile.cases[item.value] || 0 }))
  });
}

function caseHistoryPanel(context, guildId, target) {
  const history = context.store.caseHistoryFor(guildId, target.id, 10);
  return panel({
    title: `История кейсов — ${displayName(target)}`,
    icon: ICONS.cases,
    eyebrow: 'Кейсы Onix',
    description: mentionUser(target.id),
    color: COLORS.economy,
    thumbnail: compactThumbnail(target),
    lines: history.length
      ? history.map((item) => `${ICONS.star} **${caseLabel(item.caseType)}** — ${item.prize}\n-# ${timeAgo(item.createdAt)}`)
      : ['История кейсов пока пустая.']
  });
}

// Открытие кейсов — общая логика для slash `/case открыть` и кнопки панели.
async function openCases(interaction, context, type, amount, { toChannel = false } = {}) {
  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  profile.cases[type] = Number(profile.cases[type] || 0);

  if (profile.cases[type] < amount) {
    const warn = panel({
      title: 'Открытие кейса',
      icon: ICONS.cases,
      eyebrow: 'Кейсы Onix',
      description: `${mentionUser(interaction.user.id)}, кажется, у вас закончились кейсы.\nЗагляните позже за голосовую активность или купите кейс в магазине.`,
      color: COLORS.warning,
      thumbnail: compactThumbnail(interaction.user),
      footer: `Нужно: ${amount} • Доступно: ${profile.cases[type]}`
    });
    // Из панели: заменяем эфемерный селект сообщением об ошибке (остаётся эфемерным).
    if (toChannel) {
      await interaction.update(componentPayload(warn)).catch(() => null);
      return;
    }
    return reply(interaction, warn, { ephemeral: false });
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

  quests.progress(profile, 'case', amount);
  await context.store.save();

  const prizeLines = [...prizes.entries()].map(([label, count]) =>
    count > 1 ? `**${label}** x${count}` : `**${label}**`
  );

  const dropCard = amount === 1 && lastPrize
    ? await buildDropCard({
      rarity: prizeRarity(lastPrize, type),
      itemName: lastPrize.label,
      itemKind: PRIZE_ICON[lastPrize.type] || 'case',
      valueText: prizeValueText(lastPrize),
      fromCase: `${caseLabel(type)} кейс`
    })
    : null;

  const result = mediaPanel({
    title: 'Открытие кейса',
    icon: ICONS.gift,
    eyebrow: `${caseLabel(type)} кейс`,
    description: `${mentionUser(interaction.user.id)}, ваш дроп:`,
    color: COLORS.economy,
    imageUrl: dropCard?.imageUrl,
    lines: prizeLines.map((line) => `${ICONS.star} ${line}`),
    footer: `Осталось таких кейсов: ${profile.cases[type]}`
  });

  // Одиночное открытие — анимация-«рулетка» (серия правок сообщения), затем дроп.
  if (amount === 1) {
    // Из панели (эфемерный селект): ack тизером, рулетку и финал шлём публично в канал.
    if (toChannel) {
      await update(interaction, spinFramePanel(type, randomLootLabel(type))).catch(() => null);
      const msg = await interaction.channel?.send(componentPayload(spinFramePanel(type, randomLootLabel(type)))).catch(() => null);
      if (msg) {
        await spinReveal(type, (frame) => msg.edit(componentPayload(frame)).catch(() => null));
        await msg.edit(componentPayload(result, { files: dropCard?.files })).catch(() => null);
        await interaction.editReply(componentPayload(panel({
          title: 'Кейс открыт',
          icon: ICONS.gift,
          eyebrow: 'Кейсы Onix',
          description: 'Результат — в канале ниже.',
          color: COLORS.economy
        }))).catch(() => null);
      } else {
        // Канал недоступен — отдаём результат прямо в ответ.
        await update(interaction, result, { files: dropCard?.files }).catch(() => null);
      }
      return;
    }

    // Slash-путь: тизер-ack, затем правки того же ответа до финального дропа.
    await reply(interaction, spinFramePanel(type, randomLootLabel(type)));
    await spinReveal(type, (frame) => interaction.editReply(componentPayload(frame)).catch(() => null));
    await interaction.editReply(componentPayload(result, { files: dropCard?.files })).catch(() => null);
    return;
  }

  // Массовое открытие — сводка без анимации.
  return reply(interaction, result, { files: dropCard?.files });
}

// Статичная панель кейсов (публикуется /панель).
function hubPanel(imageUrl) {
  return panel({
    imageUrl,
    title: 'Кейсы',
    icon: ICONS.cases,
    eyebrow: 'Кейсы Onix',
    description: 'Открывай кейсы (4 типа), собирай монеты, опыт, лотусы и снежки. Смотри инвентарь, шансы и историю призов.',
    color: COLORS.economy,
    footer: 'Кнопка «Открыть» открывает один кейс выбранного типа с анимацией. Массовое открытие — через `/case открыть`.',
    actions: [
      button('case:hub:open', '🎁 Открыть кейс', ButtonStyle.Success),
      button('case:hub:odds', '🎲 Шансы', ButtonStyle.Secondary),
      button('case:hub:inventory', '🎴 Инвентарь', ButtonStyle.Secondary),
      button('case:hub:history', '📜 История', ButtonStyle.Secondary)
    ]
  });
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
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('шансы')
          .setDescription('Шансы выпадения призов из кейса')
          .addStringOption((option) =>
            option
              .setName('тип')
              .setDescription('Тип кейса')
              .addChoices(...CASE_TYPES)
          )
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'инвентарь') {
        const target = interaction.options.getUser('user') || interaction.user;
        const profile = context.store.ensureUser(interaction.guildId, target);
        await context.store.save();
        return reply(interaction, casesInventoryPanel(target, profile), { ephemeral: true });
      }

      if (subcommand === 'открыть') {
        const type = interaction.options.getString('тип') || 'common';
        const amount = interaction.options.getInteger('количество') || 1;
        return openCases(interaction, context, type, amount);
      }

      if (subcommand === 'шансы') {
        const type = interaction.options.getString('тип') || 'common';
        return reply(interaction, oddsPanel(type), { ephemeral: true });
      }

      const target = interaction.options.getUser('user') || interaction.user;
      context.store.ensureUser(interaction.guildId, target);
      await context.store.save();
      return reply(interaction, caseHistoryPanel(context, interaction.guildId, target), { ephemeral: true });
    }
  }
];

async function handleComponent(interaction, context) {
  const isStringSel = interaction.isStringSelectMenu?.();
  if (!interaction.isButton() && !isStringSel) return false;
  if (!interaction.customId.startsWith('case:hub')) return false;

  const guildError = requireGuild(interaction);
  if (guildError) {
    await reply(interaction, errorPanel(guildError), { ephemeral: true });
    return true;
  }

  const sub = interaction.customId.split(':')[2];

  if (sub === 'inventory') {
    const profile = context.store.ensureUser(interaction.guildId, interaction.user);
    await reply(interaction, casesInventoryPanel(interaction.user, profile), { ephemeral: true });
    return true;
  }
  if (sub === 'history') {
    context.store.ensureUser(interaction.guildId, interaction.user);
    await reply(interaction, caseHistoryPanel(context, interaction.guildId, interaction.user), { ephemeral: true });
    return true;
  }
  if (sub === 'open') {
    await reply(interaction, panel({
      title: 'Открыть кейс',
      icon: ICONS.cases,
      eyebrow: 'Кейсы Onix',
      description: 'Выбери тип кейса — откроется один.',
      color: COLORS.economy,
      actions: [select('case:hub:open-pick', 'Тип кейса', CASE_TYPES.map((item) => ({ label: item.name, value: item.value })))]
    }), { ephemeral: true });
    return true;
  }
  if (sub === 'open-pick') {
    await openCases(interaction, context, interaction.values[0], 1, { toChannel: true });
    return true;
  }
  if (sub === 'odds') {
    await reply(interaction, panel({
      title: 'Шансы кейсов',
      icon: ICONS.games,
      eyebrow: 'Кейсы Onix',
      description: 'Выбери тип кейса — покажу вероятности призов.',
      color: COLORS.economy,
      actions: [select('case:hub:odds-pick', 'Тип кейса', CASE_TYPES.map((item) => ({ label: item.name, value: item.value })))]
    }), { ephemeral: true });
    return true;
  }
  if (sub === 'odds-pick') {
    await update(interaction, oddsPanel(interaction.values[0])).catch(() => null);
    return true;
  }

  return false;
}

module.exports = {
  commands,
  handleComponent,
  hubPanel
};
