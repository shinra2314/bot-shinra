const { SlashCommandBuilder } = require('discord.js');
const { ButtonStyle, COLORS, button, errorPanel, panel, reply, successPanel, update } = require('../ui/components');
const { formatCoins, mentionUser } = require('../utils/format');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

const RARITIES = [
  { id: 'common', name: 'Обычная', emoji: '⬜', chance: 0.50, color: COLORS.info },
  { id: 'uncommon', name: 'Необычная', emoji: '🟩', chance: 0.25, color: 0x22C55E },
  { id: 'rare', name: 'Редкая', emoji: '🟦', chance: 0.15, color: 0x3B82F6 },
  { id: 'epic', name: 'Эпическая', emoji: '🟪', chance: 0.07, color: 0xA855F7 },
  { id: 'legendary', name: 'Легендарная', emoji: '🟨', chance: 0.03, color: 0xFACC15 }
];

const CARD_SERIES = [
  { id: 'heroes', name: 'Герои Onix', cards: ['Рыцарь', 'Маг', 'Лучник', 'Алхимик', 'Убийца', 'Целитель', 'Берсерк', 'Некромант'] },
  { id: 'elements', name: 'Стихии', cards: ['Огонь', 'Вода', 'Земля', 'Воздух', 'Молния', 'Лёд', 'Тьма', 'Свет'] },
  { id: 'animals', name: 'Звери', cards: ['Дракон', 'Феникс', 'Грифон', 'Единорог', 'Кракен', 'Цербер', 'Василиск', 'Левиафан'] },
  { id: 'seasons', name: 'Сезоны', cards: ['Весна', 'Лето', 'Осень', 'Зима'] }
];

const PACK_PRICES = {
  basic: 500,
  premium: 2000,
  legendary: 8000
};

const PACK_CARDS = {
  basic: 3,
  premium: 5,
  legendary: 5
};

function rollRarity(packType) {
  let roll = Math.random();
  if (packType === 'premium') roll *= 0.8;
  if (packType === 'legendary') roll *= 0.5;
  for (const rarity of RARITIES) {
    roll -= rarity.chance;
    if (roll <= 0) return rarity;
  }
  return RARITIES[0];
}

function rollCard(packType) {
  const rarity = rollRarity(packType);
  const series = CARD_SERIES[Math.floor(Math.random() * CARD_SERIES.length)];
  const cardName = series.cards[Math.floor(Math.random() * series.cards.length)];
  return {
    id: `${series.id}:${cardName.toLowerCase()}`,
    name: cardName,
    series: series.name,
    seriesId: series.id,
    rarity: rarity.id,
    rarityName: rarity.name,
    emoji: rarity.emoji,
    obtainedAt: Date.now()
  };
}

function ensureCards(profile) {
  profile.cards ||= [];
  profile.albums ||= {};
  return profile;
}

function formatCard(card) {
  const rarity = RARITIES.find((r) => r.id === card.rarity) || RARITIES[0];
  return `${rarity.emoji} **${card.name}** (${card.series}) — *${card.rarityName}*`;
}

function albumProgress(profile) {
  const results = [];
  for (const series of CARD_SERIES) {
    const owned = new Set(profile.cards.filter((c) => c.seriesId === series.id).map((c) => c.name));
    results.push({
      name: series.name,
      owned: owned.size,
      total: series.cards.length,
      complete: owned.size >= series.cards.length
    });
  }
  return results;
}

function craftCards(profile, cardId, count) {
  const matching = profile.cards.filter((c) => c.id === cardId);
  if (matching.length < count) return null;

  const rarity = RARITIES.find((r) => r.id === matching[0].rarity);
  const nextRarity = RARITIES[RARITIES.indexOf(rarity) + 1];
  if (!nextRarity) return null;

  for (let i = 0; i < count; i++) {
    const idx = profile.cards.findIndex((c) => c.id === cardId);
    if (idx !== -1) profile.cards.splice(idx, 1);
  }

  const series = CARD_SERIES.find((s) => s.id === matching[0].seriesId) || CARD_SERIES[0];
  const cardName = series.cards[Math.floor(Math.random() * series.cards.length)];
  const crafted = {
    id: `${series.id}:${cardName.toLowerCase()}`,
    name: cardName,
    series: series.name,
    seriesId: series.id,
    rarity: nextRarity.id,
    rarityName: nextRarity.name,
    emoji: nextRarity.emoji,
    obtainedAt: Date.now()
  };
  profile.cards.push(crafted);
  return crafted;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('cards')
      .setDescription('Коллекционные карточки')
      .addSubcommand((sub) =>
        sub.setName('купить').setDescription('Купить набор карточек')
          .addStringOption((opt) =>
            opt.setName('набор').setDescription('Тип набора').setRequired(true)
              .addChoices(
                { name: `Базовый (${PACK_PRICES.basic} монет, ${PACK_CARDS.basic} карты)`, value: 'basic' },
                { name: `Премиум (${PACK_PRICES.premium} монет, ${PACK_CARDS.premium} карт)`, value: 'premium' },
                { name: `Легендарный (${PACK_PRICES.legendary} монет, ${PACK_CARDS.legendary} карт)`, value: 'legendary' }
              )
          )
      )
      .addSubcommand((sub) =>
        sub.setName('коллекция').setDescription('Посмотреть свою коллекцию')
          .addUserOption((opt) => opt.setName('user').setDescription('Чья коллекция'))
      )
      .addSubcommand((sub) =>
        sub.setName('альбомы').setDescription('Прогресс альбомов')
      )
      .addSubcommand((sub) =>
        sub.setName('обменять').setDescription('Предложить обмен карточкой')
          .addUserOption((opt) => opt.setName('user').setDescription('С кем обменяться').setRequired(true))
          .addStringOption((opt) => opt.setName('отдаю').setDescription('Название карты которую отдаёшь').setRequired(true))
          .addStringOption((opt) => opt.setName('хочу').setDescription('Название карты которую хочешь').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName('крафт').setDescription('Объединить 3 одинаковых карты в карту выше редкости')
          .addStringOption((opt) => opt.setName('карта').setDescription('Название карты для крафта').setRequired(true))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
      const profile = context.store.ensureUser(interaction.guildId, interaction.user);
      ensureCards(profile);

      if (subcommand === 'купить') {
        const packType = interaction.options.getString('набор', true);
        const price = PACK_PRICES[packType];
        if (profile.balance < price) return reply(interaction, errorPanel(`Недостаточно монет. Нужно ${formatCoins(price)}.`), { ephemeral: true });

        profile.balance -= price;
        const count = PACK_CARDS[packType];
        const cards = [];
        for (let i = 0; i < count; i++) {
          const card = rollCard(packType);
          profile.cards.push(card);
          cards.push(card);
        }

        context.store.recordTransaction(interaction.guildId, {
          type: 'expense',
          fromId: interaction.user.id,
          amount: price,
          note: `набор карт: ${packType}`
        });
        await context.store.save();

        const packNames = { basic: 'Базовый', premium: 'Премиум', legendary: 'Легендарный' };
        return reply(interaction, panel({
          title: `🃏 Набор "${packNames[packType]}"`,
          description: `${mentionUser(interaction.user.id)} открыл набор за **${formatCoins(price)}**!\n\n${cards.map(formatCard).join('\n')}`,
          color: cards.some((c) => c.rarity === 'legendary') ? 0xFACC15 : cards.some((c) => c.rarity === 'epic') ? 0xA855F7 : COLORS.info,
          footer: `Всего карт в коллекции: ${profile.cards.length}`
        }));
      }

      if (subcommand === 'коллекция') {
        const target = interaction.options.getUser('user') || interaction.user;
        const targetProfile = context.store.ensureUser(interaction.guildId, target);
        ensureCards(targetProfile);

        if (!targetProfile.cards.length) {
          return reply(interaction, panel({
            title: `🃏 Коллекция — ${target.username}`,
            description: 'Коллекция пуста. Купи набор карточек через `/cards купить`.',
            color: COLORS.info
          }));
        }

        const byRarity = {};
        for (const card of targetProfile.cards) {
          byRarity[card.rarity] ||= [];
          byRarity[card.rarity].push(card);
        }

        const lines = [];
        for (const rarity of RARITIES) {
          const cards = byRarity[rarity.id];
          if (!cards?.length) continue;
          const unique = new Set(cards.map((c) => c.name));
          lines.push(`${rarity.emoji} **${rarity.name}** — ${cards.length} шт. (${unique.size} уникальных)`);
        }

        return reply(interaction, panel({
          title: `🃏 Коллекция — ${target.username}`,
          description: mentionUser(target.id),
          color: COLORS.info,
          lines,
          footer: `Всего карт: ${targetProfile.cards.length}`
        }));
      }

      if (subcommand === 'альбомы') {
        const progress = albumProgress(profile);
        const lines = progress.map((album) => {
          const bar = '█'.repeat(Math.round((album.owned / album.total) * 10)) + '░'.repeat(10 - Math.round((album.owned / album.total) * 10));
          const status = album.complete ? '✅' : '📖';
          return `${status} **${album.name}** — ${album.owned}/${album.total}\n\`${bar}\``;
        });

        const completeCount = progress.filter((a) => a.complete).length;
        return reply(interaction, panel({
          title: '📚 Альбомы',
          description: `Собрано альбомов: **${completeCount}/${progress.length}**`,
          color: COLORS.info,
          lines,
          footer: completeCount === progress.length ? '🏆 Все альбомы собраны!' : 'Собери все карты серии для бонуса!'
        }));
      }

      if (subcommand === 'обменять') {
        const target = interaction.options.getUser('user', true);
        if (target.id === interaction.user.id) return reply(interaction, errorPanel('Нельзя обменяться с самим собой.'), { ephemeral: true });
        if (target.bot) return reply(interaction, errorPanel('Нельзя обменяться с ботом.'), { ephemeral: true });

        const giveName = interaction.options.getString('отдаю', true);
        const wantName = interaction.options.getString('хочу', true);

        const giveCard = profile.cards.find((c) => c.name.toLowerCase() === giveName.toLowerCase());
        if (!giveCard) return reply(interaction, errorPanel(`У тебя нет карты "${giveName}".`), { ephemeral: true });

        const targetProfile = context.store.ensureUser(interaction.guildId, target);
        ensureCards(targetProfile);
        const wantCard = targetProfile.cards.find((c) => c.name.toLowerCase() === wantName.toLowerCase());
        if (!wantCard) return reply(interaction, errorPanel(`У ${target.username} нет карты "${wantName}".`), { ephemeral: true });

        const tradeId = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
        const guild = context.store.guild(interaction.guildId);
        guild.pendingTrades ||= [];
        guild.pendingTrades.push({
          id: tradeId,
          fromId: interaction.user.id,
          toId: target.id,
          giveCardId: giveCard.id,
          giveCardName: giveCard.name,
          wantCardId: wantCard.id,
          wantCardName: wantCard.name,
          createdAt: Date.now()
        });
        await context.store.save();

        return reply(interaction, panel({
          title: '🔄 Предложение обмена',
          description: `${mentionUser(interaction.user.id)} предлагает обмен с ${mentionUser(target.id)}\n\n` +
            `📤 Отдаёт: ${formatCard(giveCard)}\n📥 Хочет: ${formatCard(wantCard)}`,
          color: COLORS.warning,
          actions: [
            button(`trade:accept:${tradeId}`, 'Принять обмен', ButtonStyle.Success),
            button(`trade:reject:${tradeId}`, 'Отклонить', ButtonStyle.Danger)
          ]
        }));
      }

      if (subcommand === 'крафт') {
        const cardName = interaction.options.getString('карта', true);
        const matching = profile.cards.filter((c) => c.name.toLowerCase() === cardName.toLowerCase());
        if (matching.length < 3) {
          return reply(interaction, errorPanel(`Нужно минимум 3 одинаковых карты для крафта. У тебя: ${matching.length}.`), { ephemeral: true });
        }

        const rarity = RARITIES.find((r) => r.id === matching[0].rarity);
        const nextRarity = RARITIES[RARITIES.indexOf(rarity) + 1];
        if (!nextRarity) return reply(interaction, errorPanel('Эти карты уже максимальной редкости.'), { ephemeral: true });

        const crafted = craftCards(profile, matching[0].id, 3);
        if (!crafted) return reply(interaction, errorPanel('Не удалось выполнить крафт.'), { ephemeral: true });

        await context.store.save();
        return reply(interaction, panel({
          title: '⚗️ Крафт карточки',
          description: `${mentionUser(interaction.user.id)} объединил 3x **${cardName}** (${rarity.name})\n\nПолучено: ${formatCard(crafted)}`,
          color: RARITIES.find((r) => r.id === crafted.rarity)?.color || COLORS.info
        }));
      }
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('trade:')) return false;

  const [, action, tradeId] = interaction.customId.split(':');
  const guild = context.store.guild(interaction.guildId);
  guild.pendingTrades ||= [];
  const tradeIndex = guild.pendingTrades.findIndex((t) => t.id === tradeId);
  if (tradeIndex === -1) {
    await reply(interaction, errorPanel('Обмен не найден или истёк.'), { ephemeral: true });
    return true;
  }

  const trade = guild.pendingTrades[tradeIndex];
  if (interaction.user.id !== trade.toId) {
    await reply(interaction, errorPanel('Только получатель может принять/отклонить обмен.'), { ephemeral: true });
    return true;
  }

  guild.pendingTrades.splice(tradeIndex, 1);

  if (action === 'reject') {
    await context.store.save();
    await update(interaction, panel({
      title: '🔄 Обмен отклонён',
      description: `${mentionUser(trade.toId)} отклонил обмен с ${mentionUser(trade.fromId)}.`,
      color: COLORS.danger
    }));
    return true;
  }

  const fromProfile = context.store.getUser(interaction.guildId, trade.fromId);
  const toProfile = context.store.getUser(interaction.guildId, trade.toId);
  if (!fromProfile || !toProfile) {
    await reply(interaction, errorPanel('Профиль одного из участников не найден.'), { ephemeral: true });
    return true;
  }

  ensureCards(fromProfile);
  ensureCards(toProfile);

  const giveIdx = fromProfile.cards.findIndex((c) => c.id === trade.giveCardId);
  const wantIdx = toProfile.cards.findIndex((c) => c.id === trade.wantCardId);
  if (giveIdx === -1 || wantIdx === -1) {
    await reply(interaction, errorPanel('Одна из карт больше не доступна.'), { ephemeral: true });
    return true;
  }

  const giveCard = fromProfile.cards.splice(giveIdx, 1)[0];
  const wantCard = toProfile.cards.splice(wantIdx, 1)[0];
  fromProfile.cards.push(wantCard);
  toProfile.cards.push(giveCard);

  await context.store.save();
  await update(interaction, panel({
    title: '🔄 Обмен завершён!',
    description: `${mentionUser(trade.fromId)} ↔ ${mentionUser(trade.toId)}\n\n` +
      `📤 ${formatCard(giveCard)} → ${mentionUser(trade.toId)}\n` +
      `📥 ${formatCard(wantCard)} → ${mentionUser(trade.fromId)}`,
    color: COLORS.success
  }));
  return true;
}

module.exports = {
  commands,
  handleComponent,
  RARITIES,
  CARD_SERIES
};
