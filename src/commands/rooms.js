const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const { ButtonStyle, COLORS, ICONS, button, errorPanel, panel, reply, select, successPanel, update, userSelect } = require('../ui/components');
const { roomPanel, BITRATE_PRESETS, REGION_OPTIONS } = require('../ui/roomPanel');
const { grantOwnerPerms, revokeOwnerPerms } = require('../utils/roomPerms');
const { formatCoins, mentionUser } = require('../utils/format');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function findRoom(context, interaction, ownerId = interaction.user.id) {
  const found = context.tempRooms.roomForOwner(interaction.guildId, ownerId);
  if (!found) return null;
  const [channelId, room] = found;
  return { channelId, room, channel: interaction.guild.channels.cache.get(channelId) };
}

async function requireOwner(interaction, context, channelId) {
  const room = context.store.guild(interaction.guildId).tempRooms[channelId];
  if (!room) return { error: 'Комната не найдена.' };
  if (room.ownerId !== interaction.user.id && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    return { error: 'Управлять этой комнатой может только владелец.' };
  }
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) return { error: 'Голосовой канал не найден.' };
  return { room, channel };
}

// Передача владельца: синхронизируем права канала, иначе старый владелец
// остаётся с ManageChannels, а новый ничего не получает.
async function transferOwner(channel, room, oldOwnerId, newOwnerId, store, guildId) {
  await grantOwnerPerms(channel, newOwnerId);
  if (oldOwnerId && oldOwnerId !== newOwnerId) await revokeOwnerPerms(channel, oldOwnerId);
  room.ownerId = newOwnerId;
  await store.save();
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('room')
      .setDescription('Личные голосовые комнаты')
      .addSubcommand((subcommand) => subcommand.setName('панель').setDescription('Панель управления комнатой'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('лимит')
          .setDescription('Установить лимит участников')
          .addIntegerOption((option) => option.setName('число').setDescription('0 = без лимита').setMinValue(0).setMaxValue(99).setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('название')
          .setDescription('Переименовать комнату')
          .addStringOption((option) => option.setName('текст').setDescription('Новое название').setMinLength(2).setMaxLength(90).setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('кикнуть')
          .setDescription('Кикнуть пользователя из комнаты')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь').setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('передать')
          .setDescription('Передать владельца комнаты')
          .addUserOption((option) => option.setName('user').setDescription('Новый владелец').setRequired(true))
      )
      .addSubcommand((subcommand) => subcommand.setName('закрепить').setDescription('Закрепить комнату на 24 часа за 1000 монет')),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const roomData = findRoom(context, interaction);
      if (!roomData) return reply(interaction, errorPanel('У тебя нет активной личной комнаты.'), { ephemeral: true });
      if (!roomData.channel) return reply(interaction, errorPanel('Канал комнаты не найден.'), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'панель') return reply(interaction, roomPanel(roomData), { ephemeral: true });

      if (subcommand === 'лимит') {
        const limit = interaction.options.getInteger('число', true);
        await roomData.channel.setUserLimit(limit, 'Room owner changed limit');
        return reply(interaction, successPanel(`Лимит комнаты установлен: **${limit || 'без лимита'}**.`), { ephemeral: true });
      }

      if (subcommand === 'название') {
        const name = interaction.options.getString('текст', true);
        await roomData.channel.setName(name, 'Room owner renamed room');
        return reply(interaction, successPanel(`Комната переименована в **${name}**.`), { ephemeral: true });
      }

      if (subcommand === 'кикнуть') {
        const target = interaction.options.getMember('user');
        if (!target?.voice?.channelId || target.voice.channelId !== roomData.channelId) {
          return reply(interaction, errorPanel('Пользователь не находится в твоей комнате.'), { ephemeral: true });
        }
        await target.voice.disconnect('Room owner kick').catch(() => null);
        return reply(interaction, successPanel(`${mentionUser(target.id)} кикнут из комнаты.`), { ephemeral: true });
      }

      if (subcommand === 'передать') {
        const target = interaction.options.getUser('user', true);
        await transferOwner(roomData.channel, roomData.room, interaction.user.id, target.id, context.store, interaction.guildId);
        return reply(interaction, successPanel(`Владелец комнаты теперь ${mentionUser(target.id)}.`), { ephemeral: true });
      }

      const profile = context.store.ensureUser(interaction.guildId, interaction.user);
      if (profile.balance < 1000) return reply(interaction, errorPanel('Нужно 1000 монет для закрепления комнаты.'), { ephemeral: true });
      profile.balance -= 1000;
      roomData.room.pinnedUntil = Date.now() + 24 * 60 * 60 * 1000;
      context.store.recordTransaction(interaction.guildId, {
        type: 'room',
        fromId: interaction.user.id,
        amount: 1000,
        note: 'закрепление комнаты'
      });
      await context.store.save();
      return reply(interaction, successPanel(`Комната закреплена на 24 часа. Списано **${formatCoins(1000)}**.`), { ephemeral: true });
    }
  }
];

// Эфемерная подсказка с user-select для выбора участника.
function userPickPanel(channelId, action, title, placeholder) {
  return panel({
    title,
    icon: ICONS.voice,
    eyebrow: 'Комнаты Onix',
    description: 'Выбери пользователя в меню ниже.',
    color: COLORS.info,
    actions: [userSelect(`room:${action}:${channelId}`, placeholder, 1, action === 'whitelist-pick' ? 10 : 1)]
  });
}

function renameModal(channelId) {
  return new ModalBuilder()
    .setCustomId(`room:rename-submit:${channelId}`)
    .setTitle('Название комнаты')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Новое название')
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(90)
          .setRequired(true)
      )
    );
}

function limitModal(channelId) {
  return new ModalBuilder()
    .setCustomId(`room:limit-submit:${channelId}`)
    .setTitle('Лимит участников')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('limit')
          .setLabel('Число (0 = без лимита, до 99)')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(2)
          .setRequired(true)
      )
    );
}

async function handleComponent(interaction, context) {
  const isModal = interaction.isModalSubmit?.();
  const isUserSel = interaction.isUserSelectMenu?.();
  const isStringSel = interaction.isStringSelectMenu?.();
  if (!interaction.isButton() && !isModal && !isUserSel && !isStringSel) return false;
  if (!interaction.customId.startsWith('room:')) return false;

  const [, action, channelId] = interaction.customId.split(':');

  // Кнопка статичной панели-хаба: открыть личную панель кликнувшего (без channelId).
  if (action === 'mypanel') {
    const roomData = findRoom(context, interaction);
    if (!roomData) {
      await reply(
        interaction,
        errorPanel('У тебя нет личной комнаты. Купи её в магазине: `/shop` → раздел «Системные товары».'),
        { ephemeral: true }
      );
      return true;
    }
    if (!roomData.channel) {
      await reply(interaction, errorPanel('Канал твоей комнаты не найден.'), { ephemeral: true });
      return true;
    }
    await reply(interaction, roomPanel(roomData), { ephemeral: true });
    return true;
  }

  const result = await requireOwner(interaction, context, channelId);
  if (result.error) {
    await reply(interaction, errorPanel(result.error), { ephemeral: true });
    return true;
  }
  const { channel, room } = result;
  const guildId = interaction.guildId;

  // --- Открыватели (кнопки, ведущие к модалке / эфемерному селекту) ---
  if (action === 'rename') {
    await interaction.showModal(renameModal(channelId));
    return true;
  }
  if (action === 'limit') {
    await interaction.showModal(limitModal(channelId));
    return true;
  }
  if (action === 'bitrate') {
    await reply(interaction, panel({
      title: 'Битрейт комнаты',
      icon: ICONS.voice,
      eyebrow: 'Комнаты Onix',
      description: 'Выбери битрейт. Высокие значения требуют буста сервера.',
      color: COLORS.info,
      actions: [select(`room:bitrate-pick:${channelId}`, 'Битрейт', BITRATE_PRESETS.map((kbps) => ({ label: `${kbps} kbps`, value: String(kbps) })))]
    }), { ephemeral: true });
    return true;
  }
  if (action === 'region') {
    await reply(interaction, panel({
      title: 'Регион комнаты',
      icon: ICONS.voice,
      eyebrow: 'Комнаты Onix',
      description: 'Выбери голосовой регион.',
      color: COLORS.info,
      actions: [select(`room:region-pick:${channelId}`, 'Регион', REGION_OPTIONS)]
    }), { ephemeral: true });
    return true;
  }
  if (action === 'transfer') {
    await reply(interaction, userPickPanel(channelId, 'transfer-pick', 'Передать комнату', 'Новый владелец'), { ephemeral: true });
    return true;
  }
  if (action === 'kick') {
    await reply(interaction, userPickPanel(channelId, 'kick-pick', 'Кикнуть из комнаты', 'Кого кикнуть'), { ephemeral: true });
    return true;
  }
  if (action === 'whitelist') {
    await reply(interaction, panel({
      title: 'Вайтлист комнаты',
      icon: ICONS.voice,
      eyebrow: 'Комнаты Onix',
      description: room.whitelist?.length
        ? `В вайтлисте: ${room.whitelist.map((id) => mentionUser(id)).join(', ')}`
        : 'Вайтлист пуст. Выбери, кого впустить в закрытую комнату.',
      color: COLORS.info,
      actions: [
        userSelect(`room:whitelist-pick:${channelId}`, 'Кого впустить', 1, 10),
        button(`room:whitelist-clear:${channelId}`, 'Очистить вайтлист', ButtonStyle.Danger)
      ]
    }), { ephemeral: true });
    return true;
  }

  // --- Сабмиты модалок ---
  if (action === 'rename-submit') {
    const name = interaction.fields.getTextInputValue('name').trim().slice(0, 90);
    await channel.setName(name, 'Room owner renamed room').catch(() => null);
    await reply(interaction, successPanel(`Комната переименована в **${name}**.`), { ephemeral: true });
    return true;
  }
  if (action === 'limit-submit') {
    const raw = Number.parseInt(interaction.fields.getTextInputValue('limit').trim(), 10);
    if (!Number.isInteger(raw) || raw < 0 || raw > 99) {
      await reply(interaction, errorPanel('Лимит должен быть числом от 0 до 99.'), { ephemeral: true });
      return true;
    }
    await channel.setUserLimit(raw, 'Room owner changed limit').catch(() => null);
    await reply(interaction, successPanel(`Лимит комнаты: **${raw || 'без лимита'}**.`), { ephemeral: true });
    return true;
  }

  // --- Сабмиты селектов ---
  if (action === 'bitrate-pick') {
    const kbps = Number(interaction.values[0]);
    try {
      await channel.setBitrate(kbps * 1000, 'Room owner changed bitrate');
      room.bitrate = kbps * 1000;
      await context.store.save();
      await update(interaction, successPanel(`Битрейт комнаты: **${kbps} kbps**.`, 'Битрейт'));
    } catch {
      await update(interaction, errorPanel('Не удалось задать битрейт — возможно, нужен буст сервера.'));
    }
    return true;
  }
  if (action === 'region-pick') {
    const value = interaction.values[0];
    try {
      await channel.setRTCRegion(value === 'auto' ? null : value, 'Room owner changed region');
      room.region = value === 'auto' ? null : value;
      await context.store.save();
      await update(interaction, successPanel(`Регион комнаты: **${value === 'auto' ? 'авто' : value}**.`, 'Регион'));
    } catch {
      await update(interaction, errorPanel('Не удалось сменить регион.'));
    }
    return true;
  }
  if (action === 'transfer-pick') {
    const newOwnerId = interaction.values[0];
    await transferOwner(channel, room, room.ownerId, newOwnerId, context.store, guildId);
    await update(interaction, successPanel(`Владелец комнаты теперь ${mentionUser(newOwnerId)}.`, 'Передача комнаты'));
    return true;
  }
  if (action === 'kick-pick') {
    const targetId = interaction.values[0];
    const target = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!target?.voice?.channelId || target.voice.channelId !== channelId) {
      await update(interaction, errorPanel('Пользователь не находится в твоей комнате.'));
      return true;
    }
    await target.voice.disconnect('Room owner kick').catch(() => null);
    await update(interaction, successPanel(`${mentionUser(targetId)} кикнут из комнаты.`, 'Кик'));
    return true;
  }
  if (action === 'whitelist-pick') {
    room.whitelist ||= [];
    for (const userId of interaction.values) {
      await channel.permissionOverwrites.edit(userId, { Connect: true, ViewChannel: true }).catch(() => null);
      if (!room.whitelist.includes(userId)) room.whitelist.push(userId);
    }
    await context.store.save();
    await update(interaction, successPanel(`Впущено в комнату: ${interaction.values.map((id) => mentionUser(id)).join(', ')}.`, 'Вайтлист'));
    return true;
  }
  if (action === 'whitelist-clear') {
    for (const userId of room.whitelist || []) {
      await channel.permissionOverwrites.delete(userId).catch(() => null);
    }
    room.whitelist = [];
    await context.store.save();
    await update(interaction, successPanel('Вайтлист очищен.', 'Вайтлист'));
    return true;
  }

  // --- Прямые кнопки на панели ---
  if (action === 'lock') {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
    room.locked = true;
  }
  if (action === 'open') {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: null });
    room.locked = false;
  }
  if (action === 'hide') {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
    room.hidden = true;
  }
  if (action === 'show') {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: null });
    room.hidden = false;
  }
  if (action === 'delete') {
    delete context.store.guild(guildId).tempRooms[channelId];
    await context.store.save();
    await channel.delete('Room owner deleted room').catch(() => null);
    await update(interaction, successPanel('Комната удалена.', 'Личная комната'));
    return true;
  }

  await context.store.save();
  await update(interaction, roomPanel({ channelId, channel, room }));
  return true;
}

module.exports = {
  commands,
  handleComponent
};
