const { SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  ICONS,
  ButtonStyle,
  button,
  errorPanel,
  mediaPanel,
  panel,
  reply,
  select,
  successPanel,
  update
} = require('../ui/components');
const { compactThumbnail, displayName, formatCoins, formatDateTime, formatDuration, mentionUser, timeAgo } = require('../utils/format');
const { PROFILE_CATALOG, buildBalanceCard, buildTimelyCard } = require('../services/profileCard');

const PREDICTIONS = [
  'Сегодня лучше не спорить с модерацией и забрать свою награду спокойно.',
  'День обещает удачный дроп, если не открывать все кейсы за один раз.',
  'Голосовой онлайн принесет больше пользы, чем кажется.',
  'Кто-то вспомнит о тебе в чате. Возможно, даже без пинга.',
  'Монетка сегодня любит смелых, но баланс любит осторожных.'
];

const TRANSACTION_LABELS = {
  'case prize': 'приз из кейса',
  'coinflip win': 'выигрыш в монетке',
  'coinflip lose': 'проигрыш в монетке',
  'casino win': 'выигрыш в казино',
  'casino lose': 'проигрыш в казино',
  duel: 'дуэль',
  'love прогулка': 'отношения: прогулка',
  'love свидание': 'отношения: свидание',
  'love цветы': 'отношения: цветы',
  'love лотос': 'отношения: лотосовый набор',
  'love кольцо': 'отношения: кольцо',
  'love title': 'отношения: название пары',
  'personal role create': 'создание личной роли',
  'timely reward': 'временная награда',
  'user transfer': 'перевод'
};

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function shopItems(store, guildId, roomPrice) {
  const rolePrice = store.economySetting(guildId, 'personalRolePrice');
  return [
    { id: 'common_case', name: 'Обычный кейс', price: 350, type: 'case', caseType: 'common', amount: 1 },
    { id: 'rare_case', name: 'Редкий кейс', price: 900, type: 'case', caseType: 'rare', amount: 1 },
    { id: 'role_pass', name: 'Купон личной роли', price: Math.max(1000, rolePrice - 500), type: 'rolePass', amount: 1 },
    { id: 'personal_room', name: 'Личная комната', price: Number(roomPrice) || 10000, type: 'room', amount: 1 }
  ];
}

function renderTransaction(transaction, userId) {
  const direction = transaction.toId === userId ? '+' : '-';
  const peer = transaction.fromId === userId ? transaction.toId : transaction.fromId;
  const peerText = peer ? `, участник: ${mentionUser(peer)}` : '';
  const label = TRANSACTION_LABELS[transaction.note] || transaction.note || transaction.type;
  const sign = direction === '+' ? ICONS.up : ICONS.down;
  return `${sign} **${direction}${Number(transaction.amount || 0).toLocaleString('ru-RU')}** — ${label}${peerText}\n-# ${formatDateTime(transaction.createdAt)}`;
}

function remainingText(ms) {
  return formatDuration(ms);
}

function transactionsPanel(context, guildId, target, page = 0) {
  const transactions = context.store.transactionsFor(guildId, target.id, 500);
  const perPage = 10;
  const maxPage = Math.max(0, Math.ceil(transactions.length / perPage) - 1);
  const safePage = Math.min(Math.max(page, 0), maxPage);
  const visible = transactions.slice(safePage * perPage, safePage * perPage + perPage);

  return panel({
    title: `История транзакций — ${displayName(target)}`,
    icon: ICONS.economy,
    eyebrow: 'Экономика Onix',
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

const SHOP_PER_PAGE = 5;

const SHOP_SORTS = {
  old: { label: 'Сначала старые', sort: (a, b) => (a.roleCreatedAt || 0) - (b.roleCreatedAt || 0) },
  new: { label: 'Сначала новые', sort: (a, b) => (b.roleCreatedAt || 0) - (a.roleCreatedAt || 0) },
  cheap: { label: 'Сначала дешёвые', sort: (a, b) => (a.rolePrice || 0) - (b.rolePrice || 0) },
  expensive: { label: 'Сначала дорогие', sort: (a, b) => (b.rolePrice || 0) - (a.rolePrice || 0) },
  popular: { label: 'Сначала популярные', sort: (a, b) => (b.rolePurchases || 0) - (a.rolePurchases || 0) }
};

const SHOP_CATEGORIES = {
  roles: 'Магазин ролей',
  items: 'Системные товары',
  banners: 'Баннеры профиля'
};

// Строки магазина для выбранной категории/сортировки.
function shopRows(context, interaction, category, sortKey) {
  if (category === 'items') {
    return shopItems(context.store, interaction.guildId, context.config.roomPrice).map((item) => ({
      buyValue: `item:${item.id}`,
      optionLabel: item.name,
      optionDescription: formatCoins(item.price),
      body: [
        `**${item.name}**`,
        `-# ${ICONS.coins} Цена: ${formatCoins(item.price)}`
      ]
    }));
  }

  if (category === 'banners') {
    const profile = context.store.ensureUser(interaction.guildId, interaction.user);
    const owned = profile.cosmetics?.backgrounds || [];
    return PROFILE_CATALOG.backgrounds.map((banner) => {
      const isOwned = owned.includes(banner.id);
      const price = banner.price > 0 ? formatCoins(banner.price) : 'бесплатно';
      return {
        buyValue: `banner:${banner.id}`,
        optionLabel: banner.name,
        optionDescription: isOwned ? 'куплено' : price,
        body: [
          `**${banner.name}**`,
          `-# ${ICONS.coins} ${price}${isOwned ? ' • куплено' : ''} • раскрас по умолчанию`
        ]
      };
    });
  }

  const sortDef = SHOP_SORTS[sortKey] || SHOP_SORTS.old;
  const listings = context.store.personalRoleListings(interaction.guildId).slice().sort(sortDef.sort);
  return listings.map((owner) => ({
    buyValue: `role:${owner.id}`,
    optionLabel: `Личная роль • ${formatCoins(owner.rolePrice || 500)}`,
    optionDescription: `Продавец ${owner.id} • куплена ${owner.rolePurchases || 0} раз`,
    body: [
      `<@&${owner.personalRoleId}>`,
      `-# ${ICONS.profile} Продавец: ${mentionUser(owner.id)}`,
      `-# ${ICONS.coins} Цена: ${formatCoins(owner.rolePrice || 500)}  •  ${ICONS.up} Куплена: ${owner.rolePurchases || 0} раз`
    ]
  }));
}

function shopPanel(context, interaction, { page = 0, sort = 'old', category = 'roles' } = {}) {
  const userId = interaction.user.id;
  const balance = context.store.ensureUser(interaction.guildId, interaction.user).balance;
  const sortDef = SHOP_SORTS[sort] || SHOP_SORTS.old;
  const cat = SHOP_CATEGORIES[category] ? category : 'roles';

  const rows = shopRows(context, interaction, cat, sort);
  const totalPages = Math.max(1, Math.ceil(rows.length / SHOP_PER_PAGE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const visible = rows.slice(safePage * SHOP_PER_PAGE, safePage * SHOP_PER_PAGE + SHOP_PER_PAGE);

  const lines = visible.length
    ? visible.map((row, index) => `**${safePage * SHOP_PER_PAGE + index + 1})** ${row.body.join('\n')}`)
    : ['В этой категории пока пусто.'];

  // Окно из максимум 5 кнопок-страниц вокруг текущей.
  const windowSize = Math.min(5, totalPages);
  const windowStart = Math.max(0, Math.min(safePage - 2, totalPages - windowSize));
  const pageButtons = [];
  for (let i = 0; i < windowSize; i += 1) {
    const p = windowStart + i;
    pageButtons.push(
      button(`shop:goto:${userId}:${p}:${sort}:${cat}`, String(p + 1), p === safePage ? ButtonStyle.Primary : ButtonStyle.Secondary, p === safePage)
    );
  }

  const sortSelect = select(
    `shop:sort:${userId}:${cat}`,
    sortDef.label,
    Object.entries(SHOP_SORTS).map(([value, def]) => ({ label: def.label, value, default: value === sort }))
  );
  const catSelect = select(
    `shop:cat:${userId}:${sort}`,
    SHOP_CATEGORIES[cat],
    Object.entries(SHOP_CATEGORIES).map(([value, label]) => ({ label, value, default: value === cat }))
  );

  const actions = [...pageButtons, sortSelect, catSelect];

  if (visible.length > 0) {
    actions.push(
      select(
        `shop:obtain:${userId}:${safePage}:${sort}:${cat}`,
        'Купить товар',
        visible.map((row, index) => ({
          label: `${safePage * SHOP_PER_PAGE + index + 1}. ${row.optionLabel}`.slice(0, 100),
          value: row.buyValue,
          description: row.optionDescription.slice(0, 100)
        }))
      )
    );
  }

  // Отдельные verbs для навигации, чтобы custom_id не дублировали кнопки-страницы.
  actions.push(
    button(`shop:first:${userId}:${sort}:${cat}`, '⏪', ButtonStyle.Secondary, safePage <= 0),
    button(`shop:prev:${userId}:${safePage}:${sort}:${cat}`, '◀', ButtonStyle.Secondary, safePage <= 0),
    button(`shop:close:${userId}`, '🗑', ButtonStyle.Danger),
    button(`shop:next:${userId}:${safePage}:${sort}:${cat}`, '▶', ButtonStyle.Secondary, safePage >= totalPages - 1),
    button(`shop:last:${userId}:${sort}:${cat}`, '⏩', ButtonStyle.Secondary, safePage >= totalPages - 1)
  );

  return panel({
    title: 'Магазин личных ролей',
    icon: ICONS.shop,
    eyebrow: 'Магазин Onix',
    description: `${ICONS.coins} Ваш баланс: **${formatCoins(balance)}**`,
    color: COLORS.economy,
    thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
    lines,
    footer: `Страница ${safePage + 1} из ${totalPages} • ${SHOP_CATEGORIES[cat]}`,
    actions
  });
}

async function purchaseRole(context, interaction, ownerId) {
  const buyer = context.store.ensureUser(interaction.guildId, interaction.user);
  const seller = context.store.getUser(interaction.guildId, ownerId);
  if (!seller?.personalRoleId || seller.roleForSale === false) {
    return reply(interaction, errorPanel('Эта роль больше не продается.'), { ephemeral: true });
  }
  if (ownerId === interaction.user.id) {
    return reply(interaction, errorPanel('Нельзя купить свою же роль.'), { ephemeral: true });
  }

  const price = Number(seller.rolePrice || 500);
  if (buyer.balance < price) {
    return reply(interaction, errorPanel('Недостаточно монет для покупки роли.'), { ephemeral: true });
  }

  const role = await interaction.guild.roles.fetch(seller.personalRoleId).catch(() => null);
  if (!role) {
    seller.personalRoleId = null;
    await context.store.save();
    return reply(interaction, errorPanel('Роль не найдена на сервере.'), { ephemeral: true });
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (member.roles.cache.has(role.id)) {
    return reply(interaction, errorPanel('У тебя уже есть эта роль.'), { ephemeral: true });
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
    return reply(interaction, errorPanel('Не удалось выдать роль. Проверь, что роль бота выше продаваемой роли.'), { ephemeral: true });
  }

  context.store.recordTransaction(interaction.guildId, {
    type: 'shop',
    fromId: interaction.user.id,
    toId: ownerId,
    amount: price,
    note: `покупка роли ${role.name}`
  });
  await context.store.save();
  return reply(
    interaction,
    successPanel(
      `Вы купили ${role} за **${formatCoins(price)}**${ownerUser ? ` у ${mentionUser(ownerUser.id)}` : ''}.`,
      'Покупка роли'
    ),
    { ephemeral: true }
  );
}

async function purchaseBanner(context, interaction, bannerId) {
  const banner = PROFILE_CATALOG.backgrounds.find((entry) => entry.id === bannerId);
  if (!banner) {
    return reply(interaction, errorPanel('Такой баннер не найден.'), { ephemeral: true });
  }
  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  profile.cosmetics ||= {};
  profile.cosmetics.backgrounds ||= [];
  if (profile.cosmetics.backgrounds.includes(bannerId)) {
    return reply(interaction, errorPanel(`Баннер **${banner.name}** уже куплен. Применить: /profile настроить → фон.`), { ephemeral: true });
  }
  if (profile.balance < banner.price) {
    return reply(interaction, errorPanel(`Недостаточно монет. Цена баннера: ${formatCoins(banner.price)}.`), { ephemeral: true });
  }

  profile.balance -= banner.price;
  profile.cosmetics.backgrounds.push(bannerId);
  context.store.recordTransaction(interaction.guildId, {
    type: 'shop',
    fromId: interaction.user.id,
    amount: banner.price,
    note: `баннер ${banner.name}`
  });
  await context.store.save();
  return reply(
    interaction,
    successPanel(`Баннер **${banner.name}** куплен. Применить: \`/profile настроить\` → раздел «фон».`, 'Покупка баннера'),
    { ephemeral: true }
  );
}

async function purchaseItem(context, interaction, itemId) {
  const item = shopItems(context.store, interaction.guildId, context.config.roomPrice).find((entry) => entry.id === itemId);
  if (!item) {
    return reply(interaction, errorPanel('Такой товар больше не доступен.'), { ephemeral: true });
  }

  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  if (profile.balance < item.price) {
    return reply(interaction, errorPanel('Недостаточно монет для покупки.'), { ephemeral: true });
  }

  // Личная комната — особый товар: создаём голосовой канал через сервис комнат.
  if (item.type === 'room') {
    if (context.tempRooms.roomForOwner(interaction.guildId, interaction.user.id)) {
      return reply(interaction, errorPanel('У тебя уже есть личная комната.'), { ephemeral: true });
    }
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      return reply(interaction, errorPanel('Не удалось определить участника.'), { ephemeral: true });
    }

    profile.balance -= item.price;
    context.store.recordTransaction(interaction.guildId, {
      type: 'shop',
      fromId: interaction.user.id,
      amount: item.price,
      note: `shop: ${item.name}`
    });
    await context.store.save();

    try {
      const { channel } = await context.tempRooms.createRoom(interaction.guild, member, { persistent: true });
      return reply(
        interaction,
        successPanel(`Личная комната создана: <#${channel.id}>. Новый баланс: **${formatCoins(profile.balance)}**.`, 'Комната куплена'),
        { ephemeral: true }
      );
    } catch (error) {
      console.error('Room purchase create failed:', error);
      profile.balance += item.price;
      await context.store.save();
      return reply(
        interaction,
        errorPanel('Не удалось создать комнату — монеты возвращены. Проверь, что у бота есть право `Manage Channels`.'),
        { ephemeral: true }
      );
    }
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
  return reply(
    interaction,
    successPanel(`Покупка: **${item.name}**. Новый баланс: **${formatCoins(profile.balance)}**.`, 'Покупка успешна'),
    { ephemeral: true }
  );
}

function inventoryPrompt(user) {
  return panel({
    title: 'Инвентарь пользователя',
    icon: ICONS.inventory,
    eyebrow: 'Коллекция Onix',
    description: `${mentionUser(user.id)}, какой раздел открыть?`,
    color: COLORS.economy,
    thumbnail: compactThumbnail(user),
    actions: [
      button(`inventory:roles:${user.id}`, 'Личные роли', ButtonStyle.Secondary),
      button(`inventory:rooms:${user.id}`, 'Личные комнаты', ButtonStyle.Secondary),
      button(`inventory:items:${user.id}`, 'Предметы', ButtonStyle.Secondary),
      button(`inventory:back:${user.id}`, 'Назад', ButtonStyle.Primary),
      button(`inventory:cancel:${user.id}`, 'Отмена', ButtonStyle.Danger)
    ]
  });
}

// Инвентарь хранит и старые строки "type: name", и новые объекты { type, name }.
function formatInventory(list) {
  if (!list?.length) return 'пусто';
  return list
    .map((item) => (typeof item === 'string' ? item.split(':').slice(1).join(':').trim() || item : item.name))
    .filter(Boolean)
    .join(', ');
}

function inventoryView(context, guildId, user, profile, view) {
  const titles = {
    roles: 'Личные роли',
    rooms: 'Личные комнаты',
    items: 'Предметы'
  };

  const lines = {
    roles: [
      `**Своя роль:** ${profile.personalRoleId ? `<@&${profile.personalRoleId}>` : 'нет'}`,
      `**Купленные роли:** ${profile.purchasedRoles?.length ? profile.purchasedRoles.map((id) => `<@&${id}>`).join(', ') : 'нет'}`,
      `**Купоны личной роли:** ${profile.rolePasses || 0}`
    ],
    rooms: [
      `**Личные комнаты:** ${formatDuration((profile.roomMinutes || 0) * 60000)}`,
      'Система комнат пока подключена как статистика, без создания голосовых каналов.'
    ],
    items: [
      `**Снежки:** ${profile.snowballs || 0}`,
      `**Обычные кейсы:** ${profile.cases.common || 0}`,
      `**Редкие кейсы:** ${profile.cases.rare || 0}`,
      `**Эпические кейсы:** ${profile.cases.epic || 0}`,
      `**Прочее:** ${formatInventory(profile.inventory)}`
    ]
  };

  const icons = { roles: ICONS.profile, rooms: ICONS.voice, items: ICONS.inventory };

  return panel({
    title: titles[view] || 'Инвентарь',
    icon: icons[view] || ICONS.inventory,
    eyebrow: 'Коллекция Onix',
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

      const card = await buildBalanceCard({ user: target, profile });
      if (card) {
        return reply(
          interaction,
          mediaPanel({
            title: `Баланс — ${displayName(target)}`,
            icon: ICONS.economy,
            eyebrow: 'Экономика Onix',
            description: mentionUser(target.id),
            imageUrl: card.imageUrl,
            color: COLORS.economy,
            stats: [
              { icon: ICONS.coins, name: 'Монеты', value: Number(profile.balance || 0).toLocaleString('ru-RU') },
              { icon: ICONS.lotus, name: 'Лотусы', value: Number(profile.lotuses || 0).toLocaleString('ru-RU') },
              { icon: ICONS.snow, name: 'Снежки', value: Number(profile.snowballs || 0).toLocaleString('ru-RU') }
            ],
            statColumns: 2
          }),
          { files: card.files }
        );
      }

      return reply(
        interaction,
        panel({
          title: `Баланс — ${displayName(target)}`,
          icon: ICONS.economy,
          eyebrow: 'Экономика Onix',
          description: mentionUser(target.id),
          thumbnail: compactThumbnail(target),
          color: COLORS.economy,
          stats: [
            { icon: ICONS.coins, name: 'Монеты', value: Number(profile.balance || 0).toLocaleString('ru-RU') },
            { icon: ICONS.lotus, name: 'Лотусы', value: Number(profile.lotuses || 0).toLocaleString('ru-RU') },
            { icon: ICONS.snow, name: 'Снежки', value: Number(profile.snowballs || 0).toLocaleString('ru-RU') }
          ],
          statColumns: 2
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
      const timelyReward = context.store.economySetting(interaction.guildId, 'timelyReward');
      const timelySnowballs = context.store.economySetting(interaction.guildId, 'timelySnowballs');
      const timelyCooldownHours = context.store.economySetting(interaction.guildId, 'timelyCooldownHours');
      const cooldownMs = timelyCooldownHours * 60 * 60 * 1000;
      const availableAt = Number(profile.lastTimely || 0) + cooldownMs;

      if (Date.now() < availableAt) {
        return reply(
          interaction,
          panel({
            title: 'Предсказание дня',
            icon: ICONS.time,
            eyebrow: 'Печенье с предсказанием',
            description: `${mentionUser(interaction.user.id)}, Вы недавно уже открывали печенье!\nСледующее можно открыть через **${remainingText(availableAt - Date.now())}**.`,
            color: COLORS.warning,
            thumbnail: compactThumbnail(interaction.user)
          }),
          { ephemeral: false }
        );
      }

      const prediction = PREDICTIONS[Math.floor(Math.random() * PREDICTIONS.length)];
      profile.lastTimely = Date.now();
      profile.balance += timelyReward;
      profile.snowballs += timelySnowballs;
      profile.xp += 35;
      context.store.recordTransaction(interaction.guildId, {
        type: 'timely',
        toId: interaction.user.id,
        amount: timelyReward,
        note: 'timely reward'
      });
      await context.store.save();

      const card = await buildTimelyCard({
        user: interaction.user,
        profile,
        reward: timelyReward,
        snowballs: timelySnowballs,
        xp: 35
      });
      if (card) {
        return reply(
          interaction,
          mediaPanel({
            title: 'Предсказание дня',
            icon: ICONS.gift,
            eyebrow: 'Печенье с предсказанием',
            description: `${mentionUser(interaction.user.id)}, ${prediction}`,
            imageUrl: card.imageUrl,
            color: COLORS.economy,
            lines: [`${ICONS.gift} Вам выпало **${timelyReward} монет** и **${timelySnowballs} снежка**`],
            footer: `Возвращайтесь через ${timelyCooldownHours} часов`
          }),
          { files: card.files, ephemeral: false }
        );
      }

      return reply(
        interaction,
        panel({
          title: 'Предсказание дня',
          icon: ICONS.gift,
          eyebrow: 'Печенье с предсказанием',
          description: `${mentionUser(interaction.user.id)}, ${prediction}`,
          color: COLORS.economy,
          thumbnail: compactThumbnail(interaction.user),
          stats: [
            { icon: ICONS.coins, name: 'Монеты', value: `+${timelyReward}` },
            { icon: ICONS.snow, name: 'Снежки', value: `+${timelySnowballs}` },
            { icon: ICONS.xp, name: 'Опыт', value: '+35' }
          ],
          statColumns: 2,
          footer: `Возвращайтесь через ${timelyCooldownHours} часов`
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
          title: 'Перевод выполнен',
          icon: ICONS.coins,
          eyebrow: 'Экономика Onix',
          description: `${mentionUser(interaction.user.id)} перевёл **${amount.toLocaleString('ru-RU')} монет** → ${mentionUser(target.id)}`,
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

      return reply(interaction, shopPanel(context, interaction, {}));
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
  }
];

async function handleComponent(interaction, context) {
  const isShopSelect = interaction.isStringSelectMenu() && interaction.customId.startsWith('shop:');
  if (!interaction.isButton() && !isShopSelect) return false;

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
    if (view === 'back') {
      await update(interaction, inventoryPrompt(interaction.user));
      return true;
    }

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

  if (interaction.customId.startsWith('shop:')) {
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const ownerId = parts[2];
    if (interaction.user.id !== ownerId && action !== 'buy') {
      await reply(interaction, errorPanel('Это меню магазина открыто для другого пользователя.'), { ephemeral: true });
      return true;
    }

    if (action === 'goto') {
      const [, , , pageRaw, sort, category] = parts;
      await update(interaction, shopPanel(context, interaction, { page: Number(pageRaw || 0), sort, category }));
      return true;
    }

    if (action === 'first') {
      await update(interaction, shopPanel(context, interaction, { page: 0, sort: parts[3], category: parts[4] }));
      return true;
    }

    if (action === 'last') {
      await update(interaction, shopPanel(context, interaction, { page: Number.MAX_SAFE_INTEGER, sort: parts[3], category: parts[4] }));
      return true;
    }

    if (action === 'prev' || action === 'next') {
      const target = Number(parts[3] || 0) + (action === 'next' ? 1 : -1);
      await update(interaction, shopPanel(context, interaction, { page: target, sort: parts[4], category: parts[5] }));
      return true;
    }

    if (action === 'sort') {
      const category = parts[3];
      const sort = interaction.values?.[0] || 'old';
      await update(interaction, shopPanel(context, interaction, { page: 0, sort, category }));
      return true;
    }

    if (action === 'cat') {
      const sort = parts[3];
      const category = interaction.values?.[0] || 'roles';
      await update(interaction, shopPanel(context, interaction, { page: 0, sort, category }));
      return true;
    }

    if (action === 'close') {
      await update(
        interaction,
        panel({
          title: 'Магазин личных ролей',
          icon: ICONS.shop,
          eyebrow: 'Магазин Onix',
          description: 'Магазин закрыт.',
          color: COLORS.economy
        })
      );
      return true;
    }

    if (action === 'obtain') {
      const [kind, id] = String(interaction.values?.[0] || '').split(':');
      if (kind === 'role') {
        await purchaseRole(context, interaction, id);
        return true;
      }
      if (kind === 'item') {
        await purchaseItem(context, interaction, id);
        return true;
      }
      if (kind === 'banner') {
        await purchaseBanner(context, interaction, id);
        return true;
      }
      await reply(interaction, errorPanel('Такой товар не найден.'), { ephemeral: true });
      return true;
    }

    // Легаси-кнопки из старых сообщений магазина.
    if (action === 'role') {
      await purchaseRole(context, interaction, parts[3]);
      return true;
    }

    if (action === 'buy') {
      const viewerId = parts.length === 4 ? parts[2] : interaction.user.id;
      if (interaction.user.id !== viewerId) {
        await reply(interaction, errorPanel('Это меню магазина открыто для другого пользователя.'), { ephemeral: true });
        return true;
      }
      await purchaseItem(context, interaction, parts.at(-1));
      return true;
    }
  }

  return false;
}

module.exports = {
  commands,
  handleComponent
};
