const { SlashCommandBuilder } = require('discord.js');
const { COLORS, ICONS, ButtonStyle, button, errorPanel, mediaPanel, panel, reply, update } = require('../ui/components');
const { displayName, formatCoins, mentionUser, timeAgo } = require('../utils/format');
const { buildResultCard } = require('../services/profileCard');
const quests = require('../services/quests');

function formatSigned(value) {
  const n = Number(value || 0);
  if (n > 0) return `+${n.toLocaleString('ru-RU')}`;
  if (n < 0) return `-${Math.abs(n).toLocaleString('ru-RU')}`;
  return '±0';
}

const SLOT_SYMBOLS = [
  { name: '🍒 Вишня', weight: 30, multiplier: 3 },
  { name: '🍋 Лимон', weight: 24, multiplier: 4 },
  { name: '🍉 Арбуз', weight: 18, multiplier: 5 },
  { name: '🟣 Слива', weight: 14, multiplier: 6 },
  { name: 'BAR', weight: 9, multiplier: 8 },
  { name: '7', weight: 5, multiplier: 12 }
];

const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items.at(-1);
}

function casinoLevel(stats) {
  const games = Number(stats?.games || 0);
  if (games >= 250) return 'Хайроллер';
  if (games >= 100) return 'Игрок клуба';
  if (games >= 25) return 'Завсегдатай';
  return 'Новичок казино';
}

function safeBet(value) {
  return Math.max(1, Math.min(1_000_000, Number(value || 0)));
}

function gameLabel(game) {
  return {
    slots: 'Слоты',
    dice: 'Кости',
    roulette: 'Рулетка',
    lots: 'Лоты'
  }[game] || 'Казино';
}

function extraLabel(game, extra) {
  if (game === 'dice') {
    return { high: 'больше 7', low: 'меньше 7', seven: 'ровно 7' }[extra] || 'больше 7';
  }
  if (game === 'roulette') {
    return { red: 'красное', black: 'черное', even: 'чет', odd: 'нечет', zero: 'зеро' }[extra] || 'красное';
  }
  return 'обычный режим';
}

function casinoMenuPanel(user, profile, game = 'slots', bet = 100, extra = 'none') {
  const safeGame = ['slots', 'dice', 'roulette', 'lots'].includes(game) ? game : 'slots';
  const safeExtra = extra === 'none' ? (safeGame === 'dice' ? 'high' : safeGame === 'roulette' ? 'red' : 'none') : extra;
  const isLots = safeGame === 'lots';
  const currentPrice = isLots ? `${bet} лот. x 150 мон.` : formatCoins(bet);
  // Хвост-тег роли кнопки (:m/:b/:g) делает customId уникальным между группами —
  // иначе активная игра-кнопка совпадает с кнопкой ставки/режима (дубль custom_id).
  const modeButtons = safeGame === 'dice'
    ? [
        button(`casino:menu:${user.id}:dice:${bet}:high:m`, 'Больше 7', ButtonStyle.Secondary, safeExtra === 'high'),
        button(`casino:menu:${user.id}:dice:${bet}:low:m`, 'Меньше 7', ButtonStyle.Secondary, safeExtra === 'low'),
        button(`casino:menu:${user.id}:dice:${bet}:seven:m`, 'Ровно 7', ButtonStyle.Secondary, safeExtra === 'seven')
      ]
    : safeGame === 'roulette'
      ? [
          button(`casino:menu:${user.id}:roulette:${bet}:red:m`, 'Красное', ButtonStyle.Secondary, safeExtra === 'red'),
          button(`casino:menu:${user.id}:roulette:${bet}:black:m`, 'Черное', ButtonStyle.Secondary, safeExtra === 'black'),
          button(`casino:menu:${user.id}:roulette:${bet}:even:m`, 'Чет', ButtonStyle.Secondary, safeExtra === 'even'),
          button(`casino:menu:${user.id}:roulette:${bet}:odd:m`, 'Нечет', ButtonStyle.Secondary, safeExtra === 'odd'),
          button(`casino:menu:${user.id}:roulette:${bet}:zero:m`, 'Зеро', ButtonStyle.Secondary, safeExtra === 'zero')
        ]
      : [];

  const betButtons = isLots
    ? [
        button(`casino:menu:${user.id}:${safeGame}:1:${safeExtra}:b`, '1 лот', ButtonStyle.Secondary, bet === 1),
        button(`casino:menu:${user.id}:${safeGame}:3:${safeExtra}:b`, '3 лота', ButtonStyle.Secondary, bet === 3),
        button(`casino:menu:${user.id}:${safeGame}:5:${safeExtra}:b`, '5 лотов', ButtonStyle.Secondary, bet === 5),
        button(`casino:menu:${user.id}:${safeGame}:10:${safeExtra}:b`, '10 лотов', ButtonStyle.Secondary, bet === 10)
      ]
    : [
        button(`casino:menu:${user.id}:${safeGame}:100:${safeExtra}:b`, '100', ButtonStyle.Secondary, bet === 100),
        button(`casino:menu:${user.id}:${safeGame}:500:${safeExtra}:b`, '500', ButtonStyle.Secondary, bet === 500),
        button(`casino:menu:${user.id}:${safeGame}:1000:${safeExtra}:b`, '1 000', ButtonStyle.Secondary, bet === 1000),
        button(`casino:menu:${user.id}:${safeGame}:5000:${safeExtra}:b`, '5 000', ButtonStyle.Secondary, bet === 5000)
      ];

  return panel({
    title: 'ONIX CASINO',
    icon: ICONS.casino,
    eyebrow: 'Казино Onix',
    description: `${mentionUser(user.id)}, выбери игру и ставку через кнопки.`,
    color: COLORS.games,
    thumbnail: user.displayAvatarURL({ size: 256 }),
    stats: [
      { icon: ICONS.casino, name: 'Игра', value: gameLabel(safeGame) },
      { icon: ICONS.coins, name: isLots ? 'Лоты' : 'Ставка', value: currentPrice },
      { icon: ICONS.fire, name: 'Режим', value: extraLabel(safeGame, safeExtra) },
      { icon: ICONS.economy, name: 'Баланс', value: formatCoins(profile.balance) }
    ],
    statColumns: 2,
    actions: [
      button(`casino:menu:${user.id}:slots:${isLots ? 100 : bet}:none:g`, 'Слоты', ButtonStyle.Primary, safeGame === 'slots'),
      button(`casino:menu:${user.id}:dice:${isLots ? 100 : bet}:high:g`, 'Кости', ButtonStyle.Primary, safeGame === 'dice'),
      button(`casino:menu:${user.id}:roulette:${isLots ? 100 : bet}:red:g`, 'Рулетка', ButtonStyle.Primary, safeGame === 'roulette'),
      button(`casino:menu:${user.id}:lots:3:none:g`, 'Лоты', ButtonStyle.Primary, safeGame === 'lots'),
      ...betButtons,
      ...modeButtons,
      button(`casino:play:${user.id}:${safeGame}:${bet}:${safeExtra}`, 'Играть', ButtonStyle.Success),
      button(`casino:stats:${user.id}:${safeGame}:${bet}:${safeExtra}`, 'Статистика', ButtonStyle.Secondary)
    ]
  });
}

function playSlots(bet) {
  const rolls = [weightedPick(SLOT_SYMBOLS), weightedPick(SLOT_SYMBOLS), weightedPick(SLOT_SYMBOLS)];
  const names = rolls.map((item) => item.name);
  const counts = names.reduce((map, name) => map.set(name, (map.get(name) || 0) + 1), new Map());
  const best = Math.max(...counts.values());
  let payout = 0;
  let result = 'Пустой спин';

  if (best === 3) {
    const symbol = rolls[0];
    payout = bet * symbol.multiplier;
    result = `Три ${symbol.name}`;
  } else if (best === 2) {
    payout = Math.floor(bet * 1.35);
    result = 'Пара символов';
  }

  return {
    game: 'slots',
    title: 'Казино: слоты',
    bet,
    payout,
    details: names.join(' | '),
    lines: [
      `**Барабаны:** ${names.join(' | ')}`,
      `**Результат:** ${result}`,
      `**Выплата:** ${formatCoins(payout)}`
    ],
    repeat: `casino:repeat:slots:${bet}:none`
  };
}

function playDice(bet, target) {
  const first = Math.floor(Math.random() * 6) + 1;
  const second = Math.floor(Math.random() * 6) + 1;
  const sum = first + second;
  const mode = ['high', 'low', 'seven'].includes(target) ? target : 'high';
  const won = (mode === 'high' && sum > 7) || (mode === 'low' && sum < 7) || (mode === 'seven' && sum === 7);
  const payout = won ? Math.floor(bet * (mode === 'seven' ? 5 : 1.9)) : 0;
  const labels = {
    high: 'больше 7',
    low: 'меньше 7',
    seven: 'ровно 7'
  };

  return {
    game: 'dice',
    title: 'Казино: кости',
    bet,
    payout,
    details: `${first}+${second}=${sum}, цель ${labels[mode]}`,
    lines: [
      `**Кости:** ${first} + ${second} = **${sum}**`,
      `**Цель:** ${labels[mode]}`,
      `**Выплата:** ${formatCoins(payout)}`
    ],
    menuExtra: mode,
    repeat: `casino:repeat:dice:${bet}:${mode}`
  };
}

function rouletteColor(number) {
  if (number === 0) return 'green';
  return ROULETTE_RED.has(number) ? 'red' : 'black';
}

function playRoulette(bet, type, pickedNumber) {
  const number = Math.floor(Math.random() * 37);
  const color = rouletteColor(number);
  const mode = ['red', 'black', 'even', 'odd', 'zero', 'number'].includes(type) ? type : 'red';
  const choiceNumber = Math.max(0, Math.min(36, Number(pickedNumber || 0)));
  const won =
    (mode === 'red' && color === 'red') ||
    (mode === 'black' && color === 'black') ||
    (mode === 'even' && number !== 0 && number % 2 === 0) ||
    (mode === 'odd' && number % 2 === 1) ||
    (mode === 'zero' && number === 0) ||
    (mode === 'number' && number === choiceNumber);
  const payout = won ? bet * (mode === 'number' || mode === 'zero' ? 36 : 2) : 0;
  const labels = {
    red: 'красное',
    black: 'черное',
    even: 'чет',
    odd: 'нечет',
    zero: 'зеро',
    number: `число ${choiceNumber}`
  };
  const colorLabels = {
    red: 'красное',
    black: 'черное',
    green: 'зеро'
  };

  return {
    game: 'roulette',
    title: 'Казино: рулетка',
    bet,
    payout,
    details: `${number} ${colorLabels[color]}, ставка ${labels[mode]}`,
    lines: [
      `**Выпало:** ${number} (${colorLabels[color]})`,
      `**Ставка:** ${labels[mode]}`,
      `**Выплата:** ${formatCoins(payout)}`
    ],
    menuExtra: mode,
    repeat: `casino:repeat:roulette:${bet}:${mode}-${choiceNumber}`
  };
}

function playLots(ticketCount) {
  const tickets = Math.max(1, Math.min(10, Number(ticketCount || 1)));
  const price = 150;
  const bet = tickets * price;
  const loot = [
    { weight: 50, label: 'пусто', payout: 0 },
    { weight: 25, label: 'малый приз 100 мон.', payout: 100 },
    { weight: 15, label: 'приз 250 мон.', payout: 250 },
    { weight: 7, label: 'приз 600 мон.', payout: 600 },
    { weight: 2, label: 'обычный кейс', payout: 0, caseType: 'common', cases: 1 },
    { weight: 1, label: 'джекпот 3000 мон.', payout: 3000 }
  ];
  const prizes = [];
  let payout = 0;
  let commonCases = 0;

  for (let index = 0; index < tickets; index += 1) {
    const prize = weightedPick(loot);
    prizes.push(prize.label);
    payout += prize.payout || 0;
    commonCases += prize.cases || 0;
  }

  const grouped = prizes.reduce((map, label) => map.set(label, (map.get(label) || 0) + 1), new Map());
  return {
    game: 'lots',
    title: 'Казино: лоты',
    bet,
    payout,
    commonCases,
    details: `${tickets} лотов`,
    lines: [
      `**Куплено лотов:** ${tickets}`,
      `**Цена:** ${formatCoins(bet)}`,
      `**Выплата:** ${formatCoins(payout)}`,
      ...[...grouped.entries()].map(([label, count]) => `**${label}:** x${count}`)
    ],
    repeat: `casino:repeat:lots:${tickets}:none`
  };
}

async function resultPanel(user, profile, result) {
  const profit = result.payout - result.bet;
  const color = profit > 0 ? COLORS.success : profit < 0 ? COLORS.danger : COLORS.warning;
  const outcome = profit > 0 ? 'win' : profit < 0 ? 'lose' : 'draw';
  const backValue = result.game === 'lots' ? Math.max(1, Math.min(10, Math.floor(result.bet / 150))) : result.bet;
  const backExtra = result.menuExtra || 'none';

  // Карта исхода (картинка): крупный итог + дельта + факты.
  const card = await buildResultCard({
    user,
    outcome,
    title: result.title,
    delta: formatSigned(profit),
    lines: [
      `Ставка: ${Number(result.bet).toLocaleString('ru-RU')}`,
      `Выплата: ${Number(result.payout).toLocaleString('ru-RU')}`,
      `Баланс: ${Number(profile.balance).toLocaleString('ru-RU')}`
    ]
  });

  const components = mediaPanel({
    title: result.title,
    icon: profit > 0 ? ICONS.up : profit < 0 ? ICONS.down : ICONS.casino,
    eyebrow: 'Казино Onix',
    description: `${mentionUser(user.id)}, ${profit > 0 ? `прибыль **${formatCoins(profit)}**` : profit < 0 ? `проигрыш **${formatCoins(Math.abs(profit))}**` : 'ставка вернулась без прибыли'}.`,
    color,
    imageUrl: card?.imageUrl,
    footer: `Баланс: ${formatCoins(profile.balance)} • Статус: ${casinoLevel(profile.casinoStats)}`,
    actions: [
      button(`${result.repeat}:${user.id}`, 'Повторить', ButtonStyle.Primary),
      button(`casino:menu:${user.id}:${result.game}:${backValue}:${backExtra}`, 'Назад', ButtonStyle.Secondary),
      button(`casino:stats:${user.id}:${result.game}:${backValue}:${backExtra}`, 'Статистика', ButtonStyle.Secondary)
    ]
  });

  return { components, files: card?.files };
}

async function runCasino(interaction, context, payload, respond = reply) {
  const guildError = requireGuild(interaction);
  if (guildError) return respond(interaction, errorPanel(guildError), { ephemeral: true });

  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  let result;
  if (payload.game === 'slots') result = playSlots(safeBet(payload.bet));
  if (payload.game === 'dice') result = playDice(safeBet(payload.bet), payload.target);
  if (payload.game === 'roulette') result = playRoulette(safeBet(payload.bet), payload.type, payload.number);
  if (payload.game === 'lots') result = playLots(payload.tickets);
  if (!result) return respond(interaction, errorPanel('Такой режим казино не найден.'), { ephemeral: true });

  if (profile.balance < result.bet) {
    return respond(interaction, errorPanel(`Нужно **${formatCoins(result.bet)}**, на балансе **${formatCoins(profile.balance)}**.`), { ephemeral: true });
  }

  const updatedProfile = context.store.recordCasinoResult(interaction.guildId, interaction.user, {
    game: result.game,
    bet: result.bet,
    payout: result.payout,
    note: result.payout > result.bet ? 'casino win' : 'casino lose',
    details: result.details
  });

  if (result.commonCases) {
    updatedProfile.cases.common = Number(updatedProfile.cases.common || 0) + result.commonCases;
  }

  quests.progress(updatedProfile, 'casino');
  if (result.payout > result.bet) quests.progress(updatedProfile, 'casino_win');

  await context.store.save();

  // Рендер карты результата (canvas) может занять >3 сек. Для кнопок успеваем
  // подтвердить взаимодействие (deferUpdate, токен живёт 15 мин), иначе update
  // опоздает и Discord вернёт 10062. Слэш-команды подтвердить так нельзя.
  const isComponent = typeof interaction.isMessageComponent === 'function' && interaction.isMessageComponent();
  if (isComponent && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => null);
  }

  const { components, files } = await resultPanel(interaction.user, updatedProfile, result);
  return respond(interaction, components, { files });
}

function statsPanel(user, profile, back = null) {
  const stats = profile.casinoStats || {};
  const profit = Number(stats.totalPayout || 0) - Number(stats.totalBet || 0);
  const history = (stats.history || []).slice(0, 6);
  return panel({
    title: `Казино-профиль — ${displayName(user)}`,
    icon: ICONS.casino,
    eyebrow: 'Казино Onix',
    description: `${mentionUser(user.id)} • ${casinoLevel(stats)}`,
    color: COLORS.games,
    thumbnail: user.displayAvatarURL({ size: 256 }),
    stats: [
      { icon: ICONS.casino, name: 'Игр', value: String(stats.games || 0) },
      { icon: ICONS.fire, name: 'Победы / поражения', value: `${stats.wins || 0} / ${stats.losses || 0}` },
      { icon: ICONS.coins, name: 'Оборот', value: formatCoins(stats.totalBet || 0) },
      { icon: profit >= 0 ? ICONS.up : ICONS.down, name: 'Итог', value: `${profit >= 0 ? '+' : '-'}${formatCoins(Math.abs(profit))}` },
      { icon: ICONS.star, name: 'Крупнейший выигрыш', value: formatCoins(stats.biggestWin || 0) }
    ],
    statColumns: 2,
    lines: history.length
      ? history.map((item) => `**${item.game}:** ${item.profit >= 0 ? '+' : '-'}${formatCoins(Math.abs(item.profit))} • ${timeAgo(item.createdAt)}`)
      : ['История казино пока пустая.'],
    actions: back ? [button(back, 'Назад', ButtonStyle.Secondary)] : []
  });
}

// Статичная панель казино (публикуется /панель). Кнопка открывает личное меню кликнувшего.
function hubPanel(imageUrl) {
  return panel({
    imageUrl,
    title: 'ONIX CASINO',
    icon: ICONS.casino,
    eyebrow: 'Казино Onix',
    description: 'Слоты, кости, рулетка и лоты. Нажми «Открыть казино» — меню откроется лично для тебя.',
    color: COLORS.games,
    footer: 'Игра идёт на твои монеты. Меню и результаты видны только тебе.',
    actions: [
      button('casino:hub:open', '🎰 Открыть казино', ButtonStyle.Primary),
      button('casino:hub:stats', '📊 Статистика', ButtonStyle.Secondary)
    ]
  });
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('casino')
      .setDescription('Казино Onix: слоты, кости, рулетка и лоты')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('меню')
          .setDescription('Открыть меню казино с кнопками')
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('слоты')
          .setDescription('Прокрутить слоты')
          .addIntegerOption((option) => option.setName('ставка').setDescription('Ставка монет').setMinValue(10).setMaxValue(1_000_000))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('кости')
          .setDescription('Сыграть в кости')
          .addIntegerOption((option) => option.setName('ставка').setDescription('Ставка монет').setMinValue(10).setMaxValue(1_000_000))
          .addStringOption((option) =>
            option
              .setName('цель')
              .setDescription('На что ставим')
              .addChoices(
                { name: 'Больше 7', value: 'high' },
                { name: 'Меньше 7', value: 'low' },
                { name: 'Ровно 7', value: 'seven' }
              )
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('рулетка')
          .setDescription('Европейская рулетка 0-36')
          .addIntegerOption((option) => option.setName('ставка').setDescription('Ставка монет').setMinValue(10).setMaxValue(1_000_000))
          .addStringOption((option) =>
            option
              .setName('тип')
              .setDescription('Тип ставки')
              .addChoices(
                { name: 'Красное', value: 'red' },
                { name: 'Черное', value: 'black' },
                { name: 'Чет', value: 'even' },
                { name: 'Нечет', value: 'odd' },
                { name: 'Зеро', value: 'zero' },
                { name: 'Число', value: 'number' }
              )
          )
          .addIntegerOption((option) => option.setName('число').setDescription('Нужно только для ставки на число').setMinValue(0).setMaxValue(36))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('лоты')
          .setDescription('Купить моментальные лотерейные лоты')
          .addIntegerOption((option) => option.setName('количество').setDescription('От 1 до 10 лотов, 150 монет за штуку').setMinValue(1).setMaxValue(10))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('статистика')
          .setDescription('Показать казино-профиль')
          .addUserOption((option) => option.setName('пользователь').setDescription('Пользователь'))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
      const profile = context.store.ensureUser(interaction.guildId, interaction.user);
      if (subcommand === 'меню') {
        await context.store.save();
        return reply(interaction, casinoMenuPanel(interaction.user, profile));
      }

      if (subcommand === 'статистика') {
        const target = interaction.options.getUser('пользователь') || interaction.user;
        const targetProfile = context.store.ensureUser(interaction.guildId, target);
        await context.store.save();
        return reply(interaction, statsPanel(target, targetProfile, `casino:menu:${interaction.user.id}:slots:100:none`));
      }

      const payloads = {
        слоты: () => ({ game: 'slots', bet: interaction.options.getInteger('ставка') }),
        кости: () => ({ game: 'dice', bet: interaction.options.getInteger('ставка'), target: interaction.options.getString('цель') }),
        рулетка: () => ({
          game: 'roulette',
          bet: interaction.options.getInteger('ставка'),
          type: interaction.options.getString('тип'),
          number: interaction.options.getInteger('число') || 0
        }),
        лоты: () => ({ game: 'lots', tickets: interaction.options.getInteger('количество') })
      };

      const payload = payloads[subcommand]();
      if ((payload.game === 'slots' && !payload.bet) ||
        (payload.game === 'dice' && (!payload.bet || !payload.target)) ||
        (payload.game === 'roulette' && (!payload.bet || !payload.type)) ||
        (payload.game === 'lots' && !payload.tickets)) {
        const defaultGame = payload.game;
        const defaultBet = defaultGame === 'lots' ? 3 : (payload.bet || 100);
        const defaultExtra = payload.target || payload.type || (defaultGame === 'dice' ? 'high' : defaultGame === 'roulette' ? 'red' : 'none');
        return reply(interaction, casinoMenuPanel(interaction.user, profile, defaultGame, defaultBet, defaultExtra));
      }

      return runCasino(interaction, context, payload);
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('casino:')) return false;

  const parts = interaction.customId.split(':');

  // Кнопки статичной панели: открыть личное меню/статистику кликнувшего (эфемерно).
  if (parts[1] === 'hub') {
    const profile = context.store.ensureUser(interaction.guildId, interaction.user);
    await context.store.save();
    if (parts[2] === 'stats') {
      await reply(interaction, statsPanel(interaction.user, profile), { ephemeral: true });
    } else {
      await reply(interaction, casinoMenuPanel(interaction.user, profile), { ephemeral: true });
    }
    return true;
  }

  if (parts[1] === 'menu') {
    const [, , userId, game, valueRaw, extraRaw] = parts;
    if (interaction.user.id !== userId) {
      await reply(interaction, errorPanel('Это меню казино открыто для другого пользователя.'), { ephemeral: true });
      return true;
    }
    const profile = context.store.ensureUser(interaction.guildId, interaction.user);
    await update(interaction, casinoMenuPanel(interaction.user, profile, game, Number(valueRaw || 100), extraRaw || 'none'));
    return true;
  }

  if (parts[1] === 'play') {
    const [, , userId, game, valueRaw, extraRaw] = parts;
    if (interaction.user.id !== userId) {
      await reply(interaction, errorPanel('Эта ставка открыта для другого пользователя.'), { ephemeral: true });
      return true;
    }

    const payload = game === 'lots'
      ? { game, tickets: Number(valueRaw || 1) }
      : game === 'dice'
        ? { game, bet: Number(valueRaw || 100), target: extraRaw || 'high' }
        : game === 'roulette'
          ? { game, bet: Number(valueRaw || 100), type: extraRaw || 'red', number: 0 }
          : { game, bet: Number(valueRaw || 100) };
    await runCasino(interaction, context, payload, update);
    return true;
  }

  if (parts[1] === 'stats') {
    const userId = parts[2];
    if (parts[3] && interaction.user.id !== userId) {
      await reply(interaction, errorPanel('Эта кнопка статистики открыта для другого пользователя.'), { ephemeral: true });
      return true;
    }
    const target = await interaction.client.users.fetch(userId).catch(() => null);
    if (!target) {
      await reply(interaction, errorPanel('Пользователь не найден.'), { ephemeral: true });
      return true;
    }
    const profile = context.store.ensureUser(interaction.guildId, target);
    const back = parts[3] ? `casino:menu:${userId}:${parts[3]}:${parts[4] || 100}:${parts[5] || 'none'}` : null;
    await update(interaction, statsPanel(target, profile, back));
    return true;
  }

  if (parts[1] !== 'repeat') return false;
  const [, , game, valueRaw, extraRaw, userId] = parts;
  if (interaction.user.id !== userId) {
    await reply(interaction, errorPanel('Эта кнопка повторяет ставку другого пользователя.'), { ephemeral: true });
    return true;
  }

  if (game === 'slots') {
    await runCasino(interaction, context, { game, bet: Number(valueRaw) }, update);
    return true;
  }
  if (game === 'dice') {
    await runCasino(interaction, context, { game, bet: Number(valueRaw), target: extraRaw }, update);
    return true;
  }
  if (game === 'roulette') {
    const [type, numberRaw] = String(extraRaw || '').split('-');
    await runCasino(interaction, context, { game, bet: Number(valueRaw), type, number: Number(numberRaw || 0) }, update);
    return true;
  }
  if (game === 'lots') {
    await runCasino(interaction, context, { game, tickets: Number(valueRaw) }, update);
    return true;
  }

  return false;
}

module.exports = {
  commands,
  handleComponent,
  hubPanel
};
