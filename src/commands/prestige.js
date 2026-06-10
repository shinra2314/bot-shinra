const { SlashCommandBuilder } = require('discord.js');
const { COLORS, ButtonStyle, button, errorPanel, mediaPanel, panel, reply, update } = require('../ui/components');
const { levelFromXp, mentionUser } = require('../utils/format');
const { prestigeMultiplier } = require('../services/progression');
const achievements = require('../services/achievements');

// Минимальный уровень для престижа. Кривая level = floor(√(xp/100))+1 ⇒ 50 ур. ≈ 240k XP.
const PRESTIGE_MIN_LEVEL = 50;
const PRESTIGE_ICONS = ['⭐', '🌟', '💫', '✨', '☄️', '🌠', '🔥', '⚡', '👑', '🏅'];

function prestigeIcon(prestige) {
  return PRESTIGE_ICONS[Math.min(Math.max(prestige, 1), PRESTIGE_ICONS.length) - 1];
}

function statusPanel(user, profile) {
  const level = levelFromXp(profile.xp);
  const prestige = Number(profile.prestige || 0);
  const canPrestige = level.level >= PRESTIGE_MIN_LEVEL;
  const bonus = Math.round((prestigeMultiplier(profile) - 1) * 100);
  return panel({
    title: 'Престиж',
    icon: '👑',
    eyebrow: 'Прогресс Onix',
    description: canPrestige
      ? `${mentionUser(user.id)}, ты достиг **${level.level} уровня** — можно престижнуть! Уровень сбросится до 1, взамен — постоянный бонус к опыту.`
      : `${mentionUser(user.id)}, престиж доступен с **${PRESTIGE_MIN_LEVEL} уровня**. Сейчас у тебя **${level.level}**.`,
    color: canPrestige ? COLORS.warning : COLORS.neutral,
    thumbnail: user.displayAvatarURL({ size: 256 }),
    stats: [
      { icon: '👑', name: 'Престиж', value: prestige > 0 ? `${prestigeIcon(prestige)} ${prestige}` : 'нет' },
      { icon: '✨', name: 'Бонус к XP', value: `+${bonus}%` },
      { icon: '🆙', name: 'Уровень', value: String(level.level) }
    ],
    statColumns: 1,
    actions: canPrestige
      ? [button(`prestige:confirm:${user.id}`, '👑 Престижнуть (сброс уровня!)', ButtonStyle.Danger)]
      : [],
    footer: `Каждый престиж даёт +5% к получаемому опыту (макс. +50%).`
  });
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('престиж')
      .setDescription('Сбросить уровень ради постоянного бонуса к опыту'),
    async execute(interaction, context) {
      if (!interaction.guildId) return reply(interaction, errorPanel('Только на сервере.'), { ephemeral: true });
      const profile = context.store.ensureUser(interaction.guildId, interaction.user);
      return reply(interaction, statusPanel(interaction.user, profile), { ephemeral: true });
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton() || !interaction.customId.startsWith('prestige:')) return false;
  const [, action, ownerId] = interaction.customId.split(':');
  if (action !== 'confirm') return false;

  if (interaction.user.id !== ownerId) {
    await reply(interaction, errorPanel('Эта кнопка не для тебя.'), { ephemeral: true });
    return true;
  }

  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  const level = levelFromXp(profile.xp);
  if (level.level < PRESTIGE_MIN_LEVEL) {
    await reply(interaction, errorPanel(`Престиж доступен с ${PRESTIGE_MIN_LEVEL} уровня.`), { ephemeral: true });
    return true;
  }

  profile.prestige = Number(profile.prestige || 0) + 1;
  profile.xp = 0;
  achievements.addNamed(profile, `Престиж ${profile.prestige}`);
  await context.store.save();

  const bonus = Math.round((prestigeMultiplier(profile) - 1) * 100);
  await update(interaction, mediaPanel({
    title: `Престиж ${profile.prestige}! ${prestigeIcon(profile.prestige)}`,
    icon: '👑',
    eyebrow: 'Прогресс Onix',
    description: `${mentionUser(interaction.user.id)} переродился! Уровень сброшен, путь начинается заново — но теперь опыт капает быстрее. 🔥`,
    color: COLORS.warning,
    lines: [`✨ Постоянный бонус к опыту: **+${bonus}%**`]
  }));
  return true;
}

module.exports = {
  commands,
  handleComponent
};
