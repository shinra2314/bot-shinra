const { SlashCommandBuilder } = require('discord.js');
const { COLORS, ICONS, ButtonStyle, button, errorPanel, mediaPanel, panel, reply, update } = require('../ui/components');
const { displayName, formatCoins, formatDateTime, formatDuration, mentionUser, progressBar, timeAgo } = require('../utils/format');
const { buildLoveCard } = require('../services/profileCard');

const ACTION_COOLDOWN_MS = 30 * 60 * 1000;

const LOVE_ACTIONS = {
  комплимент: { label: 'Комплимент', cost: 0, xp: 25, mood: 8 },
  обнять: { label: 'Объятие', cost: 0, xp: 35, mood: 10 },
  прогулка: { label: 'Прогулка', cost: 150, xp: 65, mood: 16 },
  свидание: { label: 'Свидание', cost: 350, xp: 110, mood: 24 }
};

const LOVE_GIFTS = {
  цветы: { label: 'Цветы', cost: 250, xp: 70, mood: 18 },
  лотос: { label: 'Лотосовый набор', cost: 900, xp: 150, mood: 28 },
  кольцо: { label: 'Кольцо Onix', cost: 2500, xp: 320, mood: 45 }
};

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function loveLevel(xp) {
  const safeXp = Math.max(0, Number(xp || 0));
  const level = Math.floor(Math.sqrt(safeXp / 80)) + 1;
  const current = (level - 1) ** 2 * 80;
  const next = level ** 2 * 80;
  return {
    level,
    progress: safeXp - current,
    needed: next - current,
    xp: safeXp
  };
}

function moodNow(relationship) {
  const lastActionAt = Number(relationship?.lastActionAt || 0);
  const daysWithoutAction = lastActionAt ? Math.max(0, Math.floor((Date.now() - lastActionAt) / 86_400_000) - 1) : 0;
  return Math.max(0, Math.min(100, Number(relationship?.mood || 70) - daysWithoutAction * 5));
}

function moodLabel(value) {
  if (value >= 85) return 'искрит';
  if (value >= 65) return 'тепло';
  if (value >= 40) return 'стабильно';
  if (value >= 20) return 'нужно внимание';
  return 'на грани';
}

async function fetchUser(client, userId) {
  return client.users.fetch(userId).catch(() => ({
    id: userId,
    username: userId,
    globalName: null,
    bot: false,
    displayAvatarURL: () => null
  }));
}

async function relationshipPanel(interaction, context, targetUser) {
  const profile = context.store.ensureUser(interaction.guildId, targetUser);
  const relationship = context.store.relationshipForUser(interaction.guildId, targetUser.id);
  if (!profile.lovePartnerId || !relationship) {
    const card = await buildLoveCard({
      a: { name: displayName(targetUser), avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 }) },
      b: null,
      compatibility: 0,
      tiles: [{ label: 'Статус', value: 'Холост' }]
    });
    const components = mediaPanel({
      title: `Отношения — ${displayName(targetUser)}`,
      icon: ICONS.love,
      eyebrow: 'Отношения Onix',
      description: `${mentionUser(targetUser.id)} пока без пары.`,
      color: COLORS.love,
      imageUrl: card?.imageUrl,
      lines: [
        'Можно отправить предложение через `/love предложить`.',
        'Пара получает общий уровень, настроение, серию действий и историю.'
      ]
    });
    return { components, files: card?.files };
  }

  const partner = await fetchUser(interaction.client, profile.lovePartnerId);
  const level = loveLevel(relationship.xp);
  const mood = moodNow(relationship);
  const actions = (relationship.actions || []).slice(0, 5);
  const daysTogether = relationship.createdAt
    ? Math.max(0, Math.floor((Date.now() - relationship.createdAt) / 86_400_000))
    : 0;

  const card = await buildLoveCard({
    a: { name: displayName(targetUser), avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 }) },
    b: { name: displayName(partner), avatarUrl: partner.displayAvatarURL({ extension: 'png', size: 256 }) },
    days: daysTogether,
    compatibility: mood,
    tiles: [
      { label: 'Уровень', value: `ур. ${level.level}` },
      { label: 'Серия', value: `${relationship.streak || 0} дн.` },
      { label: 'Настроение', value: moodLabel(mood) }
    ]
  });

  const components = mediaPanel({
    title: relationship.title || 'Любовный профиль',
    icon: ICONS.love,
    eyebrow: 'Отношения Onix',
    description: `${mentionUser(targetUser.id)} 💞 ${mentionUser(partner.id)}`,
    color: COLORS.love,
    imageUrl: card?.imageUrl,
    lines: [
      `${ICONS.level} **Уровень пары** — ур. ${level.level} • ${progressBar(level.progress, level.needed)} ${level.progress}/${level.needed} XP`,
      `💗 **Настроение** — ${mood}/100 • ${moodLabel(mood)}`,
      `${ICONS.fire} **Серия заботы** — ${relationship.streak || 0} дн.`,
      `${ICONS.time} **Вместе с** — ${relationship.createdAt ? formatDateTime(relationship.createdAt) : 'неизвестно'}`
    ].concat(actions.length
      ? actions.map((item) => `**${item.label}:** +${item.xp} XP, ${item.mood >= 0 ? '+' : ''}${item.mood} настроение • ${timeAgo(item.createdAt)}`)
      : ['История действий пока пустая.'])
  });

  return { components, files: card?.files };
}

function proposalPanel(proposal) {
  return panel({
    title: 'Предложение отношений',
    icon: ICONS.love,
    eyebrow: 'Отношения Onix',
    description: `${mentionUser(proposal.proposerId)} предлагает ${mentionUser(proposal.targetId)} стать парой.`,
    color: COLORS.love,
    lines: proposal.message ? [`**Сообщение:** ${proposal.message}`] : ['У предложения нет дополнительного сообщения.'],
    footer: 'Принять может только выбранный пользователь. Заявка живет 10 минут.',
    actions: [
      button(`love:accept:${proposal.id}`, 'Принять', ButtonStyle.Success),
      button(`love:decline:${proposal.id}`, 'Отклонить', ButtonStyle.Danger)
    ]
  });
}

function ensureRelationship(interaction, context) {
  const relationship = context.store.relationshipForUser(interaction.guildId, interaction.user.id);
  if (!relationship) throw new Error('NO_RELATIONSHIP');
  return relationship;
}

function otherPartnerId(relationship, userId) {
  return relationship.users.find((id) => id !== userId);
}

async function performLoveAction(interaction, context, action, type) {
  if (!action) {
    return reply(interaction, errorPanel('Такое действие не найдено.'), { ephemeral: true });
  }

  let relationship;
  try {
    relationship = ensureRelationship(interaction, context);
  } catch (error) {
    if (error.message === 'NO_RELATIONSHIP') {
      return reply(interaction, errorPanel('Сначала нужно создать пару через `/love предложить`.'), { ephemeral: true });
    }
    throw error;
  }

  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  if (relationship.lastActionAt && Date.now() - relationship.lastActionAt < ACTION_COOLDOWN_MS) {
    return reply(
      interaction,
      errorPanel(`Следующее действие можно сделать через **${formatDuration(ACTION_COOLDOWN_MS - (Date.now() - relationship.lastActionAt))}**.`),
      { ephemeral: true }
    );
  }

  if (profile.balance < action.cost) {
    return reply(interaction, errorPanel(`Нужно **${formatCoins(action.cost)}**, на балансе **${formatCoins(profile.balance)}**.`), { ephemeral: true });
  }

  if (action.cost > 0) {
    profile.balance -= action.cost;
    context.store.recordTransaction(interaction.guildId, {
      type: 'love',
      fromId: interaction.user.id,
      amount: action.cost,
      note: `love ${type}`
    });
  }

  const updated = context.store.addLoveAction(interaction.guildId, interaction.user.id, {
    type,
    label: action.label,
    xp: action.xp,
    mood: action.mood
  });
  const partnerId = otherPartnerId(updated, interaction.user.id);
  await context.store.save();

  return reply(
    interaction,
    panel({
      title: `Отношения: ${action.label}`,
      icon: ICONS.love,
      eyebrow: 'Отношения Onix',
      description: `${mentionUser(interaction.user.id)} сделал действие для ${mentionUser(partnerId)}.`,
      color: COLORS.love,
      thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
      stats: [
        { icon: '💗', name: 'Настроение', value: `${moodNow(updated)}/100 • ${moodLabel(moodNow(updated))}` },
        { icon: ICONS.xp, name: 'XP пары', value: String(updated.xp || 0) },
        { icon: ICONS.fire, name: 'Серия', value: `${updated.streak || 0} дн.` },
        { icon: ICONS.coins, name: 'Стоимость', value: formatCoins(action.cost) }
      ],
      statColumns: 2
    })
  );
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('love')
      .setDescription('Отношения: пары, действия, подарки и профиль')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('профиль')
          .setDescription('Показать любовный профиль')
          .addUserOption((option) => option.setName('пользователь').setDescription('Пользователь'))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('предложить')
          .setDescription('Предложить пользователю стать парой')
          .addUserOption((option) => option.setName('пользователь').setDescription('Кому предложить').setRequired(true))
          .addStringOption((option) => option.setName('сообщение').setDescription('Короткое сообщение').setMaxLength(160))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('действие')
          .setDescription('Сделать действие для пары')
          .addStringOption((option) =>
            option
              .setName('тип')
              .setDescription('Действие')
              .addChoices(...Object.entries(LOVE_ACTIONS).map(([value, item]) => ({ name: item.label, value })))
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('подарок')
          .setDescription('Подарить предмет паре')
          .addStringOption((option) =>
            option
              .setName('тип')
              .setDescription('Подарок')
              .addChoices(...Object.entries(LOVE_GIFTS).map(([value, item]) => ({ name: `${item.label} (${item.cost} мон.)`, value })))
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('статус')
          .setDescription('Изменить название любовного профиля')
          .addStringOption((option) => option.setName('название').setDescription('Название пары').setMinLength(2).setMaxLength(40).setRequired(true))
      )
      .addSubcommand((subcommand) => subcommand.setName('расстаться').setDescription('Завершить отношения')),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
      context.store.ensureUser(interaction.guildId, interaction.user);

      if (subcommand === 'профиль') {
        const target = interaction.options.getUser('пользователь') || interaction.user;
        context.store.ensureUser(interaction.guildId, target);
        await context.store.save();
        {
          const { components, files } = await relationshipPanel(interaction, context, target);
          return reply(interaction, components, { files });
        }
      }

      if (subcommand === 'предложить') {
        const target = interaction.options.getUser('пользователь', true);
        if (target.bot) return reply(interaction, errorPanel('Боту лучше не предлагать отношения.'), { ephemeral: true });
        if (target.id === interaction.user.id) return reply(interaction, errorPanel('С самим собой отношения не оформить.'), { ephemeral: true });

        const proposerProfile = context.store.ensureUser(interaction.guildId, interaction.user);
        const targetProfile = context.store.ensureUser(interaction.guildId, target);
        if (proposerProfile.lovePartnerId) return reply(interaction, errorPanel('У тебя уже есть пара.'), { ephemeral: true });
        if (targetProfile.lovePartnerId) return reply(interaction, errorPanel('У этого пользователя уже есть пара.'), { ephemeral: true });

        const proposal = context.store.createLoveProposal(interaction.guildId, {
          id: interaction.id,
          proposerId: interaction.user.id,
          targetId: target.id,
          message: interaction.options.getString('сообщение') || ''
        });
        await context.store.save();
        return reply(interaction, proposalPanel(proposal));
      }

      if (subcommand === 'действие') {
        const type = interaction.options.getString('тип', true);
        return performLoveAction(interaction, context, LOVE_ACTIONS[type], type);
      }

      if (subcommand === 'подарок') {
        const type = interaction.options.getString('тип', true);
        return performLoveAction(interaction, context, LOVE_GIFTS[type], type);
      }

      if (subcommand === 'статус') {
        const title = interaction.options.getString('название', true);
        const profile = context.store.ensureUser(interaction.guildId, interaction.user);
        const cost = 300;
        if (!context.store.relationshipForUser(interaction.guildId, interaction.user.id)) {
          return reply(interaction, errorPanel('Сначала нужно создать пару через `/love предложить`.'), { ephemeral: true });
        }
        if (profile.balance < cost) {
          return reply(interaction, errorPanel(`Изменение названия стоит **${formatCoins(cost)}**.`), { ephemeral: true });
        }
        profile.balance -= cost;
        const relationship = context.store.updateRelationshipTitle(interaction.guildId, interaction.user.id, title);
        context.store.recordTransaction(interaction.guildId, {
          type: 'love',
          fromId: interaction.user.id,
          amount: cost,
          note: 'love title'
        });
        await context.store.save();
        return reply(interaction, panel({
          title: 'Название пары обновлено',
          icon: ICONS.success,
          eyebrow: 'Отношения Onix',
          description: `Теперь любовный профиль называется **${relationship.title}**.`,
          color: COLORS.success,
          footer: `Списано: ${formatCoins(cost)}`
        }));
      }

      if (!context.store.relationshipForUser(interaction.guildId, interaction.user.id)) {
        return reply(interaction, errorPanel('У тебя сейчас нет пары.'), { ephemeral: true });
      }

      return reply(
        interaction,
        panel({
          title: 'Расстаться',
          icon: '💔',
          eyebrow: 'Отношения Onix',
          description: `${mentionUser(interaction.user.id)}, подтвердите завершение отношений.`,
          color: COLORS.danger,
          footer: 'Это действие сбросит текущую пару и серию заботы.',
          actions: [
            button(`love:break:${interaction.user.id}`, 'Подтвердить', ButtonStyle.Danger),
            button(`love:cancel:${interaction.user.id}`, 'Назад', ButtonStyle.Secondary)
          ]
        }),
        { ephemeral: true }
      );
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('love:')) return false;

  const [, action, id] = interaction.customId.split(':');
  if (action === 'cancel') {
    if (interaction.user.id !== id) {
      await reply(interaction, errorPanel('Это меню открыто для другого пользователя.'), { ephemeral: true });
      return true;
    }
    {
      const { components, files } = await relationshipPanel(interaction, context, interaction.user);
      await update(interaction, components, { files });
    }
    return true;
  }

  if (action === 'break') {
    if (interaction.user.id !== id) {
      await reply(interaction, errorPanel('Подтвердить расставание может только владелец меню.'), { ephemeral: true });
      return true;
    }
    const relationship = context.store.endRelationship(interaction.guildId, interaction.user.id);
    if (!relationship) {
      await update(interaction, errorPanel('Отношения уже завершены.'));
      return true;
    }
    await context.store.save();
    await update(interaction, panel({
      title: 'Отношения завершены',
      icon: '💔',
      eyebrow: 'Отношения Onix',
      description: 'Пара была расформирована. Любовный профиль можно создать заново позже.',
      color: COLORS.danger
    }));
    return true;
  }

  const proposal = context.store.getLoveProposal(interaction.guildId, id);
  if (!proposal) {
    await reply(interaction, errorPanel('Эта заявка уже недоступна.'), { ephemeral: true });
    return true;
  }

  if (Date.now() - proposal.createdAt > 10 * 60 * 1000) {
    context.store.closeLoveProposal(interaction.guildId, id, 'expired');
    await context.store.save();
    await update(interaction, errorPanel('Время предложения истекло.'));
    return true;
  }

  if (interaction.user.id !== proposal.targetId) {
    await reply(interaction, errorPanel('Ответить на предложение может только выбранный пользователь.'), { ephemeral: true });
    return true;
  }

  if (action === 'decline') {
    context.store.closeLoveProposal(interaction.guildId, id, 'declined');
    await context.store.save();
    await update(interaction, panel({
      title: 'Предложение отклонено',
      icon: ICONS.warning,
      eyebrow: 'Отношения Onix',
      description: `${mentionUser(proposal.targetId)} отклонил предложение отношений.`,
      color: COLORS.warning
    }));
    return true;
  }

  const proposer = await fetchUser(interaction.client, proposal.proposerId);
  const target = await fetchUser(interaction.client, proposal.targetId);
  try {
    context.store.createRelationship(interaction.guildId, proposer, target);
  } catch (error) {
    context.store.closeLoveProposal(interaction.guildId, id, 'failed');
    await context.store.save();
    await update(interaction, errorPanel('Не удалось создать пару: один из пользователей уже в отношениях.'));
    return true;
  }

  context.store.closeLoveProposal(interaction.guildId, id, 'accepted');
  await context.store.save();
  await update(interaction, panel({
    title: 'Пара создана',
    icon: ICONS.love,
    eyebrow: 'Отношения Onix',
    description: `${mentionUser(proposal.proposerId)} 💞 ${mentionUser(proposal.targetId)} теперь вместе.`,
    color: COLORS.love,
    fields: [
      { name: `${ICONS.level} Старт`, value: 'ур. 1 • настроение 70/100' },
      { name: `${ICONS.info} Что дальше`, value: 'Используйте `/love действие`, `/love подарок` и `/love профиль`.' }
    ]
  }));
  return true;
}

module.exports = {
  commands,
  handleComponent
};
