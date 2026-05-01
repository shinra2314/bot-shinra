const { SlashCommandBuilder } = require('discord.js');
const { COLORS, errorPanel, panel, reply, successPanel } = require('../ui/components');
const { formatCoins, levelFromXp, mentionUser } = require('../utils/format');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

const AUTO_TITLES = [
  { id: 'veteran', name: '🏅 Ветеран', condition: (p) => (p.voiceMinutes || 0) >= 6000, description: '100 часов в войсе' },
  { id: 'tycoon', name: '💰 Магнат', condition: (p) => (p.balance || 0) >= 100000, description: '100 000 монет на балансе' },
  { id: 'voice_king', name: '🎙️ Голосовой король', condition: (p) => (p.voiceMinutes || 0) >= 30000, description: '500 часов в войсе' },
  { id: 'chatterbox', name: '💬 Болтун', condition: (p) => (p.messageCount || 0) >= 5000, description: '5 000 сообщений' },
  { id: 'respected', name: '⭐ Уважаемый', condition: (p) => (p.reputation || 0) >= 25, description: '25 репутации' },
  { id: 'legend', name: '👑 Легенда', condition: (p) => levelFromXp(p.xp).level >= 25, description: 'Достичь 25 уровня' },
  { id: 'collector', name: '🃏 Коллекционер', condition: (p) => (p.cards?.length || 0) >= 30, description: '30 карточек в коллекции' },
  { id: 'duelist', name: '⚔️ Дуэлянт', condition: (p) => (p.achievements || []).includes('Первая дуэль'), description: 'Победить в дуэли' },
  { id: 'streaker', name: '🔥 Стрикер', condition: (p) => (p.timelyStreak || 0) >= 30, description: '30 дней подряд timely' },
  { id: 'clan_leader', name: '🏰 Лидер клана', condition: (p) => !!p.clanId, description: 'Состоять в клане' }
];

const CUSTOM_TITLES = [
  { id: 'custom_fire', name: '🔥 Огненный', price: 3000 },
  { id: 'custom_ice', name: '❄️ Ледяной', price: 3000 },
  { id: 'custom_shadow', name: '🌑 Тёмный', price: 4000 },
  { id: 'custom_light', name: '✨ Сияющий', price: 4000 },
  { id: 'custom_storm', name: '⚡ Грозовой', price: 5000 },
  { id: 'custom_dragon', name: '🐉 Драконий', price: 8000 },
  { id: 'custom_divine', name: '👼 Божественный', price: 10000 },
  { id: 'custom_chaos', name: '💀 Хаотичный', price: 10000 }
];

const LIMITED_TITLES = [
  { id: 'limited_ny', name: '🎄 Новогодний', event: 'new_year', description: 'Ограниченный: Новый год' },
  { id: 'limited_halloween', name: '🎃 Хэллоуинский', event: 'halloween', description: 'Ограниченный: Хэллоуин' },
  { id: 'limited_valentine', name: '💝 Влюблённый', event: 'valentine', description: 'Ограниченный: День Валентина' },
  { id: 'limited_summer', name: '☀️ Летний', event: 'summer', description: 'Ограниченный: Лето' },
  { id: 'limited_beta', name: '🧪 Бета-тестер', event: 'beta', description: 'Ограниченный: Бета' }
];

function ensureTitles(profile) {
  profile.unlockedTitles ||= [];
  profile.activeTitle ||= null;
  return profile;
}

function checkAutoTitles(profile) {
  ensureTitles(profile);
  const newTitles = [];
  for (const title of AUTO_TITLES) {
    if (profile.unlockedTitles.includes(title.id)) continue;
    if (title.condition(profile)) {
      profile.unlockedTitles.push(title.id);
      newTitles.push(title);
    }
  }
  return newTitles;
}

function getAllTitles(profile) {
  ensureTitles(profile);
  const titles = [];

  for (const t of AUTO_TITLES) {
    titles.push({
      ...t,
      type: 'auto',
      unlocked: profile.unlockedTitles.includes(t.id),
      active: profile.activeTitle === t.id
    });
  }
  for (const t of CUSTOM_TITLES) {
    titles.push({
      ...t,
      type: 'custom',
      unlocked: profile.unlockedTitles.includes(t.id),
      active: profile.activeTitle === t.id
    });
  }
  for (const t of LIMITED_TITLES) {
    titles.push({
      ...t,
      type: 'limited',
      unlocked: profile.unlockedTitles.includes(t.id),
      active: profile.activeTitle === t.id
    });
  }

  return titles;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('titles')
      .setDescription('Система титулов и рангов')
      .addSubcommand((sub) =>
        sub.setName('список').setDescription('Все доступные титулы')
      )
      .addSubcommand((sub) =>
        sub.setName('мои').setDescription('Мои разблокированные титулы')
      )
      .addSubcommand((sub) =>
        sub.setName('установить').setDescription('Установить активный титул')
          .addStringOption((opt) =>
            opt.setName('титул').setDescription('ID титула').setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub.setName('купить').setDescription('Купить кастомный титул')
          .addStringOption((opt) =>
            opt.setName('титул').setDescription('ID титула').setRequired(true)
              .addChoices(...CUSTOM_TITLES.map((t) => ({ name: `${t.name} (${t.price} мон.)`, value: t.id })))
          )
      )
      .addSubcommand((sub) =>
        sub.setName('сбросить').setDescription('Убрать активный титул')
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
      const profile = context.store.ensureUser(interaction.guildId, interaction.user);
      ensureTitles(profile);

      const newTitles = checkAutoTitles(profile);
      if (newTitles.length > 0) await context.store.save();

      if (subcommand === 'список') {
        const autoLines = AUTO_TITLES.map((t) => {
          const unlocked = profile.unlockedTitles.includes(t.id);
          return `${unlocked ? '✅' : '🔒'} **${t.name}** — ${t.description}`;
        });

        const customLines = CUSTOM_TITLES.map((t) => {
          const unlocked = profile.unlockedTitles.includes(t.id);
          return `${unlocked ? '✅' : '🛒'} **${t.name}** — ${formatCoins(t.price)}`;
        });

        const limitedLines = LIMITED_TITLES.map((t) => {
          const unlocked = profile.unlockedTitles.includes(t.id);
          return `${unlocked ? '✅' : '🔒'} **${t.name}** — ${t.description}`;
        });

        return reply(interaction, panel({
          title: '🏷️ Каталог титулов',
          description: `Активный титул: **${profile.activeTitle ? (getAllTitles(profile).find((t) => t.id === profile.activeTitle)?.name || 'нет') : 'нет'}**`,
          color: COLORS.primary,
          fields: [
            { name: '🏅 Автоматические', value: autoLines.join('\n') },
            { name: '🛒 Кастомные', value: customLines.join('\n') },
            { name: '⏳ Лимитированные', value: limitedLines.join('\n') }
          ]
        }), { ephemeral: true });
      }

      if (subcommand === 'мои') {
        const unlocked = getAllTitles(profile).filter((t) => t.unlocked);
        if (!unlocked.length) {
          return reply(interaction, panel({
            title: '🏷️ Мои титулы',
            description: 'У тебя пока нет разблокированных титулов.',
            color: COLORS.info
          }), { ephemeral: true });
        }
        const lines = unlocked.map((t) => `${t.active ? '👉 ' : ''}**${t.name}**${t.active ? ' *(активен)*' : ''}`);
        return reply(interaction, panel({
          title: '🏷️ Мои титулы',
          description: mentionUser(interaction.user.id),
          color: COLORS.primary,
          lines,
          footer: `Разблокировано: ${unlocked.length}/${AUTO_TITLES.length + CUSTOM_TITLES.length + LIMITED_TITLES.length}`
        }), { ephemeral: true });
      }

      if (subcommand === 'установить') {
        const titleId = interaction.options.getString('титул', true);
        if (!profile.unlockedTitles.includes(titleId)) {
          return reply(interaction, errorPanel('Этот титул не разблокирован.'), { ephemeral: true });
        }
        profile.activeTitle = titleId;
        const title = getAllTitles(profile).find((t) => t.id === titleId);
        await context.store.save();
        return reply(interaction, successPanel(`Титул установлен: **${title?.name || titleId}**`, '🏷️ Титул'));
      }

      if (subcommand === 'купить') {
        const titleId = interaction.options.getString('титул', true);
        if (profile.unlockedTitles.includes(titleId)) {
          return reply(interaction, errorPanel('У тебя уже есть этот титул.'), { ephemeral: true });
        }
        const titleData = CUSTOM_TITLES.find((t) => t.id === titleId);
        if (!titleData) return reply(interaction, errorPanel('Титул не найден.'), { ephemeral: true });

        if (profile.balance < titleData.price) {
          return reply(interaction, errorPanel(`Недостаточно монет. Нужно ${formatCoins(titleData.price)}.`), { ephemeral: true });
        }

        profile.balance -= titleData.price;
        profile.unlockedTitles.push(titleId);
        context.store.recordTransaction(interaction.guildId, {
          type: 'expense',
          fromId: interaction.user.id,
          amount: titleData.price,
          note: `титул: ${titleData.name}`
        });
        await context.store.save();
        return reply(interaction, successPanel(`Титул **${titleData.name}** куплен! Установи через \`/titles установить\`.`, '🏷️ Покупка'));
      }

      if (subcommand === 'сбросить') {
        profile.activeTitle = null;
        await context.store.save();
        return reply(interaction, successPanel('Активный титул убран.', '🏷️ Титул'));
      }
    }
  }
];

module.exports = {
  commands,
  checkAutoTitles,
  AUTO_TITLES,
  CUSTOM_TITLES,
  LIMITED_TITLES
};
