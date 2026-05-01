const { SlashCommandBuilder } = require('discord.js');
const { COLORS, ButtonStyle, button, errorPanel, mediaPanel, panel, reply, update } = require('../ui/components');
const { displayName, formatCoins, formatMinutes, levelFromXp, mentionUser } = require('../utils/format');
const { PROFILE_CATALOG, findCatalogItem, renderProfileCard } = require('../services/profileCard');

const CUSTOM_OPTIONS = [
  { option: 'рамка', type: 'frames', key: 'frame', ownedKey: 'frames' },
  { option: 'цвет', type: 'colors', key: 'color', ownedKey: 'colors' },
  { option: 'фон', type: 'backgrounds', key: 'background', ownedKey: 'backgrounds' },
  { option: 'значок', type: 'icons', key: 'icon', ownedKey: 'icons' },
  { option: 'титул', type: 'titles', key: 'title', ownedKey: 'titles' },
  { option: 'бейдж', type: 'badges', key: 'favoriteBadge', ownedKey: 'badges' },
  { option: 'статус', type: 'statuses', key: 'status', ownedKey: 'statuses' }
];

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function rankPosition(users, userId, selector) {
  const sorted = users.slice().sort((a, b) => selector(b) - selector(a));
  const index = sorted.findIndex((user) => user.id === userId);
  return index === -1 ? 'нет' : `#${index + 1}`;
}

function choices(type) {
  return PROFILE_CATALOG[type].map((item) => ({ name: `${item.name} (${item.price} мон.)`, value: item.id }));
}

function catalogPanel(profile) {
  const lines = CUSTOM_OPTIONS.map((entry) => {
    const current = findCatalogItem(entry.type, profile.customization?.[entry.key]);
    const owned = profile.cosmetics?.[entry.ownedKey]?.length || 0;
    return `**${entry.option}** — ${current?.name || 'не выбрано'}\n-# Куплено вариантов: ${owned}/${PROFILE_CATALOG[entry.type].length}`;
  });

  return panel({
    title: 'Кастомизация профиля',
    description: 'Выбери параметры через `/profile настроить`. Если предмет не куплен, бот спишет его цену и добавит в коллекцию.',
    color: COLORS.primary,
    lines
  });
}

function applyCustomization(profile, option, item) {
  const owned = profile.cosmetics[option.ownedKey];
  const alreadyOwned = owned.includes(item.id);
  if (!alreadyOwned) {
    if (profile.balance < item.price) throw new Error('INSUFFICIENT_FUNDS');
    profile.balance -= item.price;
    owned.push(item.id);
  }

  profile.customization[option.key] = item.id;
  if (option.type === 'badges' && !profile.badges.includes(item.name)) profile.badges.push(item.name);
  if (option.type === 'titles' && !profile.cosmetics.titles.includes(item.id)) profile.cosmetics.titles.push(item.id);
  return alreadyOwned ? 0 : item.price;
}

function addChoiceOptions(subcommand) {
  return subcommand
    .addStringOption((option) =>
      option.setName('рамка').setDescription('Рамка профиля').addChoices(...choices('frames'))
    )
    .addStringOption((option) =>
      option.setName('цвет').setDescription('Цвет профиля').addChoices(...choices('colors'))
    )
    .addStringOption((option) =>
      option.setName('фон').setDescription('Фон карточки').addChoices(...choices('backgrounds'))
    )
    .addStringOption((option) =>
      option.setName('значок').setDescription('Значок профиля').addChoices(...choices('icons'))
    )
    .addStringOption((option) =>
      option.setName('титул').setDescription('Титул').addChoices(...choices('titles'))
    )
    .addStringOption((option) =>
      option.setName('бейдж').setDescription('Любимый бейдж').addChoices(...choices('badges'))
    )
    .addStringOption((option) =>
      option.setName('статус').setDescription('Эмодзи-статус на карточке').addChoices(...choices('statuses'))
    )
    .addStringOption((option) =>
      option.setName('любимые-роли').setDescription('Любимые роли через запятую').setMaxLength(120)
    );
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('profile')
      .setDescription('Профиль персонажа Onix')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('карточка')
          .setDescription('Показать карточку персонажа')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь'))
      )
      .addSubcommand((subcommand) =>
        addChoiceOptions(
          subcommand
            .setName('настроить')
            .setDescription('Настроить рамку, цвет, фон, значок, титул и бейдж')
        )
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'настроить') {
        const profile = context.store.ensureUser(interaction.guildId, interaction.user);
        let spent = 0;
        const changed = [];

        for (const option of CUSTOM_OPTIONS) {
          const value = interaction.options.getString(option.option);
          if (!value) continue;
          const item = findCatalogItem(option.type, value);
          if (!item) continue;
          try {
            spent += applyCustomization(profile, option, item);
          } catch (error) {
            if (error.message === 'INSUFFICIENT_FUNDS') {
              return reply(interaction, errorPanel(`Не хватает монет для покупки **${item.name}**. Цена: ${formatCoins(item.price)}.`), { ephemeral: true });
            }
            throw error;
          }
          changed.push(`${option.option}: ${item.name}`);
        }

        const roles = interaction.options.getString('любимые-роли');
        if (roles) {
          profile.favoriteRoles = roles.split(',').map((role) => role.trim()).filter(Boolean).slice(0, 5);
          changed.push('любимые роли обновлены');
        }

        if (changed.length === 0) {
          return reply(interaction, catalogPanel(profile), { ephemeral: true });
        }

        if (spent > 0) {
          context.store.recordTransaction(interaction.guildId, {
            type: 'profile',
            fromId: interaction.user.id,
            amount: spent,
            note: 'кастомизация профиля'
          });
        }

        await context.store.save();
        return reply(
          interaction,
          panel({
            title: 'Профиль обновлён',
            description: `${mentionUser(interaction.user.id)}, настройки сохранены.`,
            color: COLORS.success,
            lines: changed,
            footer: spent > 0 ? `Списано: ${formatCoins(spent)}. Баланс: ${formatCoins(profile.balance)}` : 'Использованы уже купленные предметы.'
          }),
          { ephemeral: true }
        );
      }

      const target = interaction.options.getUser('user') || interaction.user;
      const profile = context.store.ensureUser(interaction.guildId, target);
      const level = levelFromXp(profile.xp);
      const users = context.store.users(interaction.guildId);
      const liveMinutes = context.voiceTracker.currentMinutes(interaction.guildId, target.id);
      const clan = context.store.userClan(interaction.guildId, target.id);
      const rank = rankPosition(users, target.id, (user) => user.xp || 0);

      const image = await renderProfileCard({ user: target, profile, clan, liveMinutes, rank });
      await context.store.save();

      return reply(
        interaction,
        mediaPanel({
          title: `Профиль персонажа — ${displayName(target)}`,
          description: [
            `Уровень: **${level.level}**`,
            `Баланс: **${formatCoins(profile.balance)}**`,
            `Клан: **${clan?.name || 'нет'}**`,
            `Голосовой онлайн: **${formatMinutes(profile.voiceMinutes + liveMinutes)}**`
          ].join('\n'),
          imageUrl: 'attachment://profile.png',
          color: COLORS.primary,
          actions: [
            button(`profile:catalog:${target.id}`, 'Каталог кастомизации', ButtonStyle.Secondary),
            button(`profile:achievements:${target.id}`, 'Достижения', ButtonStyle.Secondary)
          ]
        }),
        { files: [{ attachment: image, name: 'profile.png' }] }
      );
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('profile:')) return false;

  const [, action, userId] = interaction.customId.split(':');
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (!user) {
    await reply(interaction, errorPanel('Пользователь не найден.'), { ephemeral: true });
    return true;
  }

  const profile = context.store.ensureUser(interaction.guildId, user);
  if (action === 'catalog') {
    await reply(interaction, catalogPanel(profile), { ephemeral: true });
    return true;
  }

  await update(
    interaction,
    panel({
      title: `Достижения — ${displayName(user)}`,
      description: profile.achievements.length ? 'Последние достижения профиля.' : 'Достижения пока пустые.',
      color: COLORS.primary,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      lines: profile.achievements.length ? profile.achievements.slice(0, 8) : ['Первый профиль', 'Старт сезона', 'Onix Member']
    })
  );
  return true;
}

module.exports = {
  commands,
  handleComponent
};
