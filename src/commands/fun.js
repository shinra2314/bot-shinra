const { SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  ICONS,
  ButtonStyle,
  button,
  errorPanel,
  mediaPanel,
  panel,
  reply,
  update
} = require('../ui/components');
const { formatCoins, mentionUser } = require('../utils/format');
const { buildResultCard } = require('../services/profileCard');

const REACTIONS = [
  { name: 'Обнять', value: 'hug', text: 'обнял' },
  { name: 'Поцеловать', value: 'kiss', text: 'поцеловал' },
  { name: 'Похвалить', value: 'praise', text: 'похвалил' },
  { name: 'Подмигнуть', value: 'wink', text: 'подмигнул' },
  { name: 'Удивиться', value: 'wow', text: 'удивился рядом с' }
];

const DUEL_MODES = {
  classic: {
    name: 'Классика',
    description: 'один честный бросок 1-100',
    warPoints: 20,
    reputation: 1
  },
  best_of_3: {
    name: 'До двух побед',
    description: 'три коротких раунда, побеждает счет 2:0 или 2:1',
    warPoints: 25,
    reputation: 1
  },
  risk: {
    name: 'Риск',
    description: 'один бросок, критический результат дает больше очков войны и репутации',
    warPoints: 35,
    reputation: 2
  }
};

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function duelMode(value) {
  return DUEL_MODES[value] ? value : 'classic';
}

function duelPanel(duel) {
  const mode = DUEL_MODES[duelMode(duel.mode)];
  return panel({
    title: 'Дуэль на монеты',
    icon: '⚔️',
    eyebrow: 'Развлечения Onix',
    description: `${mentionUser(duel.challengerId)} вызвал ${mentionUser(duel.targetId)} на дуэль за **${formatCoins(duel.amount)}**.`,
    color: COLORS.warning,
    stats: [
      { icon: ICONS.casino, name: 'Режим', value: mode.name },
      { icon: ICONS.info, name: 'Механика', value: mode.description }
    ],
    footer: 'У цели есть 5 минут, чтобы принять вызов.',
    actions: [
      button(`duel:accept:${duel.id}`, 'Принять', ButtonStyle.Success),
      button(`duel:decline:${duel.id}`, 'Отклонить', ButtonStyle.Danger)
    ]
  });
}

async function fetchUserOrStub(client, userId) {
  return client.users.fetch(userId).catch(() => ({
    id: userId,
    username: userId,
    globalName: null,
    bot: false
  }));
}

function roll() {
  return Math.floor(Math.random() * 100) + 1;
}

function resolveDuel(duel) {
  const mode = duelMode(duel.mode);
  const rounds = [];
  let challengerScore = 0;
  let targetScore = 0;

  const playRound = () => {
    let challengerRoll = roll();
    let targetRoll = roll();
    while (challengerRoll === targetRoll) {
      challengerRoll = roll();
      targetRoll = roll();
    }

    const challengerWon = challengerRoll > targetRoll;
    if (challengerWon) challengerScore += 1;
    else targetScore += 1;
    rounds.push({
      challengerRoll,
      targetRoll,
      winnerId: challengerWon ? duel.challengerId : duel.targetId
    });
  };

  if (mode === 'best_of_3') {
    while (challengerScore < 2 && targetScore < 2) playRound();
  } else {
    playRound();
  }

  const winnerId = challengerScore > targetScore ? duel.challengerId : duel.targetId;
  const critical = mode === 'risk' && Math.max(rounds[0].challengerRoll, rounds[0].targetRoll) >= 90;
  const config = DUEL_MODES[mode];

  return {
    mode,
    winnerId,
    loserId: winnerId === duel.challengerId ? duel.targetId : duel.challengerId,
    rounds,
    score: `${challengerScore}:${targetScore}`,
    warPoints: critical ? config.warPoints + 15 : config.warPoints,
    reputation: critical ? config.reputation + 1 : config.reputation,
    critical
  };
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('coinflip')
      .setDescription('Подбросить монетку')
      .addStringOption((option) =>
        option
          .setName('side')
          .setDescription('Твоя сторона')
          .addChoices(
            { name: 'Орел', value: 'heads' },
            { name: 'Решка', value: 'tails' }
          )
      )
      .addIntegerOption((option) =>
        option
          .setName('amount')
          .setDescription('Ставка монет')
          .setMinValue(1)
          .setMaxValue(1000000)
      ),
    async execute(interaction, context) {
      const amount = interaction.options.getInteger('amount') || 0;
      if (amount > 0) {
        const guildError = requireGuild(interaction);
        if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

        const profile = context.store.ensureUser(interaction.guildId, interaction.user);
        if (profile.balance < amount) {
          return reply(interaction, errorPanel('У тебя не хватает монет на такую ставку.'), { ephemeral: true });
        }

        const guess = interaction.options.getString('side') || (Math.random() < 0.5 ? 'heads' : 'tails');
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const win = guess === result;
        profile.balance += win ? amount : -amount;
        context.store.recordTransaction(interaction.guildId, {
          type: 'coinflip',
          [win ? 'toId' : 'fromId']: interaction.user.id,
          amount,
          note: win ? 'coinflip win' : 'coinflip lose'
        });
        await context.store.save();

        const card = await buildResultCard({
          user: interaction.user,
          outcome: win ? 'win' : 'lose',
          title: win ? 'ОРЕЛ И РЕШКА' : 'ОРЕЛ И РЕШКА',
          delta: win ? `+${amount.toLocaleString('ru-RU')}` : `-${amount.toLocaleString('ru-RU')}`,
          lines: [
            `Выбор: ${guess === 'heads' ? 'Орел' : 'Решка'}`,
            `Выпало: ${result === 'heads' ? 'Орел' : 'Решка'}`,
            `Баланс: ${Number(profile.balance).toLocaleString('ru-RU')}`
          ]
        });

        return reply(
          interaction,
          mediaPanel({
            title: win ? 'Монетка: победа' : 'Монетка: проигрыш',
            icon: win ? ICONS.up : ICONS.down,
            eyebrow: 'Монетка',
            description: `Ты выбрал **${guess === 'heads' ? 'Орел' : 'Решка'}**, выпало **${result === 'heads' ? 'Орел' : 'Решка'}**.`,
            color: win ? COLORS.success : COLORS.danger,
            imageUrl: card?.imageUrl,
            stats: [
              { icon: ICONS.coins, name: 'Ставка', value: formatCoins(amount) },
              { icon: ICONS.economy, name: 'Баланс', value: formatCoins(profile.balance) }
            ],
            statColumns: 2
          }),
          { files: card?.files }
        );
      }

      const guess = interaction.options.getString('side');
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      const side = result === 'heads' ? 'Орел' : 'Решка';

      if (guess) {
        const win = guess === result;
        return reply(
          interaction,
          panel({
            title: win ? 'Монетка: угадал' : 'Монетка: не угадал',
            icon: win ? ICONS.success : ICONS.warning,
            eyebrow: 'Монетка',
            description: `Ты выбрал **${guess === 'heads' ? 'Орел' : 'Решка'}**, выпало **${side}**.`,
            color: win ? COLORS.success : COLORS.warning
          })
        );
      }

      return reply(
        interaction,
        panel({
          title: 'Монетка',
          icon: '🪙',
          eyebrow: 'Развлечения Onix',
          description: `Выпало: **${side}**.`,
          color: COLORS.warning
        })
      );
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('duel')
      .setDescription('Бросить вызов на монеты')
      .addUserOption((option) => option.setName('соперник').setDescription('Соперник').setRequired(true))
      .addIntegerOption((option) =>
        option.setName('ставка').setDescription('Ставка').setMinValue(1).setMaxValue(1000000).setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('режим')
          .setDescription('Формат дуэли')
          .addChoices(
            { name: 'Классика', value: 'classic' },
            { name: 'До двух побед', value: 'best_of_3' },
            { name: 'Риск', value: 'risk' }
          )
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const target = interaction.options.getUser('соперник') || interaction.options.getUser('user');
      const amount = interaction.options.getInteger('ставка') || interaction.options.getInteger('amount');
      const mode = duelMode(interaction.options.getString('режим'));
      if (!target || !amount) {
        return reply(interaction, errorPanel('Укажи соперника и ставку.'), { ephemeral: true });
      }
      if (target.bot) return reply(interaction, errorPanel('С ботом дуэль не получится.'), { ephemeral: true });
      if (target.id === interaction.user.id) return reply(interaction, errorPanel('Нельзя вызвать самого себя.'), { ephemeral: true });

      const challenger = context.store.ensureUser(interaction.guildId, interaction.user);
      const opponent = context.store.ensureUser(interaction.guildId, target);
      if (challenger.balance < amount) return reply(interaction, errorPanel('У тебя не хватает монет.'), { ephemeral: true });
      if (opponent.balance < amount) return reply(interaction, errorPanel('У соперника не хватает монет.'), { ephemeral: true });

      const duel = {
        id: interaction.id,
        guildId: interaction.guildId,
        challengerId: interaction.user.id,
        targetId: target.id,
        amount,
        mode,
        createdAt: Date.now()
      };
      context.state.duels.set(duel.id, duel);
      context.store.addDuel(interaction.guildId, duel);
      await context.store.save();

      return reply(interaction, duelPanel(duel));
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('reaction')
      .setDescription('Отправить реакцию в чат')
      .addStringOption((option) =>
        option
          .setName('type')
          .setDescription('Реакция')
          .addChoices(...REACTIONS.map((item) => ({ name: item.name, value: item.value })))
          .setRequired(true)
      )
      .addUserOption((option) => option.setName('user').setDescription('Кому отправить')),
    async execute(interaction) {
      const type = interaction.options.getString('type', true);
      const reaction = REACTIONS.find((item) => item.value === type);
      const target = interaction.options.getUser('user');
      const line = target
        ? `${mentionUser(interaction.user.id)} ${reaction.text} ${mentionUser(target.id)}.`
        : `${mentionUser(interaction.user.id)} отправил реакцию: **${reaction.name}**.`;

      return reply(
        interaction,
        panel({
          title: 'Реакция',
          icon: '💬',
          eyebrow: 'Развлечения Onix',
          description: line,
          color: COLORS.games,
          footer: target ? 'Реакция отправлена без пинга.' : 'Можно указать пользователя вторым аргументом.'
        })
      );
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('snowball')
      .setDescription('Бросить снежок')
      .addUserOption((option) => option.setName('user').setDescription('Цель').setRequired(true)),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const target = interaction.options.getUser('user', true);
      if (target.id === interaction.user.id) {
        return reply(interaction, errorPanel('Снежок в себя? Холодный план.'), { ephemeral: true });
      }
      const profile = context.store.ensureUser(interaction.guildId, interaction.user);
      if (Number(profile.snowballs || 0) <= 0) {
        return reply(interaction, errorPanel('У тебя нет снежков. Забери их через `/timely`.'), { ephemeral: true });
      }
      profile.snowballs -= 1;
      await context.store.save();

      return reply(
        interaction,
        panel({
          title: 'Снежок',
          icon: ICONS.snow,
          eyebrow: 'Развлечения Onix',
          description: `${mentionUser(interaction.user.id)} бросил снежок в ${mentionUser(target.id)}.`,
          color: COLORS.info,
          footer: `Осталось снежков: ${profile.snowballs}`
        })
      );
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('duel:')) return false;

  const [, action, duelId] = interaction.customId.split(':');
  const guildId = interaction.guildId || interaction.message?.guildId;
  const duel = context.state.duels.get(duelId) || context.store.getDuel(guildId, duelId);
  if (!duel) {
    await reply(interaction, errorPanel('Эта дуэль уже недоступна.'), { ephemeral: true });
    return true;
  }

  if (Date.now() - duel.createdAt > 5 * 60 * 1000) {
    context.state.duels.delete(duelId);
    context.store.closeDuel(duel.guildId, duelId, 'expired');
    await context.store.save();
    await update(interaction, errorPanel('Время на принятие дуэли истекло.'));
    return true;
  }

  if (interaction.user.id !== duel.targetId && interaction.user.id !== duel.challengerId) {
    await reply(interaction, errorPanel('Эта дуэль не для тебя.'), { ephemeral: true });
    return true;
  }

  if (action === 'decline') {
    if (interaction.user.id !== duel.targetId && interaction.user.id !== duel.challengerId) {
      await reply(interaction, errorPanel('Отклонить дуэль может только один из участников.'), { ephemeral: true });
      return true;
    }

    context.state.duels.delete(duelId);
    context.store.closeDuel(duel.guildId, duelId, 'declined');
    await context.store.save();
    await update(
      interaction,
      panel({
        title: 'Дуэль отменена',
        icon: ICONS.warning,
        eyebrow: 'Развлечения Onix',
        description: `${mentionUser(interaction.user.id)} отменил дуэль на **${formatCoins(duel.amount)}**.`,
        color: COLORS.warning
      })
    );
    return true;
  }

  if (interaction.user.id !== duel.targetId) {
    await reply(interaction, errorPanel('Принять дуэль может только вызванный пользователь.'), { ephemeral: true });
    return true;
  }

  const challengerUser = await fetchUserOrStub(interaction.client, duel.challengerId);
  const targetUser = await fetchUserOrStub(interaction.client, duel.targetId);
  if (!challengerUser || !targetUser) {
    context.state.duels.delete(duelId);
    context.store.closeDuel(duel.guildId, duelId, 'missing_user');
    await context.store.save();
    await update(interaction, errorPanel('Один из участников дуэли не найден.'));
    return true;
  }

  const challenger = context.store.ensureUser(duel.guildId, challengerUser);
  const target = context.store.ensureUser(duel.guildId, targetUser);
  if (challenger.balance < duel.amount || target.balance < duel.amount) {
    context.state.duels.delete(duelId);
    context.store.closeDuel(duel.guildId, duelId, 'insufficient_funds');
    await context.store.save();
    await update(interaction, errorPanel('У одного из участников уже не хватает монет.'));
    return true;
  }

  const result = resolveDuel(duel);
  const winner = result.winnerId === challengerUser.id ? challengerUser : targetUser;
  const loser = result.loserId === challengerUser.id ? challengerUser : targetUser;
  context.store.transfer(duel.guildId, loser, winner, duel.amount, 'duel');
  context.store.addClanWarScore(duel.guildId, winner.id, result.warPoints, 'duel');
  context.store.progressClanQuest(duel.guildId, winner.id, 'duel_3', 1);
  const winnerProfile = context.store.ensureUser(duel.guildId, winner);
  winnerProfile.reputation = Number(winnerProfile.reputation || 0) + result.reputation;
  context.state.duels.delete(duelId);
  context.store.closeDuel(duel.guildId, duelId, 'accepted');
  await context.store.save();

  await update(
    interaction,
    panel({
      title: 'Дуэль завершена',
      icon: ICONS.tops,
      eyebrow: 'Развлечения Onix',
      description: `${mentionUser(winner.id)} победил и забрал **${formatCoins(duel.amount)}** у ${mentionUser(loser.id)}.`,
      color: COLORS.success,
      fields: [
        { name: `${ICONS.casino} Режим`, value: DUEL_MODES[result.mode].name },
        { name: `${ICONS.fire} Счет`, value: result.score },
        {
          name: '🎲 Раунды',
          value: result.rounds
            .map((round, index) => `${index + 1}. ${round.challengerRoll} : ${round.targetRoll} — ${mentionUser(round.winnerId)}`)
            .join('\n')
        },
        { name: `${ICONS.star} Награда профиля`, value: `+${result.reputation} репутации${result.critical ? ' • критический бросок' : ''}` },
        { name: '⚔️ Очки войны', value: `+${result.warPoints}, если клан участвует в войне` }
      ]
    })
  );
  return true;
}

module.exports = {
  commands,
  handleComponent
};
