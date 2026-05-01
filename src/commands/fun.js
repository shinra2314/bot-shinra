const { SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  ButtonStyle,
  button,
  errorPanel,
  panel,
  reply,
  successPanel,
  update
} = require('../ui/components');
const { formatCoins, mentionUser } = require('../utils/format');

const REACTIONS = [
  { name: 'Обнять', value: 'hug', text: 'обнял' },
  { name: 'Поцеловать', value: 'kiss', text: 'поцеловал' },
  { name: 'Похвалить', value: 'praise', text: 'похвалил' },
  { name: 'Подмигнуть', value: 'wink', text: 'подмигнул' },
  { name: 'Удивиться', value: 'wow', text: 'удивился рядом с' }
];

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function duelPanel(duel) {
  return panel({
    title: '⚔️ Дуэль на монеты',
    description: `${mentionUser(duel.challengerId)} вызвал ${mentionUser(duel.targetId)} на дуэль за 🪙 **${formatCoins(duel.amount)}**.`,
    color: COLORS.warning,
    footer: '⏱️ У цели есть 5 минут, чтобы принять вызов.',
    actions: [
      button(`duel:accept:${duel.id}`, 'Принять', ButtonStyle.Success),
      button(`duel:decline:${duel.id}`, 'Отклонить', ButtonStyle.Danger)
    ]
  });
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

        return reply(
          interaction,
          panel({
            title: win ? '🌟 Монетка: победа!' : '💨 Монетка: проигрыш',
            description: `Ты выбрал **${guess === 'heads' ? 'Орел' : 'Решка'}**, выпало **${result === 'heads' ? 'Орел' : 'Решка'}**.`,
            color: win ? COLORS.success : COLORS.danger,
            fields: [
              { name: 'Ставка', value: formatCoins(amount) },
              { name: 'Баланс', value: formatCoins(profile.balance) }
            ]
          })
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
            title: win ? '🌟 Угадал!' : '💨 Не угадал',
            description: `Ты выбрал **${guess === 'heads' ? 'Орел' : 'Решка'}**, выпало **${side}**.`,
            color: win ? COLORS.success : COLORS.warning
          })
        );
      }

      return reply(
        interaction,
        panel({
          title: '🪙 Монетка',
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
      .addUserOption((option) => option.setName('user').setDescription('Соперник').setRequired(true))
      .addIntegerOption((option) =>
        option.setName('amount').setDescription('Ставка').setMinValue(1).setMaxValue(1000000).setRequired(true)
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
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
        createdAt: Date.now()
      };
      context.state.duels.set(duel.id, duel);
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
          title: '💌 Реакция',
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
          title: '❄️ Снежок!',
          description: `${mentionUser(interaction.user.id)} бросил снежок в ${mentionUser(target.id)}! 🎯`,
          color: COLORS.info,
          footer: `❄️ Осталось: ${profile.snowballs}`
        })
      );
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('duel:')) return false;

  const [, action, duelId] = interaction.customId.split(':');
  const duel = context.state.duels.get(duelId);
  if (!duel) {
    await reply(interaction, errorPanel('Эта дуэль уже недоступна.'), { ephemeral: true });
    return true;
  }

  if (Date.now() - duel.createdAt > 5 * 60 * 1000) {
    context.state.duels.delete(duelId);
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
    await update(
      interaction,
      panel({
        title: '⚔️ Дуэль отменена',
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

  const challengerMember = await interaction.guild.members.fetch(duel.challengerId).catch(() => null);
  const targetMember = await interaction.guild.members.fetch(duel.targetId).catch(() => null);
  if (!challengerMember || !targetMember) {
    context.state.duels.delete(duelId);
    await update(interaction, errorPanel('Один из участников дуэли не найден.'));
    return true;
  }

  const challenger = context.store.ensureUser(duel.guildId, challengerMember.user);
  const target = context.store.ensureUser(duel.guildId, targetMember.user);
  if (challenger.balance < duel.amount || target.balance < duel.amount) {
    context.state.duels.delete(duelId);
    await update(interaction, errorPanel('У одного из участников уже не хватает монет.'));
    return true;
  }

  const challengerWins = Math.random() < 0.5;
  const winner = challengerWins ? challengerMember.user : targetMember.user;
  const loser = challengerWins ? targetMember.user : challengerMember.user;
  context.store.transfer(duel.guildId, loser, winner, duel.amount, 'duel');
  context.store.addClanWarScore(duel.guildId, winner.id, 20, 'duel');
  context.store.progressClanQuest(duel.guildId, winner.id, 'duel_3', 1);
  context.state.duels.delete(duelId);
  await context.store.save();

  await update(
    interaction,
    successPanel(
      `🏆 ${mentionUser(winner.id)} победил и забрал 🪙 **${formatCoins(duel.amount)}** у ${mentionUser(loser.id)}.`,
      '⚔️ Дуэль завершена'
    )
  );
  return true;
}

module.exports = {
  commands,
  handleComponent
};
