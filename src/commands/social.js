const { SlashCommandBuilder } = require('discord.js');
const { COLORS, errorPanel, panel, reply, successPanel } = require('../ui/components');
const { displayName, formatCoins, formatMinutes, levelFromXp, mentionUser } = require('../utils/format');

const REP_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('rep')
      .setDescription('Дать репутацию пользователю')
      .addUserOption((option) => option.setName('user').setDescription('Кому дать репутацию').setRequired(true))
      .addStringOption((option) =>
        option.setName('комментарий').setDescription('Причина (необязательно)').setMaxLength(120)
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const target = interaction.options.getUser('user', true);
      const comment = interaction.options.getString('комментарий') || '';

      if (target.bot) return reply(interaction, errorPanel('Ботам репутация не нужна.'), { ephemeral: true });
      if (target.id === interaction.user.id) return reply(interaction, errorPanel('Нельзя дать репутацию самому себе.'), { ephemeral: true });

      const profile = context.store.ensureUser(interaction.guildId, interaction.user);
      const lastRep = profile.lastRepGiven || 0;
      if (Date.now() - lastRep < REP_COOLDOWN_MS) {
        const remaining = REP_COOLDOWN_MS - (Date.now() - lastRep);
        const hours = Math.ceil(remaining / 3600000);
        return reply(interaction, errorPanel(`Ты сможешь дать репутацию через ~${hours} ч.`), { ephemeral: true });
      }

      const targetProfile = context.store.ensureUser(interaction.guildId, target);
      targetProfile.reputation = (targetProfile.reputation || 0) + 1;
      profile.lastRepGiven = Date.now();
      await context.store.save();

      const desc = comment
        ? `${mentionUser(interaction.user.id)} дал репутацию ${mentionUser(target.id)}.\n-# ${comment}`
        : `${mentionUser(interaction.user.id)} дал репутацию ${mentionUser(target.id)}.`;

      return reply(interaction, panel({
        title: '⭐ Репутация +1',
        description: desc,
        color: COLORS.success,
        fields: [
          { name: '⭐ Репутация', value: `${targetProfile.reputation}` }
        ]
      }));
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Статистика сервера'),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const users = context.store.users(interaction.guildId);
      const clans = context.store.clans(interaction.guildId);
      const guild = context.store.guild(interaction.guildId);

      const totalBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);
      const totalVoice = users.reduce((sum, u) => sum + (u.voiceMinutes || 0), 0);
      const totalXp = users.reduce((sum, u) => sum + (u.xp || 0), 0);
      const totalMessages = users.reduce((sum, u) => sum + (u.messageCount || 0), 0);
      const totalRep = users.reduce((sum, u) => sum + (u.reputation || 0), 0);
      const avgLevel = users.length
        ? (users.reduce((sum, u) => sum + levelFromXp(u.xp).level, 0) / users.length).toFixed(1)
        : '0';

      const richest = users.slice().sort((a, b) => (b.balance || 0) - (a.balance || 0))[0];
      const mostVoice = users.slice().sort((a, b) => (b.voiceMinutes || 0) - (a.voiceMinutes || 0))[0];

      return reply(interaction, panel({
        title: '📊 Статистика сервера',
        description: `👥 **${users.length}** пользователей • 🏰 **${clans.length}** кланов`,
        color: COLORS.info,
        fields: [
          { name: '🪙 Монет в обороте', value: formatCoins(totalBalance) },
          { name: '🎙️ Голосовой онлайн', value: formatMinutes(totalVoice) },
          { name: '✨ Всего XP', value: String(totalXp) },
          { name: '💬 Сообщений', value: String(totalMessages) },
          { name: '⭐ Репутация', value: String(totalRep) },
          { name: '📊 Ср. уровень', value: avgLevel },
          { name: '💰 Богач', value: richest ? `${mentionUser(richest.id)} — ${formatCoins(richest.balance)}` : 'нет данных' },
          { name: '🎙️ Голосовой рекорд', value: mostVoice ? `${mentionUser(mostVoice.id)} — ${formatMinutes(mostVoice.voiceMinutes)}` : 'нет данных' },
          { name: '🛍️ Лоты', value: String(guild.marketListings.filter((i) => i.status === 'active').length) },
          { name: '🎮 Ивенты', value: String(guild.events.length) }
        ]
      }));
    }
  }
];

module.exports = {
  commands
};
