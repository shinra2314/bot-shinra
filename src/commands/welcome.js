const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { COLORS, errorPanel, panel, reply, successPanel } = require('../ui/components');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function requireAdmin(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return 'Эта команда доступна только администраторам.';
  }
  return null;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('welcome')
      .setDescription('Настройка приветствий и прощаний')
      .addSubcommand((sub) =>
        sub.setName('статус').setDescription('Текущие настройки')
      )
      .addSubcommand((sub) =>
        sub.setName('включить').setDescription('Включить систему приветствий')
      )
      .addSubcommand((sub) =>
        sub.setName('выключить').setDescription('Выключить систему приветствий')
      )
      .addSubcommand((sub) =>
        sub.setName('приветствие').setDescription('Установить канал приветствий')
          .addChannelOption((opt) => opt.setName('канал').setDescription('Канал для приветствий').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName('прощание').setDescription('Установить канал прощаний')
          .addChannelOption((opt) => opt.setName('канал').setDescription('Канал для прощаний').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName('текст').setDescription('Установить текст приветствия')
          .addStringOption((opt) =>
            opt.setName('сообщение').setDescription('Текст ({user}, {username}, {server}, {count})')
              .setMaxLength(500).setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub.setName('текст-прощания').setDescription('Установить текст прощания')
          .addStringOption((opt) =>
            opt.setName('сообщение').setDescription('Текст ({username}, {server}, {count})')
              .setMaxLength(500).setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub.setName('авторо').setDescription('Добавить роль для автовыдачи новичкам')
          .addRoleOption((opt) => opt.setName('роль').setDescription('Роль').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName('убрать-авторо').setDescription('Убрать роль из автовыдачи')
          .addRoleOption((opt) => opt.setName('роль').setDescription('Роль').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName('гайд').setDescription('Установить гайд-сообщение для новичков в ЛС')
          .addStringOption((opt) =>
            opt.setName('текст').setDescription('Текст гайда ({user}, {server})')
              .setMaxLength(1000).setRequired(true)
          )
          .addChannelOption((opt) => opt.setName('канал').setDescription('Канал-гайд (ссылка в сообщении)'))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });
      const adminError = requireAdmin(interaction);
      if (adminError) return reply(interaction, errorPanel(adminError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
      const cfg = context.welcome.settings(interaction.guildId);

      if (subcommand === 'статус') {
        const toggle = (v) => v ? '✅ Вкл' : '❌ Выкл';
        return reply(interaction, panel({
          title: '👋 Система приветствий',
          description: `Статус: **${toggle(cfg.enabled)}**`,
          color: COLORS.info,
          fields: [
            { name: '📥 Канал приветствий', value: cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : 'не задан' },
            { name: '📤 Канал прощаний', value: cfg.farewellChannelId ? `<#${cfg.farewellChannelId}>` : 'не задан' },
            { name: '🎭 Авто-роли', value: cfg.autoRoles.length ? cfg.autoRoles.map((id) => `<@&${id}>`).join(', ') : 'нет' },
            { name: '📖 Гайд', value: cfg.guideMessage ? 'настроен' : 'не настроен' },
            { name: '📝 Текст приветствия', value: cfg.welcomeMessage.slice(0, 200) },
            { name: '📝 Текст прощания', value: cfg.farewellMessage.slice(0, 200) }
          ]
        }), { ephemeral: true });
      }

      if (subcommand === 'включить') {
        cfg.enabled = true;
        await context.store.save();
        return reply(interaction, successPanel('Система приветствий включена.', '👋 Приветствия'));
      }

      if (subcommand === 'выключить') {
        cfg.enabled = false;
        await context.store.save();
        return reply(interaction, successPanel('Система приветствий выключена.', '👋 Приветствия'));
      }

      if (subcommand === 'приветствие') {
        const channel = interaction.options.getChannel('канал', true);
        cfg.welcomeChannelId = channel.id;
        await context.store.save();
        return reply(interaction, successPanel(`Канал приветствий: <#${channel.id}>`, '👋 Приветствия'));
      }

      if (subcommand === 'прощание') {
        const channel = interaction.options.getChannel('канал', true);
        cfg.farewellChannelId = channel.id;
        await context.store.save();
        return reply(interaction, successPanel(`Канал прощаний: <#${channel.id}>`, '👋 Прощания'));
      }

      if (subcommand === 'текст') {
        cfg.welcomeMessage = interaction.options.getString('сообщение', true);
        await context.store.save();
        return reply(interaction, successPanel(`Текст приветствия обновлён.\n\nПревью:\n${cfg.welcomeMessage}`, '👋 Приветствия'));
      }

      if (subcommand === 'текст-прощания') {
        cfg.farewellMessage = interaction.options.getString('сообщение', true);
        await context.store.save();
        return reply(interaction, successPanel(`Текст прощания обновлён.\n\nПревью:\n${cfg.farewellMessage}`, '👋 Прощания'));
      }

      if (subcommand === 'авторо') {
        const role = interaction.options.getRole('роль', true);
        if (!cfg.autoRoles.includes(role.id)) {
          cfg.autoRoles.push(role.id);
          await context.store.save();
        }
        return reply(interaction, successPanel(`Роль ${role} добавлена в автовыдачу. Всего ролей: ${cfg.autoRoles.length}.`, '🎭 Авто-роли'));
      }

      if (subcommand === 'убрать-авторо') {
        const role = interaction.options.getRole('роль', true);
        cfg.autoRoles = cfg.autoRoles.filter((id) => id !== role.id);
        await context.store.save();
        return reply(interaction, successPanel(`Роль ${role} убрана из автовыдачи.`, '🎭 Авто-роли'));
      }

      if (subcommand === 'гайд') {
        cfg.guideMessage = interaction.options.getString('текст', true);
        const guideChannel = interaction.options.getChannel('канал');
        if (guideChannel) cfg.guideChannelId = guideChannel.id;
        await context.store.save();
        return reply(interaction, successPanel('Гайд-сообщение для новичков настроено. Оно будет отправлено в ЛС при входе на сервер.', '📖 Гайд'));
      }
    }
  }
];

module.exports = {
  commands
};
