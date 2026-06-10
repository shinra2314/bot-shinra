const { ActionRowBuilder, ModalBuilder, SlashCommandBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { COLORS, ICONS, ButtonStyle, button, errorPanel, mediaPanel, panel, reply, select, successPanel } = require('../ui/components');
const { formatCoins, formatDuration, mentionUser } = require('../utils/format');
const { buildGridCard } = require('../services/profileCard');
const achievements = require('../services/achievements');

// Иконка плитки сетки по типу лота маркета.
const MARKET_ICON = { frame: 'level', badge: 'trophy', title: 'lotus', case: 'case', item: 'coins' };

const MARKET_TYPES = [
  { name: 'Рамка', value: 'frame' },
  { name: 'Бейдж', value: 'badge' },
  { name: 'Титул', value: 'title' },
  { name: 'Кейс', value: 'case' },
  { name: 'Предмет', value: 'item' }
];

const COMMISSION = 0.08;

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function listingRows(listings) {
  if (!listings.length) return ['Активных лотов пока нет.'];
  return listings.slice(0, 10).map((item) =>
    `${ICONS.shop} **${item.name}** \`${item.id}\`\n-# Продавец: ${mentionUser(item.sellerId)} • ${ICONS.coins} ${formatCoins(item.price)} • Тип: ${item.type}`
  );
}

// ---- Извлечённая логика (общая для slash и кнопок панели) ----

async function marketListComponents(context, guildId) {
  const listings = context.store.activeMarketListings(guildId);
  const card = listings.length
    ? await buildGridCard({
      title: 'Маркет Onix',
      subtitle: `Комиссия с продажи: ${Math.round(COMMISSION * 100)}%`,
      accent: '#FFD24A',
      items: listings.slice(0, 6).map((item) => ({
        icon: MARKET_ICON[item.type] || 'coins',
        name: item.name,
        price: formatCoins(item.price).replace(' мон.', '')
      }))
    })
    : null;
  return {
    components: mediaPanel({
      title: 'Маркет Onix',
      icon: ICONS.shop,
      eyebrow: 'Маркет Onix',
      description: `Комиссия с продажи: **${Math.round(COMMISSION * 100)}%**.`,
      color: COLORS.economy,
      imageUrl: card?.imageUrl,
      lines: listingRows(listings)
    }),
    files: card?.files
  };
}

async function sellListing(interaction, context, { type, name, price }) {
  if (!Number.isInteger(price) || price < 1) return reply(interaction, errorPanel('Цена должна быть целым числом ≥ 1.'), { ephemeral: true });
  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  const listing = context.store.addMarketListing(interaction.guildId, {
    sellerId: interaction.user.id,
    type,
    name,
    price
  });
  achievements.addNamed(profile, 'Первый лот на маркете');
  await context.store.save();
  return reply(interaction, successPanel(`Лот **${listing.name}** выставлен за **${formatCoins(listing.price)}**.\nID: \`${listing.id}\``, 'Лот опубликован'));
}

async function buyListing(interaction, context, listingId) {
  const guild = context.store.guild(interaction.guildId);
  const listing = guild.marketListings.find((item) => item.id === listingId && item.status === 'active');
  if (!listing) return reply(interaction, errorPanel('Активный лот не найден.'), { ephemeral: true });
  if (listing.sellerId === interaction.user.id) return reply(interaction, errorPanel('Нельзя купить свой лот.'), { ephemeral: true });

  const buyer = context.store.ensureUser(interaction.guildId, interaction.user);
  if (buyer.balance < listing.price) return reply(interaction, errorPanel('У тебя не хватает монет.'), { ephemeral: true });

  const sellerUser = await interaction.client.users.fetch(listing.sellerId).catch(() => null);
  const seller = sellerUser ? context.store.ensureUser(interaction.guildId, sellerUser) : context.store.getUser(interaction.guildId, listing.sellerId);
  const fee = Math.ceil(listing.price * COMMISSION);
  buyer.balance -= listing.price;
  if (seller) seller.balance = Number(seller.balance || 0) + listing.price - fee;
  context.store.addInventoryItem(interaction.guildId, interaction.user.id, { type: listing.type, name: listing.name, source: 'market' });
  listing.status = 'sold';
  listing.buyerId = interaction.user.id;
  listing.soldAt = Date.now();
  context.store.recordTransaction(interaction.guildId, {
    type: 'market',
    fromId: interaction.user.id,
    toId: listing.sellerId,
    amount: listing.price,
    note: `маркет: ${listing.name}, комиссия ${fee}`
  });
  await context.store.save();

  return reply(interaction, panel({
    title: 'Покупка на маркете',
    icon: ICONS.coins,
    eyebrow: 'Маркет Onix',
    description: `${mentionUser(interaction.user.id)} купил **${listing.name}** за **${formatCoins(listing.price)}**.\nКомиссия экономики: **${formatCoins(fee)}**.`,
    color: COLORS.success
  }));
}

function auctionListComponents(context, guildId) {
  const rows = context.store.activeAuctions(guildId).slice(0, 10).map((auction) =>
    `**${auction.id}** — ${auction.name}\nТекущая ставка: ${formatCoins(auction.currentBid || auction.startPrice)} • до конца ${formatDuration(auction.endsAt - Date.now())}`
  );
  return panel({
    title: 'Аукционы Onix',
    icon: '🔨',
    eyebrow: 'Аукционы Onix',
    description: 'Ставка сразу списывает монеты; при перебитии прежнему лидеру возвращают. По истечении 24 часов предмет уходит победителю автоматически.',
    color: COLORS.economy,
    lines: rows.length ? rows : ['Активных аукционов нет.']
  });
}

async function createAuction(interaction, context, { type, name, startPrice }) {
  if (!Number.isInteger(startPrice) || startPrice < 1) return reply(interaction, errorPanel('Стартовая цена должна быть целым числом ≥ 1.'), { ephemeral: true });
  const auction = context.store.addAuction(interaction.guildId, {
    sellerId: interaction.user.id,
    type,
    name,
    startPrice,
    currentBid: startPrice,
    currentBidderId: null
  });
  await context.store.save();
  return reply(interaction, successPanel(`Аукцион **${auction.name}** создан.\nID: \`${auction.id}\``, 'Аукцион запущен'));
}

async function bidAuction(interaction, context, auctionId, amount) {
  const guild = context.store.guild(interaction.guildId);
  const auction = guild.auctions.find((item) => item.id === auctionId && item.status === 'active');
  if (!auction || auction.endsAt <= Date.now()) return reply(interaction, errorPanel('Активный аукцион не найден.'), { ephemeral: true });
  if (auction.sellerId === interaction.user.id) return reply(interaction, errorPanel('Нельзя делать ставку на свой аукцион.'), { ephemeral: true });
  if (!Number.isInteger(amount) || amount <= (auction.currentBid || auction.startPrice)) return reply(interaction, errorPanel('Ставка должна быть выше текущей.'), { ephemeral: true });

  const bidder = context.store.ensureUser(interaction.guildId, interaction.user);
  if (auction.currentBidderId) {
    const prev = context.store.getUser(interaction.guildId, auction.currentBidderId);
    if (prev) prev.balance = Number(prev.balance || 0) + Number(auction.currentBid || 0);
  }
  if (bidder.balance < amount) return reply(interaction, errorPanel('У тебя не хватает монет на такую ставку.'), { ephemeral: true });
  bidder.balance -= amount;

  auction.currentBid = amount;
  auction.currentBidderId = interaction.user.id;
  auction.bids.unshift({ userId: interaction.user.id, amount, createdAt: Date.now() });
  await context.store.save();

  return reply(interaction, panel({
    title: 'Новая ставка',
    icon: ICONS.up,
    eyebrow: 'Аукционы Onix',
    description: `${mentionUser(interaction.user.id)} поставил **${formatCoins(amount)}** на **${auction.name}**.`,
    color: COLORS.economy,
    footer: `До конца: ${formatDuration(auction.endsAt - Date.now())}`
  }));
}

// Статичная панель маркета и аукционов (публикуется /панель).
function hubPanel(imageUrl) {
  return panel({
    imageUrl,
    title: 'Маркет и аукционы',
    icon: ICONS.shop,
    eyebrow: 'Маркет Onix',
    description: 'Покупай и продавай предметы между игроками, выставляй лоты и участвуй в аукционах.',
    color: COLORS.economy,
    actions: [
      button('market:hub:list', '🛒 Лоты', ButtonStyle.Primary),
      button('market:hub:sell', '🏷️ Продать', ButtonStyle.Success),
      button('market:hub:buy', '💳 Купить', ButtonStyle.Secondary),
      button('market:hub:auctions', '🔨 Аукционы', ButtonStyle.Primary),
      button('market:hub:acreate', '📢 Создать аукцион', ButtonStyle.Success),
      button('market:hub:abid', '💰 Ставка', ButtonStyle.Secondary)
    ]
  });
}

const MARKET_TYPE_OPTIONS = MARKET_TYPES.map((item) => ({ label: item.name, value: item.value }));

function sellModal(type) {
  return new ModalBuilder()
    .setCustomId(`market:hub:sell-submit:${type}`)
    .setTitle('Выставить лот')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Название предмета').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(64).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Цена в монетах').setStyle(TextInputStyle.Short).setMaxLength(8).setRequired(true))
    );
}

function auctionModal(type) {
  return new ModalBuilder()
    .setCustomId(`market:hub:acreate-submit:${type}`)
    .setTitle('Создать аукцион')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Название предмета').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(64).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('start').setLabel('Стартовая цена').setStyle(TextInputStyle.Short).setMaxLength(8).setRequired(true))
    );
}

function idAmountModal(customId, title, idLabel, amountLabel) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id').setLabel(idLabel).setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(true)),
      ...(amountLabel ? [new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel(amountLabel).setStyle(TextInputStyle.Short).setMaxLength(8).setRequired(true))] : [])
    );
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('market')
      .setDescription('Маркет между пользователями')
      .addSubcommand((subcommand) => subcommand.setName('список').setDescription('Показать активные лоты'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('продать')
          .setDescription('Выставить предмет на маркет')
          .addStringOption((option) =>
            option.setName('тип').setDescription('Тип предмета').addChoices(...MARKET_TYPES).setRequired(true)
          )
          .addStringOption((option) =>
            option.setName('название').setDescription('Название предмета').setMinLength(2).setMaxLength(64).setRequired(true)
          )
          .addIntegerOption((option) =>
            option.setName('цена').setDescription('Цена').setMinValue(1).setMaxValue(10000000).setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('купить')
          .setDescription('Купить лот')
          .addStringOption((option) => option.setName('лот').setDescription('ID лота').setRequired(true))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'список') {
        const { components, files } = await marketListComponents(context, interaction.guildId);
        return reply(interaction, components, { files });
      }
      if (subcommand === 'продать') {
        return sellListing(interaction, context, {
          type: interaction.options.getString('тип', true),
          name: interaction.options.getString('название', true),
          price: interaction.options.getInteger('цена', true)
        });
      }
      return buyListing(interaction, context, interaction.options.getString('лот', true));
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('auction')
      .setDescription('Аукционы между пользователями')
      .addSubcommand((subcommand) => subcommand.setName('список').setDescription('Показать активные аукционы'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('создать')
          .setDescription('Создать аукцион на 24 часа')
          .addStringOption((option) =>
            option.setName('тип').setDescription('Тип предмета').addChoices(...MARKET_TYPES).setRequired(true)
          )
          .addStringOption((option) =>
            option.setName('название').setDescription('Название предмета').setMinLength(2).setMaxLength(64).setRequired(true)
          )
          .addIntegerOption((option) =>
            option.setName('старт').setDescription('Стартовая цена').setMinValue(1).setMaxValue(10000000).setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('ставка')
          .setDescription('Сделать ставку')
          .addStringOption((option) => option.setName('аукцион').setDescription('ID аукциона').setRequired(true))
          .addIntegerOption((option) => option.setName('сумма').setDescription('Сумма ставки').setMinValue(1).setMaxValue(10000000).setRequired(true))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'список') return reply(interaction, auctionListComponents(context, interaction.guildId));
      if (subcommand === 'создать') {
        return createAuction(interaction, context, {
          type: interaction.options.getString('тип', true),
          name: interaction.options.getString('название', true),
          startPrice: interaction.options.getInteger('старт', true)
        });
      }
      return bidAuction(interaction, context, interaction.options.getString('аукцион', true), interaction.options.getInteger('сумма', true));
    }
  }
];

async function handleComponent(interaction, context) {
  const isModal = interaction.isModalSubmit?.();
  const isStringSel = interaction.isStringSelectMenu?.();
  if (!interaction.isButton() && !isModal && !isStringSel) return false;
  if (!interaction.customId.startsWith('market:hub')) return false;

  const guildError = requireGuild(interaction);
  if (guildError) {
    await reply(interaction, errorPanel(guildError), { ephemeral: true });
    return true;
  }

  const parts = interaction.customId.split(':');
  const sub = parts[2];

  if (sub === 'list') {
    const { components, files } = await marketListComponents(context, interaction.guildId);
    await reply(interaction, components, { files, ephemeral: true });
    return true;
  }
  if (sub === 'auctions') { await reply(interaction, auctionListComponents(context, interaction.guildId), { ephemeral: true }); return true; }

  if (sub === 'sell') {
    await reply(interaction, panel({ title: 'Выставить лот', icon: ICONS.shop, eyebrow: 'Маркет Onix', description: 'Выбери тип предмета.', color: COLORS.economy, actions: [select('market:hub:sell-type', 'Тип', MARKET_TYPE_OPTIONS)] }), { ephemeral: true });
    return true;
  }
  if (sub === 'sell-type') { await interaction.showModal(sellModal(interaction.values[0])); return true; }
  if (sub === 'sell-submit') {
    await sellListing(interaction, context, {
      type: parts[3],
      name: interaction.fields.getTextInputValue('name'),
      price: Number.parseInt(interaction.fields.getTextInputValue('price').trim(), 10)
    });
    return true;
  }

  if (sub === 'buy') {
    await interaction.showModal(idAmountModal('market:hub:buy-submit', 'Купить лот', 'ID лота'));
    return true;
  }
  if (sub === 'buy-submit') { await buyListing(interaction, context, interaction.fields.getTextInputValue('id').trim()); return true; }

  if (sub === 'acreate') {
    await reply(interaction, panel({ title: 'Создать аукцион', icon: '🔨', eyebrow: 'Аукционы Onix', description: 'Выбери тип предмета.', color: COLORS.economy, actions: [select('market:hub:acreate-type', 'Тип', MARKET_TYPE_OPTIONS)] }), { ephemeral: true });
    return true;
  }
  if (sub === 'acreate-type') { await interaction.showModal(auctionModal(interaction.values[0])); return true; }
  if (sub === 'acreate-submit') {
    await createAuction(interaction, context, {
      type: parts[3],
      name: interaction.fields.getTextInputValue('name'),
      startPrice: Number.parseInt(interaction.fields.getTextInputValue('start').trim(), 10)
    });
    return true;
  }

  if (sub === 'abid') {
    await interaction.showModal(idAmountModal('market:hub:abid-submit', 'Ставка на аукцион', 'ID аукциона', 'Сумма ставки'));
    return true;
  }
  if (sub === 'abid-submit') {
    await bidAuction(interaction, context, interaction.fields.getTextInputValue('id').trim(), Number.parseInt(interaction.fields.getTextInputValue('amount').trim(), 10));
    return true;
  }

  return false;
}

module.exports = {
  commands,
  handleComponent,
  hubPanel
};
