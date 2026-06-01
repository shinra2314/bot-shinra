const { ChannelType, PermissionFlagsBits } = require('discord.js');

function createTempRooms(context) {
  const { config, store } = context;

  function roomForOwner(guildId, ownerId) {
    const rooms = store.guild(guildId).tempRooms;
    return Object.entries(rooms).find(([, room]) => room.ownerId === ownerId);
  }

  async function handleVoiceStateUpdate(oldState, newState) {
    if (!config.tempRoomTriggerChannelId) return;
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    if (newState.channelId === config.tempRoomTriggerChannelId && oldState.channelId !== newState.channelId) {
      const guild = newState.guild;
      const channel = await guild.channels.create({
        name: `Комната ${member.displayName}`.slice(0, 90),
        type: ChannelType.GuildVoice,
        parent: config.tempRoomCategoryId || newState.channel?.parentId || null,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers]
          }
        ],
        reason: 'Temporary voice room'
      });

      store.guild(guild.id).tempRooms[channel.id] = {
        channelId: channel.id,
        ownerId: member.id,
        createdAt: Date.now(),
        locked: false,
        hidden: false,
        pinnedUntil: 0
      };
      await store.save();
      await member.voice.setChannel(channel).catch(() => null);
      return;
    }

    if (oldState.channelId) {
      const rooms = store.guild(oldState.guild.id).tempRooms;
      const room = rooms[oldState.channelId];
      if (!room) return;
      const channel = oldState.guild.channels.cache.get(oldState.channelId);
      if (channel && channel.members.size === 0 && Number(room.pinnedUntil || 0) < Date.now()) {
        delete rooms[oldState.channelId];
        await store.save();
        await channel.delete('Temporary voice room empty').catch(() => null);
      }
    }
  }

  return {
    handleVoiceStateUpdate,
    roomForOwner
  };
}

module.exports = createTempRooms;
