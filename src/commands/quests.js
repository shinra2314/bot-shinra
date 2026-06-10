const { SlashCommandBuilder } = require('discord.js');
const { COLORS, mediaPanel, reply, errorPanel } = require('../ui/components');
const { progressBar } = require('../utils/format');
const questsService = require('../services/quests');
const { buildHubBanner } = require('../services/profileCard');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

// Баннер-карта панели квестов (best-effort).
function questsBanner() {
  return buildHubBanner({
    title: 'Ежедневные квесты',
    subtitle: 'Задания дня — награда за активность',
    accent: '#facc15',
    items: [
      { icon: 'messages', name: 'Сообщения', price: 'XP' },
      { icon: 'voice', name: 'Голосовой', price: 'мин.' },
      { icon: 'coins', name: 'Казино', price: 'игра' },
      { icon: 'case', name: 'Кейсы', price: 'дроп' },
      { icon: 'trophy', name: 'Награда', price: 'монеты' },
      { icon: 'level', name: 'Опыт', price: '+XP' }
    ]
  }).catch(() => null);
}

function questLines(daily) {
  return daily.map((quest) => {
    const bar = progressBar(quest.progress, quest.target);
    const status = quest.completed ? '✅ Выполнено' : `${quest.progress}/${quest.target}`;
    const xpPart = quest.xp ? ` • ✨ ${quest.xp}` : '';
    return `${quest.emoji} **${quest.title}**\n${bar} ${status} • 🪙 ${quest.reward}${xpPart}`;
  });
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('квесты')
      .setDescription('Ежедневные задания и их прогресс'),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const profile = context.store.ensureUser(interaction.guildId, interaction.user);
      const quests = questsService.ensure(profile);
      await context.store.save();

      const banner = await questsBanner();
      const doneDay = quests.daily.filter((quest) => quest.completed).length;
      const doneWeek = quests.weekly.filter((quest) => quest.completed).length;
      const lines = [
        `__📅 Ежедневные — ${doneDay}/${quests.daily.length}__`,
        ...questLines(quests.daily),
        '',
        `__🗓️ Недельные — ${doneWeek}/${quests.weekly.length}__`,
        ...questLines(quests.weekly)
      ];
      return reply(
        interaction,
        mediaPanel({
          title: 'Квесты',
          icon: '🎯',
          eyebrow: 'Прогресс Onix',
          description: 'Награда начисляется автоматически при выполнении.',
          imageUrl: banner?.imageUrl,
          color: COLORS.warning,
          lines,
          footer: 'Дневные обновляются каждый день, недельные — раз в неделю.'
        }),
        { files: banner?.files, ephemeral: true }
      );
    }
  }
];

module.exports = { commands };
