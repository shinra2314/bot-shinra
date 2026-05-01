const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { COLORS, errorPanel, panel, reply, successPanel } = require('../ui/components');
const { mentionUser } = require('../utils/format');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function requireAdmin(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return 'Эта команда доступна только администраторам.';
  }
  return null;
}

function formatLogEntry(entry) {
  const time = `<t:${Math.floor(entry.createdAt / 1000)}:R>`;
  switch (entry.type) {
    case 'join':
      return `📥 ${mentionUser(entry.userId)} присоединился ${time}`;
    case 'leave':
      return `📤 **${entry.username}** покинул сервер ${time}`;
    case 'nick':
      return `✏️ ${mentionUser(entry.userId)} сменил ник: **${entry.oldNick}** → **${entry.newNick}** ${time}`;
    case 'delete':
      return `🗑️ ${entry.userId ? mentionUser(entry.userId) : 'неизвестно'} в <#${entry.channelId}> ${time}\n-# ${(entry.content || '').slice(0, 100)}`;
    case 'automod':
      return `🛡️ ${mentionUser(entry.userId)} — ${entry.violation}${entry.muted ? ' 🔇' : ''} ${time}`;
    default:
      return `${entry.type} ${time}`;
  }
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('logs')
      .setDescription('Система логирования')
      .addSubcommand((sub) =>
        sub.setName('канал').setDescription('Установить канал для логов')
          .addChannelOption((opt) => opt.setName('канал').setDescription('Канал для логов').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName('включить').setDescription('Включить логирование')
      )
      .addSubcommand((sub) =>
        sub.setName('выключить').setDescription('Выключить логирование')
      )
      .addSubcommand((sub) =>
        sub.setName('последние').setDescription('Последние логи')
          .addStringOption((opt) =>
            opt.setName('тип').setDescription('Тип события')
              .addChoices(
                { name: 'Все', value: 'all' },
                { name: 'Входы', value: 'join' },
                { name: 'Выходы', value: 'leave' },
                { name: 'Ники', value: 'nick' },
                { name: 'Удалённые', value: 'delete' },
                { name: 'AutoMod', value: 'automod' }
              )
          )
      )
      .addSubcommand((sub) =>
        sub.setName('модстатс').setDescription('Статистика модераторов')
      )
      .addSubcommand((sub) =>
        sub.setName('аудит').setDescription('Аудит действий модератора')
          .addUserOption((opt) => opt.setName('модератор').setDescription('Модератор').setRequired(true))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });
      const adminError = requireAdmin(interaction);
      if (adminError) return reply(interaction, errorPanel(adminError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'канал') {
        const channel = interaction.options.getChannel('канал', true);
        const cfg = context.logger.settings(interaction.guildId);
        cfg.channelId = channel.id;
        cfg.enabled = true;
        await context.store.save();
        return reply(interaction, successPanel(`Логи будут отправляться в <#${channel.id}>.`, '📋 Логирование'));
      }

      if (subcommand === 'включить') {
        const cfg = context.logger.settings(interaction.guildId);
        cfg.enabled = true;
        await context.store.save();
        return reply(interaction, successPanel('Логирование включено.', '📋 Логирование'));
      }

      if (subcommand === 'выключить') {
        const cfg = context.logger.settings(interaction.guildId);
        cfg.enabled = false;
        await context.store.save();
        return reply(interaction, successPanel('Логирование выключено.', '📋 Логирование'));
      }

      if (subcommand === 'последние') {
        const type = interaction.options.getString('тип') || 'all';
        const logs = context.logger.getLogs(interaction.guildId, type === 'all' ? null : type, 15);
        return reply(interaction, panel({
          title: '📋 Последние логи',
          description: type !== 'all' ? `Фильтр: **${type}**` : 'Все события',
          color: COLORS.info,
          lines: logs.length ? logs.map(formatLogEntry) : ['Логов пока нет.']
        }), { ephemeral: true });
      }

      if (subcommand === 'модстатс') {
        const stats = context.logger.modStats(interaction.guildId);
        if (!stats.length) return reply(interaction, panel({ title: '📊 Статистика модераторов', description: 'Данных пока нет.', color: COLORS.info }), { ephemeral: true });
        const lines = stats.slice(0, 10).map((s, i) =>
          `**${i + 1}.** ${mentionUser(s.id)} — ${s.total} действий\n-# ⚠️ ${s.warns} варнов • 🔨 ${s.bans} банов • 🤖 ${s.automod} автомод`
        );
        return reply(interaction, panel({
          title: '📊 Статистика модераторов',
          description: 'Количество действий модерации.',
          color: COLORS.info,
          lines
        }), { ephemeral: true });
      }

      if (subcommand === 'аудит') {
        const mod = interaction.options.getUser('модератор', true);
        const history = context.store.guild(interaction.guildId).moderationHistory
          .filter((a) => a.moderatorId === mod.id)
          .slice(0, 15);
        const lines = history.length
          ? history.map((a) => {
            const time = `<t:${Math.floor(a.createdAt / 1000)}:R>`;
            const target = a.targetId ? mentionUser(a.targetId) : '';
            return `**${a.type}** ${target} ${time}\n-# ${a.reason || 'без причины'}`;
          })
          : ['Действий не найдено.'];
        return reply(interaction, panel({
          title: `🔍 Аудит — ${mod.username}`,
          description: mentionUser(mod.id),
          color: COLORS.info,
          lines
        }), { ephemeral: true });
      }
    }
  }
];

module.exports = {
  commands
};
