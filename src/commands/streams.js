const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { COLORS, errorPanel, panel, reply, successPanel } = require('../ui/components');
const { isEnabled } = require('../services/notifications');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function canAdmin(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

function normalizeLogin(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//, '')
    .replace(/\/.*$/, '');
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('стримеры')
      .setDescription('Уведомления о стримах Twitch (только админ)')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('канал')
          .setDescription('Куда слать анонсы стримов и какую роль пинговать')
          .addChannelOption((option) => option.setName('канал').setDescription('Текстовый канал').addChannelTypes(ChannelType.GuildText).setRequired(true))
          .addRoleOption((option) => option.setName('роль').setDescription('Роль для пинга (необязательно)'))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('добавить')
          .setDescription('Добавить Twitch-стримера')
          .addStringOption((option) => option.setName('ник').setDescription('Twitch-логин или ссылка').setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('убрать')
          .setDescription('Убрать Twitch-стримера')
          .addStringOption((option) => option.setName('ник').setDescription('Twitch-логин').setRequired(true))
      )
      .addSubcommand((subcommand) => subcommand.setName('список').setDescription('Показать настройку уведомлений')),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });
      if (!canAdmin(interaction)) return reply(interaction, errorPanel('Нужны права управления сервером.'), { ephemeral: true });

      const { store, config } = context;
      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();

      if (!isEnabled(config) && subcommand !== 'список') {
        return reply(interaction, errorPanel('Twitch-интеграция не настроена. Задай TWITCH_CLIENT_ID и TWITCH_CLIENT_SECRET в .env.'), { ephemeral: true });
      }

      if (subcommand === 'канал') {
        const channel = interaction.options.getChannel('канал', true);
        const role = interaction.options.getRole('роль');
        store.setStreamChannel(guildId, channel.id, role?.id || null);
        await store.save();
        return reply(interaction, successPanel(`Анонсы стримов будут в <#${channel.id}>${role ? ` с пингом <@&${role.id}>` : ''}.`, 'Стримы'), { ephemeral: true });
      }

      if (subcommand === 'добавить') {
        const login = normalizeLogin(interaction.options.getString('ник', true));
        if (!login) return reply(interaction, errorPanel('Неверный Twitch-логин.'), { ephemeral: true });
        store.addStreamer(guildId, login);
        await store.save();
        return reply(interaction, successPanel(`Стример **${login}** добавлен. Анонс придёт, когда он выйдет в эфир.`, 'Стримы'), { ephemeral: true });
      }

      if (subcommand === 'убрать') {
        const login = normalizeLogin(interaction.options.getString('ник', true));
        store.removeStreamer(guildId, login);
        await store.save();
        return reply(interaction, successPanel(`Стример **${login}** убран.`, 'Стримы'), { ephemeral: true });
      }

      // список
      const cfg = store.getStreamConfig(guildId);
      const lines = [
        `📺 Канал: ${cfg.channelId ? `<#${cfg.channelId}>` : 'не задан'}`,
        `🔔 Пинг роли: ${cfg.roleId ? `<@&${cfg.roleId}>` : 'нет'}`,
        `🎥 Стримеры: ${cfg.streamers.length ? cfg.streamers.map((login) => `\`${login}\``).join(', ') : 'нет'}`
      ];
      if (!isEnabled(config)) lines.push('⚠️ Интеграция выключена (нет TWITCH_CLIENT_ID/SECRET).');
      return reply(
        interaction,
        panel({ title: 'Уведомления о стримах', icon: '🎥', eyebrow: 'Стримы Onix', color: COLORS.primary, lines }),
        { ephemeral: true }
      );
    }
  }
];

module.exports = { commands };
