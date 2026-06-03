const { PermissionFlagsBits } = require('discord.js');

// Права владельца личной комнаты: заходить, управлять каналом, двигать участников.
const OWNER_PERMS = [
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers
];

async function grantOwnerPerms(channel, userId) {
  await channel.permissionOverwrites
    .edit(userId, { Connect: true, ManageChannels: true, MoveMembers: true })
    .catch(() => null);
}

async function revokeOwnerPerms(channel, userId) {
  await channel.permissionOverwrites.delete(userId).catch(() => null);
}

module.exports = { OWNER_PERMS, grantOwnerPerms, revokeOwnerPerms };
