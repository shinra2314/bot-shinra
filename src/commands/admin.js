const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { COLORS, errorPanel, panel, reply, successPanel } = require('../ui/components');

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('admin')
      .setDescription('Диагностика и обслуживание бота')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((subcommand) => subcommand.setName('диагностика').setDescription('Показать состояние бота'))
      .addSubcommand((subcommand) => subcommand.setName('backup').setDescription('Сделать backup базы JSON')),
    async execute(interaction, context) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return reply(interaction, errorPanel('Нужны права Manage Server.'), { ephemeral: true });
      }

      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'backup') {
        const target = await context.store.backup();
        return reply(interaction, successPanel(`Backup создан:\n\`${target}\``, 'Backup'), { ephemeral: true });
      }

      const guild = context.store.guild(interaction.guildId);
      return reply(interaction, panel({
        title: 'Диагностика Onix',
        description: 'Краткое состояние runtime и базы.',
        color: COLORS.info,
        fields: [
          { name: 'Пользователей в базе', value: String(Object.keys(guild.users).length) },
          { name: 'Кланов', value: String(Object.keys(guild.clans).length) },
          { name: 'Активных войн', value: String(guild.clanWars.filter((war) => war.status === 'active').length) },
          { name: 'Лотов маркета', value: String(guild.marketListings.filter((item) => item.status === 'active').length) },
          { name: 'Ивентов', value: String(guild.events.length) },
          { name: 'Репортов', value: String(guild.reports.length) }
        ]
      }), { ephemeral: true });
    }
  }
];

module.exports = {
  commands
};
