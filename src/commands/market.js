const { SlashCommandBuilder } = require('discord.js');
const { COLORS, errorPanel, panel, reply, successPanel } = require('../ui/components');
const { formatCoins, formatDuration, mentionUser } = require('../utils/format');

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
    `**${item.id}** — ${item.name}\nПродавец: ${mentionUser(item.sellerId)} • Цена: ${formatCoins(item.price)} • Тип: ${item.type}`
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
      const guild = context.store.guild(interaction.guildId);

      if (subcommand === 'список') {
        return reply(interaction, panel({
          title: '🛍️ Маркет Onix',
          description: `💸 Комиссия: **${Math.round(COMMISSION * 100)}%** с продажи.`,
          color: COLORS.economy,
          lines: listingRows(context.store.activeMarketListings(interaction.guildId))
        }));
      }

      if (subcommand === 'продать') {
        const profile = context.store.ensureUser(interaction.guildId, interaction.user);
        const listing = context.store.addMarketListing(interaction.guildId, {
          sellerId: interaction.user.id,
          type: interaction.options.getString('тип', true),
          name: interaction.options.getString('название', true),
          price: interaction.options.getInteger('цена', true)
        });
        profile.achievements ||= [];
        if (!profile.achievements.includes('Первый лот на маркете')) profile.achievements.unshift('Первый лот на маркете');
        await context.store.save();
        return reply(interaction, successPanel(`Лот **${listing.name}** выставлен за **${formatCoins(listing.price)}**.\nID: \`${listing.id}\``, 'Лот опубликован'));
      }

      const listingId = interaction.options.getString('лот', true);
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
      buyer.inventory ||= [];
      buyer.inventory.push(`${listing.type}: ${listing.name}`);
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
        title: '🛒 Покупка',
        description: `${mentionUser(interaction.user.id)} купил **${listing.name}** за **${formatCoins(listing.price)}**.\nКомиссия экономики: **${formatCoins(fee)}**.`,
        color: COLORS.economy
      }));
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
      const guild = context.store.guild(interaction.guildId);

      if (subcommand === 'список') {
        const rows = context.store.activeAuctions(interaction.guildId).slice(0, 10).map((auction) =>
          `**${auction.id}** — ${auction.name}\nТекущая ставка: ${formatCoins(auction.currentBid || auction.startPrice)} • до конца ${formatDuration(auction.endsAt - Date.now())}`
        );
        return reply(interaction, panel({
          title: '🔨 Аукционы Onix',
          description: 'Ставки блокируют монеты только логически, списание происходит при завершении вручную в следующем этапе.',
          color: COLORS.economy,
          lines: rows.length ? rows : ['Активных аукционов нет.']
        }));
      }

      if (subcommand === 'создать') {
        const auction = context.store.addAuction(interaction.guildId, {
          sellerId: interaction.user.id,
          type: interaction.options.getString('тип', true),
          name: interaction.options.getString('название', true),
          startPrice: interaction.options.getInteger('старт', true),
          currentBid: interaction.options.getInteger('старт', true),
          currentBidderId: null
        });
        await context.store.save();
        return reply(interaction, successPanel(`Аукцион **${auction.name}** создан.\nID: \`${auction.id}\``, 'Аукцион запущен'));
      }

      const auction = guild.auctions.find((item) => item.id === interaction.options.getString('аукцион', true) && item.status === 'active');
      if (!auction || auction.endsAt <= Date.now()) return reply(interaction, errorPanel('Активный аукцион не найден.'), { ephemeral: true });
      if (auction.sellerId === interaction.user.id) return reply(interaction, errorPanel('Нельзя делать ставку на свой аукцион.'), { ephemeral: true });

      const amount = interaction.options.getInteger('сумма', true);
      if (amount <= (auction.currentBid || auction.startPrice)) return reply(interaction, errorPanel('Ставка должна быть выше текущей.'), { ephemeral: true });
      const bidder = context.store.ensureUser(interaction.guildId, interaction.user);
      if (bidder.balance < amount) return reply(interaction, errorPanel('У тебя не хватает монет на такую ставку.'), { ephemeral: true });

      auction.currentBid = amount;
      auction.currentBidderId = interaction.user.id;
      auction.bids.unshift({ userId: interaction.user.id, amount, createdAt: Date.now() });
      await context.store.save();

      return reply(interaction, panel({
        title: '🔨 Новая ставка',
        description: `${mentionUser(interaction.user.id)} поставил **${formatCoins(amount)}** на **${auction.name}**.`,
        color: COLORS.economy,
        footer: `До конца: ${formatDuration(auction.endsAt - Date.now())}`
      }));
    }
  }
];

module.exports = {
  commands
};
