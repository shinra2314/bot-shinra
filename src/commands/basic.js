const { SlashCommandBuilder } = require('discord.js');
const {
  ButtonStyle,
  COLORS,
  button,
  componentPayload,
  errorPanel,
  linkButton,
  mediaPanel,
  panel,
  reply,
  select,
  update
} = require('../ui/components');
const {
  displayName,
  formatMinutes,
  mentionUser,
  truncate
} = require('../utils/format');

const HELP_CATEGORIES = [
  {
    id: 'main',
    label: 'Основные',
    description: 'Жалобы, профили, аватарки и онлайн',
    commands: [
      ['`/report`', 'отправить жалобу на пользователя'],
      ['`/помощь`', 'показать список команд'],
      ['`/profile карточка`', 'карточка персонажа'],
      ['`/profile настроить`', 'кастомизация профиля'],
      ['`/online`', 'голосовой онлайн'],
      ['`/avatar`', 'аватар пользователя'],
      ['`/banner`', 'баннер пользователя']
    ]
  },
  {
    id: 'games',
    label: 'Игры',
    description: 'Ивенты, мафия и клозы',
    commands: [
      ['`/event статистика`', 'статистика ивентов'],
      ['`/event создать`', 'создать ивент'],
      ['`/event участвовать`', 'записаться на ивент'],
      ['`/event список`', 'активные ивенты'],
      ['`/event топ`', 'лидерборд ивентов'],
      ['`/event награда`', 'выдать награды участникам'],
      ['`/mafia статистика`', 'статистика игрока мафии'],
      ['`/mafia топ`', 'топ игроков мафии'],
      ['`/mafia история`', 'личная история игр мафии'],
      ['`/close статистика`', 'статистика клозов']
    ]
  },
  {
    id: 'tops',
    label: 'Различные топы',
    description: 'Баланс, онлайн, уровни, комнаты и кланы',
    commands: [
      ['`/top баланс`', 'топ по балансу'],
      ['`/top онлайн`', 'топ по голосовому онлайну'],
      ['`/top комнаты`', 'топ по личным комнатам'],
      ['`/top любовь`', 'топ по любовным комнатам'],
      ['`/top уровень`', 'топ по уровням'],
      ['`/top рейтинг`', 'топ кланов по очкам'],
      ['`/top участники`', 'топ кланов по участникам']
    ]
  },
  {
    id: 'economy',
    label: 'Экономика',
    description: 'Баланс, награды, магазин, кейсы',
    commands: [
      ['`/balance`', 'посмотреть баланс'],
      ['`/timely`', 'предсказание на день и награда'],
      ['`/give`', 'передать валюту'],
      ['`/shop`', 'магазин личных ролей и кейсов'],
      ['`/inventory`', 'инвентарь ролей'],
      ['`/transactions`', 'последние транзакции'],
      ['`/case инвентарь`', 'количество кейсов'],
      ['`/case открыть`', 'открыть кейс'],
      ['`/case история`', 'история призов с кейсов']
    ]
  },
  {
    id: 'roles',
    label: 'Личные роли',
    description: 'Создание и управление личной ролью',
    commands: [
      ['`/role управление`', 'управление личной ролью'],
      ['`/role инфо`', 'информация о личной роли'],
      ['`/role создать`', 'создать личную роль']
    ]
  },
  {
    id: 'clans',
    label: 'Кланы',
    description: 'Профиль, онлайн и выход из клана',
    commands: [
      ['`/clan профиль`', 'профиль клана'],
      ['`/clan создать`', 'создать клан'],
      ['`/clan вступить`', 'вступить в клан'],
      ['`/clan онлайн`', 'голосовой онлайн клана'],
      ['`/clan выйти`', 'покинуть клан'],
      ['`/clan банк`', 'банк клана'],
      ['`/clan донат`', 'пожертвовать в банк'],
      ['`/clan задания`', 'клановые задания'],
      ['`/clan война`', 'клановая война'],
      ['`/clan магазин`', 'клановый магазин'],
      ['`/clan улучшить`', 'улучшить клан'],
      ['`/clan рейтинг`', 'клановый рейтинг']
    ]
  },
  {
    id: 'market',
    label: 'Маркет',
    description: 'Рынок, аукционы и обмен предметами',
    commands: [
      ['`/market список`', 'активные лоты'],
      ['`/market продать`', 'выставить предмет'],
      ['`/market купить`', 'купить лот'],
      ['`/auction список`', 'активные аукционы'],
      ['`/auction создать`', 'создать аукцион'],
      ['`/auction ставка`', 'сделать ставку']
    ]
  },
  {
    id: 'moderation',
    label: 'Модерация',
    description: 'Репорты, наказания, апелляции и тикеты',
    commands: [
      ['`/mod репорты`', 'очередь жалоб'],
      ['`/mod варн`', 'выдать предупреждение'],
      ['`/mod история`', 'история наказаний'],
      ['`/appeal`', 'подать апелляцию'],
      ['`/ticket создать`', 'создать тикет']
    ]
  },
  {
    id: 'rooms',
    label: 'Комнаты',
    description: 'Временные голосовые комнаты',
    commands: [
      ['`/room панель`', 'панель управления'],
      ['`/room лимит`', 'лимит участников'],
      ['`/room название`', 'переименовать комнату'],
      ['`/room кикнуть`', 'кикнуть из комнаты'],
      ['`/room передать`', 'передать владельца'],
      ['`/room закрепить`', 'закрепить на 24 часа']
    ]
  },
  {
    id: 'music',
    label: 'Музыка',
    description: 'Очередь, громкость и управление',
    commands: [
      ['`/play`', 'включить песню'],
      ['`/volume`', 'установить громкость'],
      ['`/skip`', 'пропустить трек'],
      ['`/pause`', 'поставить трек на паузу'],
      ['`/resume`', 'убрать паузу'],
      ['`/stop`', 'остановить воспроизведение']
    ]
  },
  {
    id: 'fun',
    label: 'Развлечения',
    description: 'Монетка, дуэли, реакции',
    commands: [
      ['`/coinflip`', 'подбросить монетку'],
      ['`/duel`', 'бросить вызов на монеты'],
      ['`/reaction`', 'отправить реакцию в чат'],
      ['`/snowball`', 'бросить снежок']
    ]
  }
];

function allUniqueCommands() {
  const seen = new Set();
  for (const category of HELP_CATEGORIES) {
    for (const [name] of category.commands) seen.add(name);
  }
  return seen.size;
}

function helpComponents(categoryId = 'main') {
  const category = HELP_CATEGORIES.find((item) => item.id === categoryId) || HELP_CATEGORIES[0];
  return panel({
    eyebrow: `Раздел ${HELP_CATEGORIES.findIndex((item) => item.id === category.id) + 1}/${HELP_CATEGORIES.length}`,
    title: category.label,
    description: category.description,
    color: COLORS.info,
    lines: category.commands.map(([name, description]) => `${name} — ${description}`),
    footer: `Всего в каталоге: ${allUniqueCommands()} команд без повторов. Выбери другой раздел ниже.`,
    actions: [
      select(
        'help:category',
        'Раздел команд',
        HELP_CATEGORIES.map((item) => ({
          label: item.label,
          value: item.id,
          description: item.description
        }))
      )
    ]
  });
}

function requireGuild(interaction) {
  if (!interaction.guildId) {
    return 'Эта команда работает только на сервере.';
  }
  return null;
}

function rankPosition(users, userId, selector) {
  const sorted = users.slice().sort((a, b) => selector(b) - selector(a));
  const index = sorted.findIndex((user) => user.id === userId);
  return index === -1 ? 'нет' : `#${index + 1}`;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('report')
      .setDescription('Отправить жалобу на пользователя')
      .addUserOption((option) =>
        option.setName('user').setDescription('На кого жалоба').setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('reason')
          .setDescription('Причина жалобы')
          .setMinLength(3)
          .setMaxLength(900)
          .setRequired(true)
      )
      .addStringOption((option) =>
        option.setName('evidence').setDescription('Ссылка или дополнительное описание').setMaxLength(900)
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const target = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      const evidence = interaction.options.getString('evidence') || 'Не указано';
      const report = {
        id: interaction.id,
        reporterId: interaction.user.id,
        targetId: target.id,
        reason,
        evidence
      };

      context.store.ensureUser(interaction.guildId, interaction.user);
      context.store.ensureUser(interaction.guildId, target);
      context.store.addReport(interaction.guildId, report);
      await context.store.save();

      const reportView = panel({
        title: 'Новая жалоба',
        description: `${mentionUser(interaction.user.id)} пожаловался на ${mentionUser(target.id)}`,
        color: COLORS.danger,
        fields: [
          { name: 'Причина', value: truncate(reason, 900) },
          { name: 'Доказательства', value: truncate(evidence, 900) }
        ],
        footer: `ID жалобы: ${report.id}`,
        actions: [
          button(`mod:accept:${report.id}`, 'Принять', ButtonStyle.Success),
          button(`mod:reject:${report.id}`, 'Отклонить', ButtonStyle.Secondary),
          button(`mod:warn:${report.id}`, 'Warn', ButtonStyle.Primary),
          button(`mod:ban:${report.id}`, 'Ban', ButtonStyle.Danger),
          button(`mod:ticket:${report.id}`, 'Тикет', ButtonStyle.Secondary)
        ]
      });

      let copied = false;
      if (context.config.reportChannelId) {
        const channel = await interaction.client.channels
          .fetch(context.config.reportChannelId)
          .catch(() => null);
        if (channel?.isTextBased()) {
          await channel.send(componentPayload(reportView));
          copied = true;
        }
      }

      return reply(
        interaction,
        panel({
          title: 'Отправить жалобу',
          description: `${mentionUser(interaction.user.id)}, Вы успешно отправили жалобу на пользователя ${mentionUser(target.id)}.\n**Ожидайте ответа от модерации сервера.**`,
          color: COLORS.danger,
          thumbnail: target.displayAvatarURL({ size: 256 }),
          footer: copied ? 'Жалоба отправлена в канал модерации.' : 'Жалоба сохранена локально.'
        }),
        { ephemeral: false }
      );
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('помощь')
      .setDescription('Показать список команд')
      .addStringOption((option) =>
        option
          .setName('section')
          .setDescription('Раздел')
          .addChoices(...HELP_CATEGORIES.map((item) => ({ name: item.label, value: item.id })))
      ),
    async execute(interaction) {
      const category = interaction.options.getString('section') || 'main';
      return reply(interaction, helpComponents(category), { ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('online')
      .setDescription('Показать голосовой онлайн')
      .addUserOption((option) => option.setName('user').setDescription('Пользователь')),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const target = interaction.options.getUser('user') || interaction.user;
      const profile = context.store.ensureUser(interaction.guildId, target);
      const liveMinutes = context.voiceTracker.currentMinutes(interaction.guildId, target.id);
      const today = new Date().toISOString().slice(0, 10);
      const dayMinutes = profile.voiceDailyDate === today ? Number(profile.voiceDailyMinutes || 0) : 0;
      const totalMinutes = profile.voiceMinutes + liveMinutes;
      const rank = rankPosition(
        context.store.users(interaction.guildId),
        target.id,
        (user) => Number(user.voiceMinutes || 0) + context.voiceTracker.currentMinutes(interaction.guildId, user.id)
      );
      await context.store.save();

      return reply(
        interaction,
        panel({
          title: `Голосовой онлайн: ${displayName(target)}`,
          description: `${mentionUser(target.id)}`,
          thumbnail: target.displayAvatarURL({ size: 256 }),
          color: COLORS.info,
          fields: [
            { name: 'За сутки', value: formatMinutes(dayMinutes + liveMinutes) },
            { name: 'За всё время', value: formatMinutes(totalMinutes) },
            { name: 'Место в топе', value: rank }
          ]
        })
      );
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('avatar')
      .setDescription('Показать аватар пользователя')
      .addUserOption((option) => option.setName('user').setDescription('Пользователь')),
    async execute(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      const url = target.displayAvatarURL({ size: 4096 });
      return reply(
        interaction,
        mediaPanel({
          title: `Аватар: ${displayName(target)}`,
          description: `${mentionUser(target.id)}`,
          imageUrl: url,
          color: COLORS.primary,
          actions: [linkButton('Открыть оригинал', url)]
        })
      );
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('banner')
      .setDescription('Показать баннер пользователя')
      .addUserOption((option) => option.setName('user').setDescription('Пользователь')),
    async execute(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      const fetched = await interaction.client.users.fetch(target.id, { force: true });
      const url = fetched.bannerURL({ size: 4096 });

      if (!url) {
        return reply(
          interaction,
          errorPanel(`${mentionUser(target.id)} не установил баннер.`),
          { ephemeral: true }
        );
      }

      return reply(
        interaction,
        mediaPanel({
          title: `Баннер: ${displayName(fetched)}`,
          description: `${mentionUser(fetched.id)}`,
          imageUrl: url,
          color: COLORS.primary,
          actions: [linkButton('Открыть оригинал', url)]
        })
      );
    }
  }
];

async function handleComponent(interaction) {
  if (!interaction.isStringSelectMenu()) return false;
  if (interaction.customId !== 'help:category') return false;

  const [category] = interaction.values;
  await update(interaction, helpComponents(category));
  return true;
}

module.exports = {
  commands,
  handleComponent
};
