const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { COLORS, ICONS, ButtonStyle, button, errorPanel, mediaPanel, panel, reply, roleSelect, select, update } = require('../ui/components');
const { displayName, formatCoins, formatDuration, levelFromXp, mentionUser } = require('../utils/format');
const { PROFILE_CATALOG, findCatalogItem, buildProfileCard, buildRepCard } = require('../services/profileCard');
const achievements = require('../services/achievements');
const quests = require('../services/quests');

const HOUR_MS = 60 * 60 * 1000;
const REP_COOLDOWN_MS = 12 * HOUR_MS;

// Теги активности по скользящим окнам (как «#Самый активный / #За 2 часа»).
function activityTags(store, guildId, userId) {
  const tags = [];
  const day = store.activityRank(guildId, userId, 24 * HOUR_MS);
  if (day.rank === 1) tags.push('#Самый активный');
  else if (day.rank >= 2 && day.rank <= 3) tags.push('#В топе активных');
  const recent = store.activityRank(guildId, userId, 2 * HOUR_MS);
  if (recent.rank >= 1 && recent.rank <= 3) tags.push('#За 2 часа');
  return tags;
}

const CUSTOM_OPTIONS = [
  { option: 'рамка', type: 'frames', key: 'frame', ownedKey: 'frames' },
  { option: 'цвет', type: 'colors', key: 'color', ownedKey: 'colors' },
  { option: 'фон', type: 'backgrounds', key: 'background', ownedKey: 'backgrounds' },
  { option: 'значок', type: 'icons', key: 'icon', ownedKey: 'icons' },
  { option: 'титул', type: 'titles', key: 'title', ownedKey: 'titles' },
  { option: 'бейдж', type: 'badges', key: 'favoriteBadge', ownedKey: 'badges' }
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

function optionByType(type) {
  return CUSTOM_OPTIONS.find((entry) => entry.type === type);
}

function favoriteRoleLines(profile) {
  const roles = profile.favoriteRoles || [];
  if (roles.length === 0) return ['Любимые роли пока не выбраны.'];
  return roles.map((role) => /^\d{10,}$/.test(String(role)) ? `<@&${role}>` : String(role));
}

function catalogPanel(profile, ownerId, userId = ownerId) {
  const lines = CUSTOM_OPTIONS.map((entry) => {
    const current = findCatalogItem(entry.type, profile.customization?.[entry.key]);
    const owned = profile.cosmetics?.[entry.ownedKey]?.length || 0;
    return `**${entry.option}** — ${current?.name || 'не выбрано'}\n-# Куплено вариантов: ${owned}/${PROFILE_CATALOG[entry.type].length}`;
  });

  return panel({
    title: 'Кастомизация профиля',
    icon: ICONS.shop,
    eyebrow: 'Профиль Onix',
    description: 'Настройка работает через меню Components v2. Если предмет не куплен, бот спишет цену и добавит его в коллекцию.',
    color: COLORS.profile,
    lines,
    actions: [
      button(`profile:customize:${ownerId}:${userId}`, '⚙ Настроить', ButtonStyle.Primary, ownerId !== userId),
      button(`profile:summary:${ownerId}:${userId}`, '↩ Назад', ButtonStyle.Secondary)
    ]
  });
}

function customizationHubPanel(profile, ownerId, userId = ownerId, notice) {
  const lines = CUSTOM_OPTIONS.map((entry) => {
    const current = findCatalogItem(entry.type, profile.customization?.[entry.key]);
    return `**${entry.option}:** ${current?.name || 'не выбрано'}`;
  });
  lines.push(`**любимые роли:** ${favoriteRoleLines(profile).join(', ')}`);

  return panel({
    title: 'Настройка профиля',
    icon: ICONS.profile,
    eyebrow: 'Профиль Onix',
    description: notice || 'Выбери раздел в меню ниже. Покупка и применение происходят после выбора предмета.',
    color: COLORS.profile,
    lines,
    actions: [
      select(
        `profile:customcat:${ownerId}:${userId}`,
        'Выбрать раздел кастомизации',
        CUSTOM_OPTIONS.map((entry) => ({
          label: entry.option,
          value: entry.type,
          description: `Текущий вариант: ${findCatalogItem(entry.type, profile.customization?.[entry.key])?.name || 'не выбрано'}`
        }))
      ),
      roleSelect(`profile:favroles:${ownerId}:${userId}`, 'Выбрать любимые роли', 0, 5),
      button(`profile:summary:${ownerId}:${userId}`, '↩ Назад', ButtonStyle.Secondary)
    ]
  });
}

function customizationItemsPanel(profile, ownerId, userId, type) {
  const entry = optionByType(type);
  if (!entry) return errorPanel('Такой раздел кастомизации не найден.');
  const current = findCatalogItem(type, profile.customization?.[entry.key]);

  return panel({
    title: `Настройка: ${entry.option}`,
    icon: ICONS.profile,
    eyebrow: 'Профиль Onix',
    description: `Сейчас выбрано: **${current?.name || 'не выбрано'}**.`,
    color: COLORS.profile,
    lines: PROFILE_CATALOG[type].map((item) => `**${item.name}** — ${formatCoins(item.price)}`),
    actions: [
      select(
        `profile:customitem:${ownerId}:${userId}:${type}`,
        `Выбрать ${entry.option}`,
        PROFILE_CATALOG[type].map((item) => ({
          label: item.name,
          value: item.id,
          description: item.price > 0 ? `${item.price} монет` : 'бесплатно'
        }))
      ),
      ...(type === 'colors' ? [button(`profile:hexopen:${ownerId}:${userId}`, '🎨 Свой HEX', ButtonStyle.Secondary)] : []),
      button(`profile:customize:${ownerId}:${userId}`, '↩ Назад', ButtonStyle.Secondary)
    ]
  });
}

function normalizeHex(value) {
  const v = String(value || '').trim().replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(v) ? `#${v.toLowerCase()}` : null;
}

function favoritesPanel(profile, ownerId, userId = ownerId, notice) {
  return panel({
    title: 'Любимые роли',
    icon: ICONS.star,
    eyebrow: 'Профиль Onix',
    description: notice || 'Выбери до 5 ролей через меню ниже. Они появятся в профиле и карточке персонажа.',
    color: COLORS.profile,
    lines: favoriteRoleLines(profile),
    actions: [
      roleSelect(`profile:favroles:${ownerId}:${userId}`, 'Выбрать любимые роли', 0, 5),
      button(`profile:customize:${ownerId}:${userId}`, '⚙ Настройка профиля', ButtonStyle.Primary),
      button(`profile:summary:${ownerId}:${userId}`, '↩ Назад', ButtonStyle.Secondary)
    ]
  });
}

function profileSummaryPanel(context, guildId, ownerId, user, profile) {
  const clan = context.store.userClan(guildId, user.id);
  const level = levelFromXp(profile.xp);
  const canEdit = ownerId === user.id;
  return panel({
    title: `Профиль — ${displayName(user)}`,
    icon: ICONS.profile,
    eyebrow: 'Профиль Onix',
    description: mentionUser(user.id),
    color: COLORS.profile,
    thumbnail: user.displayAvatarURL({ size: 256 }),
    stats: [
      { icon: ICONS.level, name: 'Уровень', value: profile.prestige > 0 ? `${level.level} 👑${profile.prestige}` : String(level.level) },
      { icon: ICONS.coins, name: 'Баланс', value: formatCoins(profile.balance) },
      { icon: ICONS.star, name: 'Репутация', value: String(profile.reputation || 0) },
      { icon: ICONS.clan, name: 'Клан', value: clan?.name || 'нет' }
    ],
    statColumns: 1,
    lines: [`${ICONS.star} **Любимые роли:** ${favoriteRoleLines(profile).join(', ')}`],
    actions: [
      button(`profile:customize:${ownerId}:${user.id}`, '⚙ Настроить', ButtonStyle.Primary, !canEdit),
      button(`profile:favorites:${ownerId}:${user.id}`, '⭐ Любимые роли', ButtonStyle.Secondary, !canEdit),
      button(`profile:catalog:${ownerId}:${user.id}`, '🛍 Каталог', ButtonStyle.Secondary),
      button(`profile:achievements:${ownerId}:${user.id}`, '🏆 Достижения', ButtonStyle.Secondary)
    ]
  });
}

// Полная карточка профиля (canvas) + панель с действиями. Используется и слэш-командой,
// и кнопкой hub-панели — чтобы в обоих местах был один и тот же визуал с картинкой.
async function fullProfileReply(context, interaction, target, { ephemeral = false } = {}) {
  const profile = context.store.ensureUser(interaction.guildId, target);
  const users = context.store.users(interaction.guildId);
  const member = interaction.guild ? await interaction.guild.members.fetch(target.id).catch(() => null) : null;
  const liveMinutes = member ? await context.voiceTracker.syncMember(member) : context.voiceTracker.currentMinutes(interaction.guildId, target.id);
  const clan = context.store.userClan(interaction.guildId, target.id);
  const rank = rankPosition(users, target.id, (user) => user.xp || 0);
  const relationship = context.store.relationshipForUser(interaction.guildId, target.id);
  const loveLine = relationship
    ? `Любовный профиль: **${relationship.title || 'Активен'}**, ${relationship.xp || 0} XP`
    : `Любовный профиль: **${profile.lovePartnerId ? 'активен' : 'нет пары'}**`;
  achievements.grant(profile);
  const presenceStatus = member?.presence?.status || null;
  const tags = activityTags(context.store, interaction.guildId, target.id);
  const card = await buildProfileCard({ user: target, member, profile, clan, rank, liveMinutes, presenceStatus, tags });
  await context.store.save();

  return reply(
    interaction,
    mediaPanel({
      title: `Профиль персонажа — ${displayName(target)}`,
      icon: ICONS.profile,
      eyebrow: 'Профиль Onix',
      description: mentionUser(target.id),
      lines: [loveLine, `${ICONS.star} Репутация: **${profile.reputation || 0}**`],
      imageUrl: card.imageUrl,
      color: COLORS.profile,
      actions: [
        button(`profile:customize-open:${interaction.user.id}:${target.id}`, '⚙ Настроить', ButtonStyle.Primary, interaction.user.id !== target.id),
        button(`profile:favorites-open:${interaction.user.id}:${target.id}`, '⭐ Любимые роли', ButtonStyle.Secondary, interaction.user.id !== target.id),
        button(`profile:catalog-open:${interaction.user.id}:${target.id}`, '🛍 Каталог', ButtonStyle.Secondary),
        button(`profile:achievements-open:${interaction.user.id}:${target.id}`, '🏆 Достижения', ButtonStyle.Secondary)
      ]
    }),
    { files: card.files, ephemeral }
  );
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
      option.setName('любимые-роли').setDescription('Любимые роли через запятую').setMaxLength(120)
    );
}

// Статичная панель профиля (публикуется /панель). Кнопки открывают личные панели кликнувшего.
function hubPanel(imageUrl) {
  return panel({
    imageUrl,
    title: 'Профиль',
    icon: ICONS.profile,
    eyebrow: 'Профиль Onix',
    description: 'Твой профиль персонажа, кастомизация карточки, любимые роли и достижения.',
    color: COLORS.profile,
    footer: 'Кнопки открывают твой профиль лично для тебя.',
    actions: [
      button('profile:hub:summary', '👤 Мой профиль', ButtonStyle.Primary),
      button('profile:hub:customize', '⚙ Настройка', ButtonStyle.Secondary)
    ]
  });
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
        subcommand
          .setName('настроить')
          .setDescription('Открыть меню настройки профиля')
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
          return reply(interaction, customizationHubPanel(profile, interaction.user.id), { ephemeral: true });
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
            icon: ICONS.success,
            eyebrow: 'Профиль Onix',
            description: `${mentionUser(interaction.user.id)}, настройки сохранены.`,
            color: COLORS.success,
            lines: changed,
            footer: spent > 0 ? `Списано: ${formatCoins(spent)}. Баланс: ${formatCoins(profile.balance)}` : 'Использованы уже купленные предметы.'
          }),
          { ephemeral: true }
        );
      }

      const target = interaction.options.getUser('user') || interaction.user;
      return fullProfileReply(context, interaction, target);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('реп')
      .setDescription('Повысить репутацию участника (раз в 12 часов)')
      .addUserOption((option) =>
        option.setName('user').setDescription('Кому поднять репутацию').setRequired(true)
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const target = interaction.options.getUser('user');
      if (target.bot) {
        return reply(interaction, errorPanel('Боту нельзя поднять репутацию.'), { ephemeral: true });
      }
      if (target.id === interaction.user.id) {
        return reply(interaction, errorPanel('Нельзя поднять репутацию самому себе.'), { ephemeral: true });
      }

      const giver = context.store.ensureUser(interaction.guildId, interaction.user);
      const availableAt = Number(giver.lastRepAt || 0) + REP_COOLDOWN_MS;
      if (Date.now() < availableAt) {
        return reply(
          interaction,
          panel({
            title: 'Репутация',
            icon: ICONS.time,
            eyebrow: 'Социальный рейтинг Onix',
            description: `${mentionUser(interaction.user.id)}, Вы недавно уже поднимали репутацию.\nСледующую можно выдать через **${formatDuration(availableAt - Date.now())}**.`,
            color: COLORS.warning
          }),
          { ephemeral: true }
        );
      }

      const profile = context.store.ensureUser(interaction.guildId, target);
      profile.reputation = Number(profile.reputation || 0) + 1;
      giver.lastRepAt = Date.now();
      quests.progress(giver, 'rep');
      await context.store.save();

      const card = await buildRepCard({ user: target, profile }).catch(() => null);
      if (card) {
        return reply(
          interaction,
          mediaPanel({
            title: 'Репутация повышена',
            icon: ICONS.star,
            eyebrow: 'Социальный рейтинг Onix',
            description: `${mentionUser(interaction.user.id)} поднял репутацию ${mentionUser(target.id)}! ${ICONS.star}`,
            color: COLORS.success,
            imageUrl: card.imageUrl,
            lines: [`${ICONS.star} Репутация ${mentionUser(target.id)}: **${profile.reputation}**`]
          }),
          { files: card.files, ephemeral: false }
        );
      }

      return reply(
        interaction,
        panel({
          title: 'Репутация повышена',
          icon: ICONS.star,
          eyebrow: 'Социальный рейтинг Onix',
          description: `${mentionUser(interaction.user.id)} поднял репутацию ${mentionUser(target.id)}!`,
          color: COLORS.success,
          thumbnail: target.displayAvatarURL({ size: 256 }),
          stats: [{ icon: ICONS.star, name: 'Репутация', value: String(profile.reputation) }]
        }),
        { ephemeral: false }
      );
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.customId.startsWith('profile:')) return false;

  const isRoleSelect = typeof interaction.isRoleSelectMenu === 'function' && interaction.isRoleSelectMenu();
  const isModal = typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit();
  if (!interaction.isButton() && !interaction.isStringSelectMenu() && !isRoleSelect && !isModal) return false;

  const parts = interaction.customId.split(':');

  // Кнопки статичной панели: открыть свой профиль/настройку (ownerId = кликнувший).
  if (parts[1] === 'hub') {
    const selfProfile = context.store.ensureUser(interaction.guildId, interaction.user);
    if (parts[2] === 'customize') {
      await reply(interaction, customizationHubPanel(selfProfile, interaction.user.id), { ephemeral: true });
    } else {
      await fullProfileReply(context, interaction, interaction.user, { ephemeral: true });
    }
    return true;
  }

  const action = parts[1];
  const ownerId = parts.length >= 4 ? parts[2] : interaction.user.id;
  const userId = parts.length >= 4 ? parts[3] : parts[2];
  const extra = parts.length >= 5 ? parts[4] : parts[3];

  if (interaction.user.id !== ownerId) {
    await reply(interaction, errorPanel('Продолжить пользоваться этим меню может только тот, кто вызвал команду.'), { ephemeral: true });
    return true;
  }

  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (!user) {
    await reply(interaction, errorPanel('Пользователь не найден.'), { ephemeral: true });
    return true;
  }

  const profile = context.store.ensureUser(interaction.guildId, user);
  const editingActions = new Set(['customize-open', 'customize', 'customcat', 'customitem', 'favorites-open', 'favorites', 'favroles', 'hexopen', 'hexsubmit']);
  if (editingActions.has(action) && interaction.user.id !== userId) {
    await reply(interaction, errorPanel('Настраивать этот профиль может только его владелец.'), { ephemeral: true });
    return true;
  }

  if (action === 'catalog-open') {
    await reply(interaction, catalogPanel(profile, ownerId, userId), { ephemeral: true });
    return true;
  }

  if (action === 'customize-open') {
    await reply(interaction, customizationHubPanel(profile, ownerId, userId), { ephemeral: true });
    return true;
  }

  if (action === 'favorites-open') {
    await reply(interaction, favoritesPanel(profile, ownerId, userId), { ephemeral: true });
    return true;
  }

  if (action === 'summary') {
    await update(interaction, profileSummaryPanel(context, interaction.guildId, ownerId, user, profile));
    return true;
  }

  if (action === 'customize') {
    await update(interaction, customizationHubPanel(profile, ownerId, userId));
    return true;
  }

  if (action === 'favorites') {
    await update(interaction, favoritesPanel(profile, ownerId, userId));
    return true;
  }

  if (action === 'customcat') {
    const [type] = interaction.values;
    await update(interaction, customizationItemsPanel(profile, ownerId, userId, type));
    return true;
  }

  if (action === 'customitem') {
    const type = extra;
    const option = optionByType(type);
    const [itemId] = interaction.values;
    const item = option ? findCatalogItem(type, itemId) : null;
    if (!option || !item) {
      await reply(interaction, errorPanel('Предмет кастомизации не найден.'), { ephemeral: true });
      return true;
    }

    try {
      const spent = applyCustomization(profile, option, item);
      if (spent > 0) {
        context.store.recordTransaction(interaction.guildId, {
          type: 'profile',
          fromId: interaction.user.id,
          amount: spent,
          note: 'кастомизация профиля'
        });
      }
      await context.store.save();
      await update(interaction, customizationHubPanel(profile, ownerId, userId, `Сохранено: **${item.name}**${spent > 0 ? `, списано ${formatCoins(spent)}` : ', предмет уже был куплен'}.`));
    } catch (error) {
      if (error.message === 'INSUFFICIENT_FUNDS') {
        await reply(interaction, errorPanel(`Не хватает монет для покупки **${item.name}**. Цена: ${formatCoins(item.price)}.`), { ephemeral: true });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (action === 'favroles') {
    profile.favoriteRoles = interaction.values.slice(0, 5);
    await context.store.save();
    await update(interaction, favoritesPanel(profile, ownerId, userId, 'Любимые роли обновлены.'));
    return true;
  }

  if (action === 'hexopen') {
    const modal = new ModalBuilder()
      .setCustomId(`profile:hexsubmit:${ownerId}:${userId}`)
      .setTitle('Свой раскрас (HEX)')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('hex')
            .setLabel('Цвет в HEX, например #ff5a6e')
            .setStyle(TextInputStyle.Short)
            .setMinLength(6)
            .setMaxLength(7)
            .setRequired(true)
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (action === 'hexsubmit') {
    const hex = normalizeHex(interaction.fields.getTextInputValue('hex'));
    if (!hex) {
      await reply(interaction, errorPanel('Неверный HEX. Пример правильного: `#ff5a6e`.'), { ephemeral: true });
      return true;
    }
    profile.customization.color = hex;
    await context.store.save();
    await reply(
      interaction,
      panel({
        title: 'Раскрас обновлён',
        icon: ICONS.success,
        eyebrow: 'Профиль Onix',
        description: `Акцентный цвет теперь \`${hex}\`. Открой \`/profile карточка\`, чтобы увидеть.`,
        color: COLORS.profile
      }),
      { ephemeral: true }
    );
    return true;
  }

  achievements.grant(profile);
  const achievementNames = profile.achievements
    .slice()
    .reverse()
    .slice(0, 8)
    .map((a) => (typeof a === 'string' ? a : a.name));
  const achievementsPanel = panel({
      title: `Достижения — ${displayName(user)}`,
      icon: ICONS.tops,
      eyebrow: 'Профиль Onix',
      description: profile.achievements.length ? 'Последние достижения профиля.' : 'Достижения пока пустые. Общайся и сиди в войсе, чтобы их открыть.',
      color: COLORS.profile,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      lines: (achievementNames.length ? achievementNames : ['Пока ничего не открыто']).map((a) => `${ICONS.star} ${a}`),
      actions: [button(`profile:summary:${ownerId}:${userId}`, '↩ Назад', ButtonStyle.Secondary)]
    });

  if (action === 'achievements-open') {
    await reply(interaction, achievementsPanel, { ephemeral: true });
    return true;
  }

  await update(interaction, achievementsPanel);
  return true;
}

module.exports = {
  commands,
  handleComponent,
  hubPanel
};
