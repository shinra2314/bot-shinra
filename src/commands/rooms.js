const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { COLORS, ButtonStyle, button, errorPanel, panel, reply, successPanel, update } = require('../ui/components');
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

function roomPanel(roomData) {
  return panel({
    title: 'Панель личной комнаты',
    description: `Комната: ${roomData.channel ? `<#${roomData.channel.id}>` : 'не найдена'}\nВладелец: ${mentionUser(roomData.room.ownerId)}`,
    color: COLORS.info,
    fields: [
      { name: 'Закрыта', value: roomData.room.locked ? 'да' : 'нет' },
      { name: 'Скрыта', value: roomData.room.hidden ? 'да' : 'нет' },
      { name: 'Лимит', value: String(roomData.channel?.userLimit || 'без лимита') }
    ],
    actions: [
      button(`room:lock:${roomData.channelId}`, 'Закрыть', ButtonStyle.Secondary, roomData.room.locked),
      button(`room:open:${roomData.channelId}`, 'Открыть', ButtonStyle.Success, !roomData.room.locked),
      button(`room:hide:${roomData.channelId}`, 'Скрыть', ButtonStyle.Secondary, roomData.room.hidden),
      button(`room:show:${roomData.channelId}`, 'Показать', ButtonStyle.Primary, !roomData.room.hidden),
      button(`room:delete:${roomData.channelId}`, 'Удалить', ButtonStyle.Danger)
    ]
  });
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
        roomData.room.ownerId = target.id;
        await context.store.save();
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

async function handleComponent(interaction, context) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('room:')) return false;

  const [, action, channelId] = interaction.customId.split(':');
  const result = await requireOwner(interaction, context, channelId);
  if (result.error) {
    await reply(interaction, errorPanel(result.error), { ephemeral: true });
    return true;
  }

  const { channel, room } = result;
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
    delete context.store.guild(interaction.guildId).tempRooms[channelId];
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
