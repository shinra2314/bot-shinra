const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { componentPayload } = require('../ui/components');
const { roomPanel } = require('../ui/roomPanel');

function createTempRooms(context) {
  const { config, store } = context;

  function roomForOwner(guildId, ownerId) {
    const rooms = store.guild(guildId).tempRooms;
    return Object.entries(rooms).find(([, room]) => room.ownerId === ownerId);
  }

  // Создаёт голосовой канал-комнату для владельца, регистрирует в store и постит
  // панель управления в чат канала. persistent:true — комната не сносится при
  // опустении (покупная комната из магазина). Возвращает { channel, room }.
  async function createRoom(guild, member, { persistent = false, parentId = null } = {}) {
    const channel = await guild.channels.create({
      name: `Комната ${member.displayName}`.slice(0, 90),
      type: ChannelType.GuildVoice,
      parent: config.tempRoomCategoryId || parentId || null,
      permissionOverwrites: [
        {
          id: member.id,
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers]
        }
      ],
      reason: persistent ? 'Purchased personal room' : 'Temporary voice room'
    });

    const room = {
      channelId: channel.id,
      ownerId: member.id,
      createdAt: Date.now(),
      locked: false,
      hidden: false,
      pinnedUntil: 0,
      persistent,
      whitelist: [],
      bitrate: channel.bitrate,
      region: channel.rtcRegion || null
    };
    store.guild(guild.id).tempRooms[channel.id] = room;
    await store.save();

    await channel
      .send(componentPayload(roomPanel({ channelId: channel.id, channel, room }), {
        allowedMentions: { users: [member.id] }
      }))
      .catch(() => null);

    return { channel, room };
  }

  async function handleVoiceStateUpdate(oldState, newState) {
    if (!config.tempRoomTriggerChannelId) return;
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    if (newState.channelId === config.tempRoomTriggerChannelId && oldState.channelId !== newState.channelId) {
      const { channel } = await createRoom(newState.guild, member, {
        persistent: false,
        parentId: newState.channel?.parentId || null
      });
      await member.voice.setChannel(channel).catch(() => null);
      return;
    }

    if (oldState.channelId) {
      const rooms = store.guild(oldState.guild.id).tempRooms;
      const room = rooms[oldState.channelId];
      if (!room) return;
      const channel = oldState.guild.channels.cache.get(oldState.channelId);
      if (channel && channel.members.size === 0 && !room.persistent && Number(room.pinnedUntil || 0) < Date.now()) {
        delete rooms[oldState.channelId];
        await store.save();
        await channel.delete('Temporary voice room empty').catch(() => null);
      }
    }
  }

  return {
    handleVoiceStateUpdate,
    roomForOwner,
    createRoom
  };
}

module.exports = createTempRooms;
