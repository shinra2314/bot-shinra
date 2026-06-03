const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { COLORS, ICONS, errorPanel, panel, reply, successPanel } = require('../ui/components');
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
      const guild = await resolveGuild(interaction);
      if (!guild) {
        return reply(interaction, errorPanel('Не удалось получить сервер. Попробуй еще раз через пару секунд.'), { ephemeral: true });
      }

      if (subcommand === 'создать') {
        if (!(await botCanManageRoles(interaction))) {
          return reply(interaction, errorPanel('У бота нет права `Manage Roles`.'), { ephemeral: true });
        }

        const profile = context.store.ensureUser(interaction.guildId, interaction.user);
        const existing = await findStoredRole(interaction, profile);
        if (existing) {
          return reply(interaction, errorPanel(`У тебя уже есть личная роль: ${existing}.`), { ephemeral: true });
        }

        const name = interaction.options.getString('название', true);
        const color = parseColor(interaction.options.getString('цвет'));
        const price = interaction.options.getInteger('цена') || 500;
        if (color === null) {
          return reply(interaction, errorPanel('Цвет должен быть в формате `#RRGGBB`.'), { ephemeral: true });
        }

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
          return reply(
            interaction,
            errorPanel(`Нужно ${formatCoins(rolePrice)} или купон личной роли.`),
            { ephemeral: true }
          );
        }

        let role = null;
        try {
          role = await guild.roles.create({
            name,
            color,
            reason: `Personal role for ${interaction.user.tag}`
          });
          const member = await guild.members.fetch(interaction.user.id);
          await member.roles.add(role);

          profile.personalRoleId = role.id;
          profile.roleCreatedAt = Date.now();
          profile.roleRenewedAt = Date.now();
          profile.rolePrice = price;
          profile.rolePurchases = 0;
          profile.roleForSale = true;
          await context.store.save();
        } catch (error) {
          if (role) {
            await role.delete('Personal role create failed, rollback').catch(() => null);
          }
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

      if (subcommand === 'управление') {
        if (!(await botCanManageRoles(interaction))) {
          return reply(interaction, errorPanel('У бота нет права `Manage Roles`.'), { ephemeral: true });
        }

        const profile = context.store.ensureUser(interaction.guildId, interaction.user);
        const role = await findStoredRole(interaction, profile);
        if (!role) {
          profile.personalRoleId = null;
          await context.store.save();
          return reply(interaction, errorPanel('Личная роль не найдена. Создай ее через `/role создать`.'), { ephemeral: true });
        }

        const name = interaction.options.getString('название');
        const colorInput = interaction.options.getString('цвет');
        const price = interaction.options.getInteger('цена');
        const forSale = interaction.options.getBoolean('продавать');
        const color = parseColor(colorInput);
        if (colorInput && color === null) {
          return reply(interaction, errorPanel('Цвет должен быть в формате `#RRGGBB`.'), { ephemeral: true });
        }
        if (!name && !colorInput && price === null && forSale === null) {
          return reply(interaction, errorPanel('Укажи новое название, цвет, цену или статус продажи.'), { ephemeral: true });
        }

        await role.edit({
          name: name || role.name,
          color: colorInput ? color : role.color,
          reason: `Personal role update by ${interaction.user.tag}`
        });
        if (price !== null) profile.rolePrice = price;
        if (forSale !== null) profile.roleForSale = forSale;
        await context.store.save();

        return reply(
          interaction,
          successPanel(`Роль ${role} обновлена. Цена: **${formatCoins(profile.rolePrice)}**. Продажа: **${profile.roleForSale ? 'да' : 'нет'}**.`, 'Личная роль изменена'),
          { ephemeral: true }
        );
      }

      const target = interaction.options.getUser('user') || interaction.user;
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
  }
];

module.exports = {
  commands
};
