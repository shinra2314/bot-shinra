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

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('automod')
      .setDescription('Управление автомодерацией')
      .addSubcommand((sub) => sub.setName('статус').setDescription('Текущие настройки AutoMod'))
      .addSubcommand((sub) =>
        sub.setName('включить').setDescription('Включить AutoMod')
      )
      .addSubcommand((sub) =>
        sub.setName('выключить').setDescription('Выключить AutoMod')
      )
      .addSubcommand((sub) =>
        sub.setName('настроить').setDescription('Изменить настройку')
          .addStringOption((opt) =>
            opt.setName('параметр').setDescription('Что настроить').setRequired(true)
              .addChoices(
                { name: 'Фильтр спама', value: 'spamFilter' },
                { name: 'Фильтр капса', value: 'capsFilter' },
                { name: 'Фильтр ссылок', value: 'linkFilter' },
                { name: 'Анти-рейд', value: 'antiRaid' }
              )
          )
          .addBooleanOption((opt) =>
            opt.setName('значение').setDescription('Вкл/Выкл').setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub.setName('модераторы').setDescription('Репутация модераторов')
      )
      .addSubcommand((sub) =>
        sub.setName('предупреждения').setDescription('Предупреждения пользователя')
          .addUserOption((opt) => opt.setName('user').setDescription('Пользователь').setRequired(true))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'модераторы' || subcommand === 'предупреждения') {
        // read-only, allow mods
      } else {
        const adminError = requireAdmin(interaction);
        if (adminError) return reply(interaction, errorPanel(adminError), { ephemeral: true });
      }

      const cfg = context.automod.settings(interaction.guildId);

      if (subcommand === 'статус') {
        const toggle = (v) => v ? '✅ Вкл' : '❌ Выкл';
        return reply(interaction, panel({
          title: '🛡️ AutoMod — Настройки',
          description: `Статус: **${toggle(cfg.enabled)}**`,
          color: COLORS.info,
          fields: [
            { name: '🔁 Фильтр спама', value: `${toggle(cfg.spamFilter)}\n-# макс ${cfg.maxDuplicates} повторов за ${cfg.duplicateWindow / 1000}с` },
            { name: '🔠 Фильтр капса', value: `${toggle(cfg.capsFilter)}\n-# порог ${Math.round(cfg.capsThreshold * 100)}%, мин. ${cfg.capsMinLength} символов` },
            { name: '🔗 Фильтр ссылок', value: toggle(cfg.linkFilter) },
            { name: '🚨 Анти-рейд', value: `${toggle(cfg.antiRaid)}\n-# ${cfg.raidThreshold} входов за ${cfg.raidWindow / 1000}с` },
            { name: '🔇 Автомьют', value: `После ${cfg.warnThreshold} нарушений → мьют на ${cfg.muteMinutes} мин.` }
          ]
        }), { ephemeral: true });
      }

      if (subcommand === 'включить') {
        cfg.enabled = true;
        await context.store.save();
        return reply(interaction, successPanel('AutoMod включен. Бот будет автоматически модерировать чат.', '🛡️ AutoMod'));
      }

      if (subcommand === 'выключить') {
        cfg.enabled = false;
        await context.store.save();
        return reply(interaction, successPanel('AutoMod выключен.', '🛡️ AutoMod'));
      }

      if (subcommand === 'настроить') {
        const param = interaction.options.getString('параметр', true);
        const value = interaction.options.getBoolean('значение', true);
        cfg[param] = value;
        await context.store.save();
        const names = { spamFilter: 'Фильтр спама', capsFilter: 'Фильтр капса', linkFilter: 'Фильтр ссылок', antiRaid: 'Анти-рейд' };
        return reply(interaction, successPanel(`**${names[param]}** — ${value ? '✅ включен' : '❌ выключен'}.`, '🛡️ AutoMod'));
      }

      if (subcommand === 'модераторы') {
        const mods = context.automod.modReputation(interaction.guildId);
        if (!mods.length) return reply(interaction, panel({ title: '👮 Репутация модераторов', description: 'Пока нет данных.', color: COLORS.info }));
        const lines = mods.slice(0, 10).map((mod, i) =>
          `**${i + 1}.** ${mentionUser(mod.id)} — ⭐ ${mod.score} очков\n-# Действий: ${mod.actions} • Варнов: ${mod.warns} • Банов: ${mod.bans}`
        );
        return reply(interaction, panel({
          title: '👮 Репутация модераторов',
          description: 'Рейтинг основан на количестве и качестве действий модерации.',
          color: COLORS.info,
          lines
        }));
      }

      if (subcommand === 'предупреждения') {
        const target = interaction.options.getUser('user', true);
        const count = context.automod.getWarnings(interaction.guildId, target.id);
        return reply(interaction, panel({
          title: `⚠️ Предупреждения — ${target.username}`,
          description: `${mentionUser(target.id)} — **${count}** предупреждений за 24 часа.\n${count >= 3 ? '🔇 Следующее нарушение приведёт к мьюту.' : ''}`,
          color: count >= 3 ? COLORS.danger : COLORS.warning
        }), { ephemeral: true });
      }
    }
  }
];

module.exports = {
  commands
};
