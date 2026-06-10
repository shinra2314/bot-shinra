const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { COLORS, ICONS, errorPanel, panel, reply, successPanel } = require('../ui/components');
const { formatDateTime, mentionUser, truncate } = require('../utils/format');

function canManage(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function configLines(cfg) {
  return [
    `Состояние: **${cfg.enabled ? 'включено ✅' : 'выключено ⛔'}**`,
    `Спам: **${cfg.spamCount}** сообщений за **${Math.round(cfg.spamWindowMs / 1000)}** сек`,
    `Пинг за раз: **${cfg.mentionLimit}** • частый пинг: **${cfg.mentionRate}** за **${Math.round(cfg.mentionRateMs / 1000)}** сек`,
    `Инвайты Discord: **${cfg.blockInvites ? 'блок' : 'разрешены'}** • внешние ссылки: **${cfg.blockLinks ? 'блок' : 'разрешены'}**`,
    `Капс: **${cfg.capsEnabled ? 'вкл' : 'выкл'}** • эмодзи > **${cfg.emojiLimit}** • переносы > **${cfg.newlineLimit}**`,
    `Запрещённых слов: **${cfg.badwords.length}** • роли-исключения: **${cfg.bypassRoleIds.length}**`,
    `Эскалация: ${cfg.timeoutSteps.map((s) => `${s.strikes}→${Math.round(s.ms / 60000)}м`).join(', ') || '—'}`
  ];
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('automod')
      .setDescription('Автомодерация и логи сервера')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('статус').setDescription('Текущая конфигурация автомода'))
      .addSubcommand((s) => s.setName('вкл').setDescription('Включить автомодерацию'))
      .addSubcommand((s) => s.setName('выкл').setDescription('Выключить автомодерацию'))
      .addSubcommand((s) =>
        s
          .setName('канал')
          .setDescription('Назначить мастер-канал логов')
          .addChannelOption((o) =>
            o.setName('канал').setDescription('Текстовый канал для логов').addChannelTypes(ChannelType.GuildText).setRequired(true)
          )
      )
      .addSubcommand((s) =>
        s
          .setName('порог')
          .setDescription('Настроить пороги спама и пингов')
          .addIntegerOption((o) => o.setName('спам').setDescription('Сообщений за окно (антиспам)').setMinValue(2).setMaxValue(50))
          .addIntegerOption((o) => o.setName('упоминания').setDescription('Лимит упоминаний за сообщение').setMinValue(2).setMaxValue(50))
      )
      .addSubcommand((s) => s.setName('лог').setDescription('Последние срабатывания автомода')),
    async execute(interaction, context) {
      if (!interaction.guildId) return reply(interaction, errorPanel('Только на сервере.'), { ephemeral: true });
      if (!canManage(interaction)) return reply(interaction, errorPanel('Нужно право «Управление сервером».'), { ephemeral: true });

      const sub = interaction.options.getSubcommand();
      const { store } = context;

      if (sub === 'статус') {
        const cfg = store.getAutomodConfig(interaction.guildId);
        const log = store.getLogConfig(interaction.guildId);
        return reply(interaction, panel({
          title: 'Автомодерация',
          icon: ICONS.moderation,
          eyebrow: 'Настройки Onix',
          color: cfg.enabled ? COLORS.success : COLORS.neutral,
          lines: [...configLines(cfg), `Мастер-канал логов: ${log.logChannelId ? `<#${log.logChannelId}>` : 'не задан'}`]
        }), { ephemeral: true });
      }

      if (sub === 'вкл' || sub === 'выкл') {
        store.setAutomodConfig(interaction.guildId, { enabled: sub === 'вкл' });
        await store.save();
        return reply(interaction, successPanel(`Автомодерация ${sub === 'вкл' ? 'включена' : 'выключена'}.`, 'Автомод'), { ephemeral: true });
      }

      if (sub === 'канал') {
        const channel = interaction.options.getChannel('канал', true);
        store.setLogConfig(interaction.guildId, { logChannelId: channel.id });
        await store.save();
        return reply(interaction, successPanel(`Мастер-канал логов: <#${channel.id}>.\nВключи нужные события в дашборде.`, 'Логи'), { ephemeral: true });
      }

      if (sub === 'порог') {
        const patch = {};
        const spam = interaction.options.getInteger('спам');
        const mentions = interaction.options.getInteger('упоминания');
        if (spam !== null) patch.spamCount = spam;
        if (mentions !== null) patch.mentionLimit = mentions;
        if (!Object.keys(patch).length) return reply(interaction, errorPanel('Укажи хотя бы один параметр.'), { ephemeral: true });
        store.setAutomodConfig(interaction.guildId, patch);
        await store.save();
        const cfg = store.getAutomodConfig(interaction.guildId);
        return reply(interaction, successPanel(`Спам: ${cfg.spamCount} / ${Math.round(cfg.spamWindowMs / 1000)}с • упоминания: ${cfg.mentionLimit}.`, 'Пороги обновлены'), { ephemeral: true });
      }

      // лог
      const entries = store.automodLog(interaction.guildId, 10);
      return reply(interaction, panel({
        title: 'Срабатывания автомода',
        icon: ICONS.moderation,
        eyebrow: 'Журнал Onix',
        color: COLORS.danger,
        lines: entries.length
          ? entries.map((e) => `${mentionUser(e.userId)} — ${e.rules.join(', ')}\n-# ${formatDateTime(e.createdAt)} • ${truncate(e.content || '—', 80)}`)
          : ['Журнал пуст.']
      }), { ephemeral: true });
    }
  }
];

module.exports = { commands };
