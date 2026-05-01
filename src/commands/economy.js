const { SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  ButtonStyle,
  button,
  errorPanel,
  panel,
  reply,
  successPanel,
  update
} = require('../ui/components');
const { displayName, formatCoins, formatDateTime, formatDuration, mentionUser, timeAgo } = require('../utils/format');

const CASE_TYPES = [
  { name: 'Обычный', value: 'common' },
  { name: 'Редкий', value: 'rare' },
  { name: 'Эпический', value: 'epic' }
];

const PREDICTIONS = [
  'Сегодня лучше не спорить с модерацией и забрать свою награду спокойно.',
  'День обещает удачный дроп, если не открывать все кейсы за один раз.',
  'Голосовой онлайн принесет больше пользы, чем кажется.',
  'Кто-то вспомнит о тебе в чате. Возможно, даже без пинга.',
  'Монетка сегодня любит смелых, но баланс любит осторожных.',
  'Кланы набирают силу — хороший день, чтобы задонатить в банк.',
  'Удача на твоей стороне, но только если не кинешь снежок в модера.',
  'Сегодня звёзды говорят: открой кейс и не пожалеешь. Наверное.',
  'Тебя ждёт неожиданная встреча в голосовом канале.',
  'Если веришь в стрик — продолжай. Он тебя не подведёт.',
  'Сегодня день рискнуть в дуэли. Но ставь по-маленькой.',
  'Лучший совет дня: не трать всё сразу, копи на легенду.',
  'Кто рано встаёт, тому timely даёт. Буквально.',
  'Сегодня репутация важнее монет. Подумай об этом.',
  'Маркет ждёт твоих лотов. Время продавать!'
];

const TRANSACTION_LABELS = {
  'case prize': 'приз из кейса',
  'coinflip win': 'выигрыш в монетке',
  'coinflip lose': 'проигрыш в монетке',
  duel: 'дуэль',
  'personal role create': 'создание личной роли',
  'timely reward': 'временная награда',
  'user transfer': 'перевод'
};

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

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function shopItems(config) {
  return [
    { id: 'common_case', name: 'Обычный кейс', price: 350, type: 'case', caseType: 'common', amount: 1 },
    { id: 'rare_case', name: 'Редкий кейс', price: 900, type: 'case', caseType: 'rare', amount: 1 },
    { id: 'role_pass', name: 'Купон личной роли', price: Math.max(1000, config.personalRolePrice - 500), type: 'rolePass', amount: 1 }
  ];
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

function renderTransaction(transaction, userId) {
  const isIncome = transaction.toId === userId;
  const arrow = isIncome ? '🟢 +' : '🔴 -';
  const peer = transaction.fromId === userId ? transaction.toId : transaction.fromId;
  const peerText = peer ? ` • ${mentionUser(peer)}` : '';
  const label = TRANSACTION_LABELS[transaction.note] || transaction.note || transaction.type;
  return `${arrow}**${transaction.amount}** — ${label}${peerText}\n-# ${formatDateTime(transaction.createdAt)}`;
}

function remainingText(ms) {
  return formatDuration(ms);
}

function compactThumbnail(user) {
  return user.displayAvatarURL({ size: 256 });
}

function transactionsPanel(context, guildId, target, page = 0) {
  const transactions = context.store.transactionsFor(guildId, target.id, 500);
  const perPage = 10;
  const maxPage = Math.max(0, Math.ceil(transactions.length / perPage) - 1);
  const safePage = Math.min(Math.max(page, 0), maxPage);
  const visible = transactions.slice(safePage * perPage, safePage * perPage + perPage);

  return panel({
    title: `📜 История транзакций — ${displayName(target)}`,
    description: visible.length ? null : 'История транзакций пока пустая.',
    color: COLORS.economy,
    thumbnail: compactThumbnail(target),
    lines: visible.map((item) => renderTransaction(item, target.id)),
    footer: `Страница ${safePage + 1} из ${maxPage + 1}`,
    actions: [
      button(`transactions:page:${target.id}:${safePage - 1}`, '‹', ButtonStyle.Secondary, safePage <= 0),
      button(`transactions:close:${target.id}`, 'Удалить', ButtonStyle.Danger, transactions.length === 0),
      button(`transactions:page:${target.id}:${safePage + 1}`, '›', ButtonStyle.Secondary, safePage >= maxPage)
    ]
  });
}

function roleShopPanel(context, interaction, page = 0) {
  const listings = context.store.personalRoleListings(interaction.guildId);
  const fallbackItems = shopItems(context.config);
  const perPage = 5;
  const maxPage = Math.max(0, Math.ceil(Math.max(listings.length, 1) / perPage) - 1);
  const safePage = Math.min(Math.max(page, 0), maxPage);
  const visibleRoles = listings.slice(safePage * perPage, safePage * perPage + perPage);
  const lines = visibleRoles.map((owner, index) => {
    const place = safePage * perPage + index + 1;
    return `**${place})** <@&${owner.personalRoleId}>\n**Продавец:** ${mentionUser(owner.id)}\n**Цена:** ${formatCoins(owner.rolePrice || 500)}\n**Куплена раз:** ${owner.rolePurchases || 0}`;
  });

  if (lines.length === 0) {
    lines.push('В магазине пока нет личных ролей. Ниже доступны системные товары.');
    lines.push(...fallbackItems.map((item) => `**${item.name}** — ${formatCoins(item.price)}`));
  }

  const roleButtons = visibleRoles.slice(0, 3).map((owner, index) =>
    button(`shop:role:${interaction.user.id}:${owner.id}`, `Купить ${safePage * perPage + index + 1}`, ButtonStyle.Primary)
  );

  const itemButtons = lines.length > visibleRoles.length
    ? fallbackItems.slice(0, 2).map((item) => button(`shop:buy:${interaction.user.id}:${item.id}`, item.name, ButtonStyle.Secondary))
    : [];

  return panel({
    title: '🛍️ Магазин личных ролей',
    description: `💰 Ваш баланс: **${formatCoins(context.store.ensureUser(interaction.guildId, interaction.user).balance)}**`,
    color: COLORS.economy,
    thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
    lines,
    footer: `Страница ${safePage + 1} из ${maxPage + 1}`,
    actions: [
      button(`shop:page:${interaction.user.id}:${safePage - 1}`, '‹‹', ButtonStyle.Secondary, safePage <= 0),
      button(`shop:page:${interaction.user.id}:${safePage + 1}`, '››', ButtonStyle.Secondary, safePage >= maxPage),
      ...roleButtons,
      ...itemButtons
    ]
  });
}

function inventoryPrompt(user) {
  return panel({
    title: '🎒 Инвентарь',
    description: `${mentionUser(user.id)}, какой инвентарь Вы хотите посмотреть?`,
    color: COLORS.economy,
    thumbnail: compactThumbnail(user),
    actions: [
      button(`inventory:roles:${user.id}`, 'Личные роли', ButtonStyle.Secondary),
      button(`inventory:rooms:${user.id}`, 'Личные комнаты', ButtonStyle.Secondary),
      button(`inventory:items:${user.id}`, 'Предметы', ButtonStyle.Secondary),
      button(`inventory:cancel:${user.id}`, 'Отмена', ButtonStyle.Danger)
    ]
  });
}

function inventoryView(context, guildId, user, profile, view) {
  const titles = {
    roles: '🎨 Личные роли',
    rooms: '🏠 Личные комнаты',
    items: '🎒 Предметы'
  };

  const lines = {
    roles: [
      `🎭 **Своя роль:** ${profile.personalRoleId ? `<@&${profile.personalRoleId}>` : 'нет'}`,
      `🛒 **Купленные:** ${profile.purchasedRoles?.length ? profile.purchasedRoles.map((id) => `<@&${id}>`).join(', ') : 'нет'}`,
      `🎟️ **Купоны:** ${profile.rolePasses || 0}`
    ],
    rooms: [
      `🏠 **Время в комнатах:** ${formatDuration((profile.roomMinutes || 0) * 60000)}`,
      '-# Система комнат подключена как статистика.'
    ],
    items: [
      `❄️ **Снежки:** ${profile.snowballs || 0}`,
      `🟢 **Обычные кейсы:** ${profile.cases.common || 0}`,
      `🔵 **Редкие кейсы:** ${profile.cases.rare || 0}`,
      `🟣 **Эпические кейсы:** ${profile.cases.epic || 0}`,
      `📦 **Прочее:** ${profile.inventory?.length ? profile.inventory.join(', ') : 'пусто'}`
    ]
  };

  return panel({
    title: titles[view] || '🎒 Инвентарь',
    description: mentionUser(user.id),
    color: COLORS.economy,
    thumbnail: compactThumbnail(user),
    lines: lines[view] || lines.items,
    actions: [
      button(`inventory:roles:${user.id}`, 'Личные роли', ButtonStyle.Secondary),
      button(`inventory:rooms:${user.id}`, 'Личные комнаты', ButtonStyle.Secondary),
      button(`inventory:items:${user.id}`, 'Предметы', ButtonStyle.Secondary),
      button(`inventory:cancel:${user.id}`, 'Отмена', ButtonStyle.Danger)
    ]
  });
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('balance')
      .setDescription('Посмотреть баланс')
      .addUserOption((option) => option.setName('user').setDescription('Пользователь')),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const target = interaction.options.getUser('user') || interaction.user;
      const profile = context.store.ensureUser(interaction.guildId, target);
      await context.store.save();

      return reply(
        interaction,
        panel({
          title: `💰 Баланс — ${displayName(target)}`,
          description: mentionUser(target.id),
          thumbnail: compactThumbnail(target),
          color: COLORS.economy,
          fields: [
            { name: '🪙 Монеты', value: formatCoins(profile.balance || 0) },
            { name: '🌸 Лотусы', value: String(profile.lotuses || 0) },
            { name: '❄️ Снежки', value: String(profile.snowballs || 0) }
          ]
        })
      );
    }
  },
  {
    data: new SlashCommandBuilder().setName('timely').setDescription('Забрать временную награду и предсказание'),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const profile = context.store.ensureUser(interaction.guildId, interaction.user);
      const cooldownMs = context.config.timelyCooldownHours * 60 * 60 * 1000;
      const availableAt = Number(profile.lastTimely || 0) + cooldownMs;

      if (Date.now() < availableAt) {
        return reply(
          interaction,
          panel({
            title: '⏳ Предсказание дня',
            description: `${mentionUser(interaction.user.id)}, Вы недавно уже открывали печенье!\nВы сможете открыть следующую только через **${remainingText(availableAt - Date.now())}**.`,
            color: COLORS.warning,
            thumbnail: compactThumbnail(interaction.user)
          }),
          { ephemeral: false }
        );
      }

      const prediction = PREDICTIONS[Math.floor(Math.random() * PREDICTIONS.length)];

      const lastDate = profile.lastTimely ? new Date(profile.lastTimely).toISOString().slice(0, 10) : null;
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (lastDate === yesterday) {
        profile.timelyStreak = (profile.timelyStreak || 0) + 1;
      } else if (lastDate !== new Date().toISOString().slice(0, 10)) {
        profile.timelyStreak = 1;
      }

      const streak = profile.timelyStreak || 1;
      const streakMultiplier = 1 + Math.min(streak, 30) * 0.05;
      const reward = Math.floor(context.config.timelyReward * streakMultiplier);

      profile.lastTimely = Date.now();
      profile.balance += reward;
      profile.snowballs += context.config.timelySnowballs;
      profile.xp += 35 + Math.min(streak, 30) * 2;
      context.store.recordTransaction(interaction.guildId, {
        type: 'timely',
        toId: interaction.user.id,
        amount: reward,
        note: 'timely reward'
      });
      await context.store.save();

      const streakLine = streak > 1 ? `\n🔥 Стрик: **${streak}** дн. (x${streakMultiplier.toFixed(2)} бонус)` : '';
      return reply(
        interaction,
        panel({
          title: '🪄 Предсказание дня',
          description: `${mentionUser(interaction.user.id)}, ${prediction}\n\n🪙 **+${reward} монет** и ❄️ **+${context.config.timelySnowballs} снежка**${streakLine}`,
          color: COLORS.economy,
          thumbnail: compactThumbnail(interaction.user),
          footer: `Возвращайтесь через ${context.config.timelyCooldownHours} ч.`
        }),
        { ephemeral: false }
      );
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('give')
      .setDescription('Передать валюту')
      .addUserOption((option) => option.setName('user').setDescription('Получатель').setRequired(true))
      .addIntegerOption((option) =>
        option.setName('amount').setDescription('Количество монет').setMinValue(1).setMaxValue(1000000).setRequired(true)
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      if (target.bot) return reply(interaction, errorPanel('Ботам монеты не нужны.'), { ephemeral: true });
      if (target.id === interaction.user.id) return reply(interaction, errorPanel('Передавать монеты самому себе нельзя.'), { ephemeral: true });

      try {
        context.store.transfer(interaction.guildId, interaction.user, target, amount, 'user transfer');
      } catch (error) {
        if (error.message === 'INSUFFICIENT_FUNDS') {
          return reply(interaction, errorPanel('Недостаточно монет для перевода.'), { ephemeral: true });
        }
        throw error;
      }

      await context.store.save();
      return reply(
        interaction,
        panel({
          title: '📤 Перевод',
          description: `${mentionUser(interaction.user.id)} ➡️ ${mentionUser(target.id)}\n🪙 **${formatCoins(amount)}**`,
          color: COLORS.success,
          thumbnail: compactThumbnail(target)
        })
      );
    }
  },
  {
    data: new SlashCommandBuilder().setName('shop').setDescription('Магазин личных ролей и кейсов'),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      context.store.ensureUser(interaction.guildId, interaction.user);
      await context.store.save();

      return reply(interaction, roleShopPanel(context, interaction, 0));
    }
  },
  {
    data: new SlashCommandBuilder().setName('inventory').setDescription('Инвентарь ролей и предметов'),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const profile = context.store.ensureUser(interaction.guildId, interaction.user);
      await context.store.save();

      return reply(interaction, inventoryPrompt(interaction.user));
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('transactions')
      .setDescription('Просмотреть последние транзакции')
      .addUserOption((option) => option.setName('user').setDescription('Пользователь')),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const target = interaction.options.getUser('user') || interaction.user;
      context.store.ensureUser(interaction.guildId, target);
      await context.store.save();

      return reply(interaction, transactionsPanel(context, interaction.guildId, target, 0));
    }
  },
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
            title: `🎰 Кейсы — ${displayName(target)}`,
            description: mentionUser(target.id),
            thumbnail: compactThumbnail(target),
            color: COLORS.economy,
            lines: CASE_TYPES.map((item) => {
              const count = profile.cases[item.value] || 0;
              const emoji = item.value === 'common' ? '🟢' : item.value === 'rare' ? '🔵' : '🟣';
              return `${emoji} **${item.name}:** ${count}`;
            })
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
              title: '📦 Кейсы закончились',
              description: `${mentionUser(interaction.user.id)}, у вас не хватает кейсов.\nПопробуйте вернуться через голосовую активность или купите кейс в /shop.`,
              color: COLORS.warning,
              thumbnail: compactThumbnail(interaction.user),
              footer: `Нужно: ${amount}, доступно: ${profile.cases[type]}`
            }),
            { ephemeral: false }
          );
        }

        profile.cases[type] -= amount;
        const prizes = new Map();

        for (let index = 0; index < amount; index += 1) {
          const prize = pickWeighted(CASE_LOOT[type]);
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

        return reply(
          interaction,
          panel({
            title: '🎁 Открытие кейса',
            description: `${mentionUser(interaction.user.id)}, выпало с **${caseLabel(type)}** кейса:`,
            color: COLORS.economy,
            thumbnail: compactThumbnail(interaction.user),
            lines: prizeLines.map((line) => `✨ ${line}`),
            footer: `Осталось: ${profile.cases[type]}`
          })
        );
      }

      const target = interaction.options.getUser('user') || interaction.user;
      context.store.ensureUser(interaction.guildId, target);
      const history = context.store.caseHistoryFor(interaction.guildId, target.id, 10);
      await context.store.save();

      return reply(
        interaction,
        panel({
          title: `📜 История кейсов — ${displayName(target)}`,
          description: mentionUser(target.id),
          color: COLORS.economy,
          thumbnail: compactThumbnail(target),
          lines: history.length
            ? history.map((item) => `**${caseLabel(item.caseType)}** — ${item.prize} • ${timeAgo(item.createdAt)}`)
            : ['История кейсов пока пустая.']
        }),
        { ephemeral: true }
      );
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton()) return false;

  if (interaction.customId.startsWith('transactions:')) {
    const [, action, userId, pageRaw] = interaction.customId.split(':');
    const target = await interaction.client.users.fetch(userId).catch(() => null);
    if (!target) {
      await reply(interaction, errorPanel('Пользователь не найден.'), { ephemeral: true });
      return true;
    }

    if (action === 'close') {
      await update(
        interaction,
        panel({
          title: 'История транзакций',
          description: 'Просмотр истории закрыт.',
          color: COLORS.economy,
          thumbnail: compactThumbnail(target)
        })
      );
      return true;
    }

    await update(interaction, transactionsPanel(context, interaction.guildId, target, Number(pageRaw || 0)));
    return true;
  }

  if (interaction.customId.startsWith('inventory:')) {
    const [, view, userId] = interaction.customId.split(':');
    if (interaction.user.id !== userId) {
      await reply(interaction, errorPanel('Это меню открыто для другого пользователя.'), { ephemeral: true });
      return true;
    }

    const profile = context.store.ensureUser(interaction.guildId, interaction.user);
    if (view === 'cancel') {
      await update(
        interaction,
        panel({
          title: 'Инвентарь пользователя',
          description: 'Просмотр инвентаря закрыт.',
          color: COLORS.economy,
          thumbnail: compactThumbnail(interaction.user)
        })
      );
      return true;
    }

    await update(interaction, inventoryView(context, interaction.guildId, interaction.user, profile, view));
    return true;
  }

  if (interaction.customId.startsWith('shop:page:')) {
    const [, , ownerId, pageRaw] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId) {
      await reply(interaction, errorPanel('Это меню магазина открыто для другого пользователя.'), { ephemeral: true });
      return true;
    }
    const page = Number(pageRaw || 0);
    await update(interaction, roleShopPanel(context, interaction, page));
    return true;
  }

  if (interaction.customId.startsWith('shop:role:')) {
    const [, , viewerId, ownerId] = interaction.customId.split(':');
    if (interaction.user.id !== viewerId) {
      await reply(interaction, errorPanel('Это меню магазина открыто для другого пользователя.'), { ephemeral: true });
      return true;
    }
    const buyer = context.store.ensureUser(interaction.guildId, interaction.user);
    const seller = context.store.getUser(interaction.guildId, ownerId);
    if (!seller?.personalRoleId || seller.roleForSale === false) {
      await reply(interaction, errorPanel('Эта роль больше не продается.'), { ephemeral: true });
      return true;
    }

    if (ownerId === interaction.user.id) {
      await reply(interaction, errorPanel('Нельзя купить свою же роль.'), { ephemeral: true });
      return true;
    }

    const price = Number(seller.rolePrice || 500);
    if (buyer.balance < price) {
      await reply(interaction, errorPanel('Недостаточно монет для покупки роли.'), { ephemeral: true });
      return true;
    }

    const role = await interaction.guild.roles.fetch(seller.personalRoleId).catch(() => null);
    if (!role) {
      seller.personalRoleId = null;
      await context.store.save();
      await reply(interaction, errorPanel('Роль не найдена на сервере.'), { ephemeral: true });
      return true;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.roles.cache.has(role.id)) {
      await reply(interaction, errorPanel('У тебя уже есть эта роль.'), { ephemeral: true });
      return true;
    }

    const ownerUser = await interaction.client.users.fetch(ownerId).catch(() => null);
    buyer.balance -= price;
    seller.balance = Number(seller.balance || 0) + price;
    seller.rolePurchases = Number(seller.rolePurchases || 0) + 1;
    buyer.purchasedRoles ||= [];
    buyer.purchasedRoles.push(role.id);

    try {
      await member.roles.add(role);
    } catch (error) {
      buyer.balance += price;
      seller.balance -= price;
      seller.rolePurchases -= 1;
      buyer.purchasedRoles = buyer.purchasedRoles.filter((id) => id !== role.id);
      await context.store.save();
      await reply(interaction, errorPanel('Не удалось выдать роль. Проверь, что роль бота выше продаваемой роли.'), { ephemeral: true });
      return true;
    }

    context.store.recordTransaction(interaction.guildId, {
      type: 'shop',
      fromId: interaction.user.id,
      toId: ownerId,
      amount: price,
      note: `покупка роли ${role.name}`
    });
    await context.store.save();
    await reply(
      interaction,
      successPanel(
        `Вы купили ${role} за **${formatCoins(price)}**${ownerUser ? ` у ${mentionUser(ownerUser.id)}` : ''}.`,
        'Покупка роли'
      ),
      { ephemeral: true }
    );
    return true;
  }

  if (!interaction.customId.startsWith('shop:buy:')) return false;

  const parts = interaction.customId.split(':');
  const viewerId = parts.length === 4 ? parts[2] : interaction.user.id;
  if (interaction.user.id !== viewerId) {
    await reply(interaction, errorPanel('Это меню магазина открыто для другого пользователя.'), { ephemeral: true });
    return true;
  }
  const itemId = parts.at(-1);
  const item = shopItems(context.config).find((entry) => entry.id === itemId);
  if (!item) {
    await reply(interaction, errorPanel('Такой товар больше не доступен.'), { ephemeral: true });
    return true;
  }

  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  if (profile.balance < item.price) {
    await reply(interaction, errorPanel('Недостаточно монет для покупки.'), { ephemeral: true });
    return true;
  }

  profile.balance -= item.price;
  context.store.recordTransaction(interaction.guildId, {
    type: 'shop',
    fromId: interaction.user.id,
    amount: item.price,
    note: `shop: ${item.name}`
  });

  if (item.type === 'case') {
    profile.cases[item.caseType] = Number(profile.cases[item.caseType] || 0) + item.amount;
  }

  if (item.type === 'rolePass') {
    profile.rolePasses = Number(profile.rolePasses || 0) + item.amount;
  }

  await context.store.save();
  await reply(
    interaction,
    successPanel(`Покупка: **${item.name}**. Новый баланс: **${formatCoins(profile.balance)}**.`, 'Покупка успешна'),
    { ephemeral: true }
  );
  return true;
}

module.exports = {
  commands,
  handleComponent
};
