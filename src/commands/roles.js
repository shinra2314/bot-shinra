const { ActionRowBuilder, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { COLORS, ICONS, ButtonStyle, button, errorPanel, panel, reply, successPanel, userSelect } = require('../ui/components');
const { displayName, formatCoins, formatDateTime, formatDuration, mentionUser } = require('../utils/format');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

async function resolveGuild(interaction) {
  if (!interaction.guildId) return null;
  if (interaction.guild) return interaction.guild;
  return interaction.client.guilds.fetch(interaction.guildId).catch(() => null);
}

function parseColor(input) {
  if (!input) return 0x99AAB5;
  const value = input.trim();
  if (!/^#?[0-9a-f]{6}$/i.test(value)) return null;
  return Number.parseInt(value.replace('#', ''), 16);
}

function refundRoleCost(context, guildId, user, profile, usedPass) {
  if (usedPass) {
    profile.rolePasses = Number(profile.rolePasses || 0) + 1;
    return;
  }

  const rolePrice = context.store.economySetting(guildId, 'personalRolePrice');
  profile.balance = Number(profile.balance || 0) + rolePrice;
  context.store.recordTransaction(guildId, {
    type: 'role_refund',
    toId: user.id,
    amount: rolePrice,
    note: 'refund personal role create'
  });
}

async function botCanManageRoles(interaction) {
  const guild = await resolveGuild(interaction);
  if (!guild) return false;
  const member = guild.members.me || await guild.members.fetchMe().catch(() => null);
  return Boolean(member?.permissions.has(PermissionFlagsBits.ManageRoles));
}

async function findStoredRole(interaction, profile) {
  if (!profile.personalRoleId) return null;
  const guild = await resolveGuild(interaction);
  if (!guild) return null;
  return guild.roles.fetch(profile.personalRoleId).catch(() => null);
}

// Создание личной роли — общая логика для slash и кнопки панели.
async function createRole(interaction, context, { name, colorInput, price }) {
  if (!(await botCanManageRoles(interaction))) {
    return reply(interaction, errorPanel('У бота нет права `Manage Roles`.'), { ephemeral: true });
  }
  const guild = await resolveGuild(interaction);
  if (!guild) {
    return reply(interaction, errorPanel('Не удалось получить сервер. Попробуй ещё раз через пару секунд.'), { ephemeral: true });
  }
  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  const existing = await findStoredRole(interaction, profile);
  if (existing) {
    return reply(interaction, errorPanel(`У тебя уже есть личная роль: ${existing}.`), { ephemeral: true });
  }
  const color = parseColor(colorInput);
  if (color === null) {
    return reply(interaction, errorPanel('Цвет должен быть в формате `#RRGGBB`.'), { ephemeral: true });
  }
  const finalPrice = price || 500;

  const rolePrice = context.store.economySetting(interaction.guildId, 'personalRolePrice');
  let usedPass = false;
  if (Number(profile.rolePasses || 0) > 0) {
    profile.rolePasses -= 1;
    usedPass = true;
  } else if (profile.balance >= rolePrice) {
    profile.balance -= rolePrice;
    context.store.recordTransaction(interaction.guildId, {
      type: 'role',
      fromId: interaction.user.id,
      amount: rolePrice,
      note: 'personal role create'
    });
  } else {
    return reply(interaction, errorPanel(`Нужно ${formatCoins(rolePrice)} или купон личной роли.`), { ephemeral: true });
  }

  let role = null;
  try {
    role = await guild.roles.create({ name, color, reason: `Personal role for ${interaction.user.tag}` });
    const member = await guild.members.fetch(interaction.user.id);
    await member.roles.add(role);

    profile.personalRoleId = role.id;
    profile.roleCreatedAt = Date.now();
    profile.roleRenewedAt = Date.now();
    profile.rolePrice = finalPrice;
    profile.rolePurchases = 0;
    profile.roleForSale = true;
    await context.store.save();
  } catch (error) {
    if (role) await role.delete('Personal role create failed, rollback').catch(() => null);
    refundRoleCost(context, interaction.guildId, interaction.user, profile, usedPass);
    await context.store.save();
    console.error('Personal role create failed:', error);
    return reply(
      interaction,
      errorPanel('Не удалось создать или выдать роль. Я вернул списанные монеты/купон. Проверь, что у бота есть `Manage Roles`, а роль бота находится выше создаваемых ролей.'),
      { ephemeral: true }
    );
  }

  return reply(
    interaction,
    successPanel(
      `Создана роль ${role}. ${usedPass ? 'Использован купон.' : `Списано ${formatCoins(rolePrice)}.`}`,
      'Личная роль создана'
    ),
    { ephemeral: true }
  );
}

// Управление личной ролью — общая логика для slash и кнопки панели.
async function manageRole(interaction, context, { name, colorInput, price, forSale }) {
  if (!(await botCanManageRoles(interaction))) {
    return reply(interaction, errorPanel('У бота нет права `Manage Roles`.'), { ephemeral: true });
  }
  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  const role = await findStoredRole(interaction, profile);
  if (!role) {
    profile.personalRoleId = null;
    await context.store.save();
    return reply(interaction, errorPanel('Личная роль не найдена. Создай её через `/role создать`.'), { ephemeral: true });
  }

  const color = parseColor(colorInput);
  if (colorInput && color === null) {
    return reply(interaction, errorPanel('Цвет должен быть в формате `#RRGGBB`.'), { ephemeral: true });
  }
  const hasPrice = price !== null && price !== undefined;
  const hasForSale = forSale !== null && forSale !== undefined;
  if (!name && !colorInput && !hasPrice && !hasForSale) {
    return reply(interaction, errorPanel('Укажи новое название, цвет, цену или статус продажи.'), { ephemeral: true });
  }

  await role.edit({
    name: name || role.name,
    color: colorInput ? color : role.color,
    reason: `Personal role update by ${interaction.user.tag}`
  });
  if (hasPrice) profile.rolePrice = price;
  if (hasForSale) profile.roleForSale = forSale;
  await context.store.save();

  return reply(
    interaction,
    successPanel(`Роль ${role} обновлена. Цена: **${formatCoins(profile.rolePrice)}**. Продажа: **${profile.roleForSale ? 'да' : 'нет'}**.`, 'Личная роль изменена'),
    { ephemeral: true }
  );
}

async function roleInfo(interaction, context, target) {
  const profile = context.store.ensureUser(interaction.guildId, target);
  const role = await findStoredRole(interaction, profile);
  if (!role) {
    if (target.id === interaction.user.id) profile.personalRoleId = null;
    await context.store.save();
    return reply(interaction, errorPanel(`${mentionUser(target.id)} пока не имеет личной роли.`), { ephemeral: true });
  }

  const expiresAt = Number(profile.roleRenewedAt || profile.roleCreatedAt || Date.now()) + 30 * 24 * 60 * 60 * 1000;
  const membersWithRole = role.members?.size ?? 0;

  return reply(
    interaction,
    panel({
      title: 'Личная роль',
      icon: ICONS.profile,
      eyebrow: 'Личные роли Onix',
      description: `${role}\n-# Владелец: ${mentionUser(target.id)} • Создана: ${profile.roleCreatedAt ? formatDateTime(profile.roleCreatedAt) : 'неизвестно'}`,
      color: role.color || COLORS.profile,
      thumbnail: target.displayAvatarURL({ size: 256 }),
      stats: [
        { icon: ICONS.time, name: 'Осталось до оплаты', value: formatDuration(expiresAt - Date.now()) },
        { icon: ICONS.coins, name: 'Цена', value: formatCoins(profile.rolePrice || 500) },
        { icon: ICONS.profile, name: 'Участников', value: String(membersWithRole) },
        { icon: ICONS.up, name: 'Куплена раз', value: String(profile.rolePurchases || 0) },
        { icon: ICONS.shop, name: 'Статус магазина', value: profile.roleForSale === false ? 'скрыта' : 'продается' }
      ],
      statColumns: 2
    })
  );
}

// Статичная панель личных ролей (публикуется /панель).
function hubPanel(imageUrl) {
  return panel({
    imageUrl,
    title: 'Личные роли',
    icon: ICONS.profile,
    eyebrow: 'Личные роли Onix',
    description: 'Создай свою роль, меняй её оформление и цену или смотри информацию о роли.',
    color: COLORS.profile,
    actions: [
      button('role:hub:create', '➕ Создать роль', ButtonStyle.Success),
      button('role:hub:manage', '⚙ Управление', ButtonStyle.Secondary),
      button('role:hub:info', 'ℹ️ Инфо', ButtonStyle.Secondary)
    ]
  });
}

function roleModal(kind) {
  const submit = kind === 'create' ? 'role:hub:create-submit' : 'role:hub:manage-submit';
  const title = kind === 'create' ? 'Создать личную роль' : 'Управление ролью';
  return new ModalBuilder()
    .setCustomId(submit)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel(kind === 'create' ? 'Название роли' : 'Новое название (необязательно)')
          .setStyle(TextInputStyle.Short)
          .setMinLength(kind === 'create' ? 2 : 0)
          .setMaxLength(32)
          .setRequired(kind === 'create')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('color')
          .setLabel('Цвет HEX, например #7C3AED (необязательно)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(7)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('price')
          .setLabel('Цена в магазине (необязательно)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(7)
          .setRequired(false)
      )
    );
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('role')
      .setDescription('Личные роли')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('создать')
          .setDescription('Создать личную роль')
          .addStringOption((option) =>
            option.setName('название').setDescription('Название роли').setMinLength(2).setMaxLength(32).setRequired(true)
          )
          .addStringOption((option) =>
            option.setName('цвет').setDescription('HEX цвет, например #7C3AED').setMaxLength(7)
          )
          .addIntegerOption((option) =>
            option.setName('цена').setDescription('Цена роли в магазине').setMinValue(1).setMaxValue(1000000)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('управление')
          .setDescription('Управление личной ролью')
          .addStringOption((option) =>
            option.setName('название').setDescription('Новое название').setMinLength(2).setMaxLength(32)
          )
          .addStringOption((option) =>
            option.setName('цвет').setDescription('Новый HEX цвет, например #22C55E').setMaxLength(7)
          )
          .addIntegerOption((option) =>
            option.setName('цена').setDescription('Новая цена в магазине').setMinValue(1).setMaxValue(1000000)
          )
          .addBooleanOption((option) =>
            option.setName('продавать').setDescription('Показывать роль в магазине')
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('инфо')
          .setDescription('Информация о личной роли')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь'))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'создать') {
        return createRole(interaction, context, {
          name: interaction.options.getString('название', true),
          colorInput: interaction.options.getString('цвет'),
          price: interaction.options.getInteger('цена')
        });
      }

      if (subcommand === 'управление') {
        return manageRole(interaction, context, {
          name: interaction.options.getString('название'),
          colorInput: interaction.options.getString('цвет'),
          price: interaction.options.getInteger('цена'),
          forSale: interaction.options.getBoolean('продавать')
        });
      }

      return roleInfo(interaction, context, interaction.options.getUser('user') || interaction.user);
    }
  }
];

function parsePriceField(raw) {
  const value = String(raw || '').trim();
  if (!value) return { price: null };
  const price = Number.parseInt(value, 10);
  if (!Number.isInteger(price) || price < 1 || price > 1000000) return { error: true };
  return { price };
}

async function handleComponent(interaction, context) {
  const isModal = interaction.isModalSubmit?.();
  const isUserSel = interaction.isUserSelectMenu?.();
  if (!interaction.isButton() && !isModal && !isUserSel) return false;
  if (!interaction.customId.startsWith('role:hub')) return false;

  const guildError = requireGuild(interaction);
  if (guildError) {
    await reply(interaction, errorPanel(guildError), { ephemeral: true });
    return true;
  }

  const sub = interaction.customId.split(':')[2];

  if (sub === 'create') {
    await interaction.showModal(roleModal('create'));
    return true;
  }
  if (sub === 'manage') {
    await interaction.showModal(roleModal('manage'));
    return true;
  }
  if (sub === 'info') {
    await reply(interaction, panel({
      title: 'Информация о личной роли',
      icon: ICONS.profile,
      eyebrow: 'Личные роли Onix',
      description: 'Выбери пользователя, чью роль показать.',
      color: COLORS.profile,
      actions: [userSelect('role:hub:info-pick', 'Чью роль показать', 1, 1)]
    }), { ephemeral: true });
    return true;
  }
  if (sub === 'info-pick') {
    const target = await interaction.client.users.fetch(interaction.values[0]).catch(() => null);
    if (!target) {
      await reply(interaction, errorPanel('Пользователь не найден.'), { ephemeral: true });
      return true;
    }
    await roleInfo(interaction, context, target);
    return true;
  }
  if (sub === 'create-submit' || sub === 'manage-submit') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const colorInput = interaction.fields.getTextInputValue('color').trim() || null;
    const { price, error } = parsePriceField(interaction.fields.getTextInputValue('price'));
    if (error) {
      await reply(interaction, errorPanel('Цена должна быть целым числом от 1 до 1000000.'), { ephemeral: true });
      return true;
    }
    if (sub === 'create-submit') {
      await createRole(interaction, context, { name, colorInput, price });
    } else {
      await manageRole(interaction, context, { name: name || null, colorInput, price, forSale: null });
    }
    return true;
  }

  return false;
}

module.exports = {
  commands,
  handleComponent,
  hubPanel
};
