const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  ICONS,
  componentPayload,
  errorPanel,
  panel,
  reply,
  successPanel
} = require('../ui/components');
const { selfRolePanel } = require('../ui/selfRolePanel');
const { buildHubBanner } = require('../services/profileCard');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function canAdmin(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

// Баннер-карта панели (сетка фич). Best-effort: нет canvas → null.
function selfRoleBanner() {
  return buildHubBanner({
    title: 'Самостоятельные роли',
    subtitle: 'Выбирай свои роли сам',
    accent: '#8b5cf6',
    items: [
      { icon: 'trophy', name: 'Игровые роли', price: 'выбор' },
      { icon: 'voice', name: 'Уведомления', price: 'опт.' },
      { icon: 'clan', name: 'Сообщество', price: 'тег' },
      { icon: 'messages', name: 'Интересы', price: 'набор' },
      { icon: 'level', name: 'Без модера', price: 'сам' },
      { icon: 'heart', name: 'Один клик', price: 'toggle' }
    ]
  }).catch(() => null);
}

async function postPanel(channel, store, guildId) {
  const banner = await selfRoleBanner();
  const payload = componentPayload(
    selfRolePanel(store.getSelfRoles(guildId), banner?.imageUrl),
    { files: banner?.files }
  );
  const sent = await channel.send(payload).catch(() => null);
  if (sent) {
    store.setSelfRolePanel(guildId, channel.id, sent.id);
    await store.save();
  }
  return sent;
}

// Перерисовать уже опубликованную панель после правки конфига (best-effort).
async function refreshPanel(client, store, guildId) {
  const ref = store.getSelfRolePanel(guildId);
  if (!ref) return;
  const channel = await client.channels.fetch(ref.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  const message = await channel.messages.fetch(ref.messageId).catch(() => null);
  if (!message) return;
  const banner = await selfRoleBanner();
  await message
    .edit(componentPayload(selfRolePanel(store.getSelfRoles(guildId), banner?.imageUrl), { files: banner?.files }))
    .catch(() => null);
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('selfroles')
      .setDescription('Самостоятельные роли (только админ)')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('панель')
          .setDescription('Опубликовать панель выбора ролей в этот канал')
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('добавить')
          .setDescription('Добавить роль в панель')
          .addRoleOption((option) => option.setName('роль').setDescription('Роль для выдачи').setRequired(true))
          .addStringOption((option) => option.setName('ярлык').setDescription('Подпись кнопки').setMaxLength(80))
          .addStringOption((option) => option.setName('описание').setDescription('Короткое описание').setMaxLength(80))
          .addStringOption((option) => option.setName('эмодзи').setDescription('Эмодзи (unicode)').setMaxLength(8))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('убрать')
          .setDescription('Убрать роль из панели')
          .addRoleOption((option) => option.setName('роль').setDescription('Роль').setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('список').setDescription('Показать настроенные роли')
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });
      if (!canAdmin(interaction)) {
        return reply(interaction, errorPanel('Нужны права управления сервером.'), { ephemeral: true });
      }

      const { store, client } = context;
      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'панель') {
        const sent = await postPanel(interaction.channel, store, guildId);
        if (!sent) return reply(interaction, errorPanel('Не удалось отправить панель в этот канал.'), { ephemeral: true });
        return reply(interaction, successPanel('Панель ролей опубликована.', 'Self-роли'), { ephemeral: true });
      }

      if (subcommand === 'добавить') {
        const role = interaction.options.getRole('роль', true);
        if (role.id === guildId || role.managed) {
          return reply(interaction, errorPanel('Эту роль нельзя выдавать самостоятельно (@everyone или управляемая ботом/бустом).'), { ephemeral: true });
        }
        const me = interaction.guild.members.me;
        if (me && role.position >= me.roles.highest.position) {
          return reply(interaction, errorPanel('Эта роль выше роли бота в иерархии. Перемести роль бота выше неё.'), { ephemeral: true });
        }

        const label = (interaction.options.getString('ярлык') || role.name).slice(0, 80);
        const description = interaction.options.getString('описание')?.slice(0, 80) || undefined;
        const emoji = interaction.options.getString('эмодзи') || undefined;
        store.addSelfRole(guildId, { roleId: role.id, label, description, emoji });
        await store.save();
        await refreshPanel(client, store, guildId);
        return reply(interaction, successPanel(`Роль <@&${role.id}> добавлена в панель.`, 'Self-роли'), { ephemeral: true });
      }

      if (subcommand === 'убрать') {
        const role = interaction.options.getRole('роль', true);
        store.removeSelfRole(guildId, role.id);
        await store.save();
        await refreshPanel(client, store, guildId);
        return reply(interaction, successPanel(`Роль <@&${role.id}> убрана из панели.`, 'Self-роли'), { ephemeral: true });
      }

      // список
      const roles = store.getSelfRoles(guildId);
      return reply(
        interaction,
        panel({
          title: 'Настроенные роли',
          icon: ICONS.star,
          eyebrow: 'Самостоятельные роли',
          color: COLORS.primary,
          description: roles.length ? 'Роли в панели выбора:' : 'Пока ничего не настроено. Добавь через `/selfroles добавить`.',
          lines: roles.map((role) => `${role.emoji ? `${role.emoji} ` : ''}<@&${role.roleId}> — \`${role.label}\``)
        }),
        { ephemeral: true }
      );
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton() || !interaction.customId.startsWith('selfrole:')) return false;

  const guildError = requireGuild(interaction);
  if (guildError) {
    await reply(interaction, errorPanel(guildError), { ephemeral: true });
    return true;
  }

  const [, action, roleId] = interaction.customId.split(':');
  if (action !== 'toggle' || !roleId) return false;

  // Безопасность: переключаем только роли, реально настроенные в панели.
  const configured = context.store.getSelfRoles(interaction.guildId).some((role) => role.roleId === roleId);
  if (!configured) {
    await reply(interaction, errorPanel('Эта роль больше недоступна для выбора.'), { ephemeral: true });
    return true;
  }

  const member = interaction.member;
  const has = member?.roles?.cache?.has(roleId);
  try {
    if (has) {
      await member.roles.remove(roleId);
      await reply(interaction, successPanel(`Роль <@&${roleId}> снята.`, 'Роли'), { ephemeral: true });
    } else {
      await member.roles.add(roleId);
      await reply(interaction, successPanel(`Роль <@&${roleId}> выдана.`, 'Роли'), { ephemeral: true });
    }
  } catch (error) {
    await reply(interaction, errorPanel('Не удалось изменить роль. Проверь, что роль бота выше выдаваемой и у него есть право «Управление ролями».'), { ephemeral: true });
  }
  return true;
}

module.exports = {
  commands,
  handleComponent
};
