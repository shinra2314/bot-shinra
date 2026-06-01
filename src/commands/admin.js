const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { COLORS, ICONS, componentPayload, errorPanel, panel, reply, successPanel } = require('../ui/components');
const { formatCoins, mentionUser } = require('../utils/format');

async function sendAdminLog(interaction, context, components) {
  const channelId = context.config.adminChannelId || context.config.reportChannelId;
  if (!channelId) return false;
  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return false;
  await channel.send(componentPayload(components));
  return true;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('admin')
      .setDescription('Диагностика и обслуживание бота')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((subcommand) => subcommand.setName('диагностика').setDescription('Показать состояние бота'))
      .addSubcommand((subcommand) => subcommand.setName('backup').setDescription('Сделать backup базы JSON'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('выдать')
          .setDescription('Выдать валюту пользователю')
          .addUserOption((option) => option.setName('user').setDescription('Пользователь').setRequired(true))
          .addStringOption((option) =>
            option
              .setName('валюта')
              .setDescription('Что выдать')
              .addChoices(
                { name: 'Монеты', value: 'balance' },
                { name: 'Лотусы', value: 'lotuses' },
                { name: 'Снежки', value: 'snowballs' }
              )
              .setRequired(true)
          )
          .addIntegerOption((option) =>
            option.setName('сумма').setDescription('Количество').setMinValue(1).setMaxValue(100000000).setRequired(true)
          )
          .addStringOption((option) =>
            option.setName('причина').setDescription('Причина выдачи').setMaxLength(300)
          )
      ),
    async execute(interaction, context) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return reply(interaction, errorPanel('Нужны права Manage Server.'), { ephemeral: true });
      }

      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'backup') {
        const target = await context.store.backup();
        return reply(interaction, successPanel(`Backup создан:\n\`${target}\``, 'Backup'), { ephemeral: true });
      }

      if (subcommand === 'выдать') {
        const target = interaction.options.getUser('user', true);
        const currency = interaction.options.getString('валюта', true);
        const amount = interaction.options.getInteger('сумма', true);
        const reason = interaction.options.getString('причина') || 'админская выдача';
        const profile = context.store.ensureUser(interaction.guildId, target);
        profile[currency] = Number(profile[currency] || 0) + amount;

        context.store.recordTransaction(interaction.guildId, {
          type: 'admin_grant',
          toId: target.id,
          amount,
          note: `${reason} (${currency})`
        });
        await context.store.save();

        const labels = {
          balance: 'монет',
          lotuses: 'лотусов',
          snowballs: 'снежков'
        };
        const logView = panel({
          title: 'Админская выдача валюты',
          icon: ICONS.economy,
          eyebrow: 'Админка Onix',
          description: `${mentionUser(interaction.user.id)} выдал ${mentionUser(target.id)} **${amount} ${labels[currency]}**.`,
          color: COLORS.economy,
          fields: [
            { name: '📝 Причина', value: reason },
            { name: `${ICONS.coins} Новый баланс`, value: currency === 'balance' ? formatCoins(profile.balance) : String(profile[currency]) }
          ]
        });
        await sendAdminLog(interaction, context, logView);

        return reply(interaction, successPanel(`${mentionUser(target.id)} получил **${amount} ${labels[currency]}**.`, 'Валюта выдана'), { ephemeral: true });
      }

      const guild = context.store.guild(interaction.guildId);
      return reply(interaction, panel({
        title: 'Диагностика Onix',
        icon: '🛠️',
        eyebrow: 'Админка Onix',
        description: 'Краткое состояние runtime и базы.',
        color: COLORS.info,
        stats: [
          { icon: ICONS.profile, name: 'Пользователей в базе', value: String(Object.keys(guild.users).length) },
          { icon: ICONS.clan, name: 'Кланов', value: String(Object.keys(guild.clans).length) },
          { icon: '⚔️', name: 'Активных войн', value: String(guild.clanWars.filter((war) => war.status === 'active').length) },
          { icon: ICONS.shop, name: 'Лотов маркета', value: String(guild.marketListings.filter((item) => item.status === 'active').length) },
          { icon: ICONS.games, name: 'Ивентов', value: String(guild.events.length) },
          { icon: ICONS.moderation, name: 'Репортов', value: String(guild.reports.length) }
        ],
        statColumns: 2
      }), { ephemeral: true });
    }
  }
];

module.exports = {
  commands
};
