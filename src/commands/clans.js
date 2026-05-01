const { SlashCommandBuilder } = require('discord.js');
const { COLORS, errorPanel, panel, reply, successPanel } = require('../ui/components');
const { formatCoins, formatDuration, formatMinutes, mentionUser } = require('../utils/format');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function clanOnline(store, guildId, voiceTracker, clan) {
  return (clan.members || []).reduce((sum, userId) => {
    const user = store.getUser(guildId, userId);
    return sum + Number(user?.voiceMinutes || 0) + voiceTracker.currentMinutes(guildId, userId);
  }, 0);
}

function resolveClan(interaction, context) {
  const name = interaction.options.getString('name');
  if (name) return context.store.findClan(interaction.guildId, name);
  return context.store.userClan(interaction.guildId, interaction.user.id);
}

function ensureOwner(interaction, clan) {
  return clan.ownerId === interaction.user.id;
}

function clanLevelCost(clan) {
  return clan.level * 2500;
}

function clanProfilePanel(context, guildId, clan) {
  context.store.ensureClanShape(clan);
  const owner = clan.ownerId ? mentionUser(clan.ownerId) : 'не указан';
  const previewMembers = (clan.members || []).slice(0, 8).map(mentionUser).join(', ') || 'нет участников';
  const activeWar = context.store.activeWarForClan(guildId, clan.id);

  return panel({
    title: `🏰 ${clan.name}`,
    description: clan.description || 'Описание не указано.',
    color: COLORS.clans,
    fields: [
      { name: '👑 Владелец', value: owner },
      { name: '⭐ Уровень', value: `${clan.level} (${clan.xp} XP)` },
      { name: '🏦 Банк', value: formatCoins(clan.bank) },
      { name: '🏅 Рейтинг', value: `${clan.rating || 0} рейтинга • ${clan.seasonPoints || 0} сезонных очков` },
      { name: '👥 Участники', value: `${clan.members?.length || 0}\n${previewMembers}` },
      { name: '⚔️ Война', value: activeWar ? `активна до <t:${Math.floor(activeWar.endsAt / 1000)}:R>` : 'нет активной войны' }
    ]
  });
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('clan')
      .setDescription('Кланы')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('профиль')
          .setDescription('Профиль клана')
          .addStringOption((option) => option.setName('name').setDescription('Название клана'))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('создать')
          .setDescription('Создать клан')
          .addStringOption((option) =>
            option.setName('name').setDescription('Название клана').setMinLength(2).setMaxLength(32).setRequired(true)
          )
          .addStringOption((option) =>
            option.setName('description').setDescription('Описание клана').setMaxLength(180)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('вступить')
          .setDescription('Вступить в клан')
          .addStringOption((option) => option.setName('name').setDescription('Название клана').setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('онлайн')
          .setDescription('Голосовой онлайн клана')
          .addStringOption((option) => option.setName('name').setDescription('Название клана'))
      )
      .addSubcommand((subcommand) => subcommand.setName('выйти').setDescription('Покинуть клан'))
      .addSubcommand((subcommand) => subcommand.setName('банк').setDescription('Показать банк клана'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('донат')
          .setDescription('Пожертвовать монеты в банк клана')
          .addIntegerOption((option) =>
            option.setName('сумма').setDescription('Сумма доната').setMinValue(1).setMaxValue(1000000).setRequired(true)
          )
      )
      .addSubcommand((subcommand) => subcommand.setName('задания').setDescription('Показать клановые задания'))
      .addSubcommand((subcommand) => subcommand.setName('магазин').setDescription('Клановый магазин'))
      .addSubcommand((subcommand) => subcommand.setName('улучшить').setDescription('Улучшить уровень клана'))
      .addSubcommand((subcommand) => subcommand.setName('рейтинг').setDescription('Клановый рейтинг'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('война')
          .setDescription('Клановые войны')
          .addStringOption((option) =>
            option
              .setName('действие')
              .setDescription('Действие')
              .addChoices(
                { name: 'начать', value: 'start' },
                { name: 'статус', value: 'status' },
                { name: 'завершить', value: 'finish' }
              )
              .setRequired(true)
          )
          .addStringOption((option) => option.setName('клан').setDescription('Клан соперника'))
      ),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      context.store.ensureUser(interaction.guildId, interaction.user);
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'создать') {
        const profile = context.store.ensureUser(interaction.guildId, interaction.user);
        if (profile.clanId) {
          return reply(interaction, errorPanel('Ты уже состоишь в клане. Сначала используй `/clan выйти`.'), { ephemeral: true });
        }

        const name = interaction.options.getString('name', true).trim();
        const description = interaction.options.getString('description') || 'Описание не указано.';
        if (context.store.findClan(interaction.guildId, name)) {
          return reply(interaction, errorPanel('Клан с таким названием уже существует.'), { ephemeral: true });
        }

        const clan = context.store.createClan(interaction.guildId, {
          id: `${Date.now().toString(36)}-${interaction.user.id}`,
          name,
          description,
          ownerId: interaction.user.id
        });
        profile.clanId = clan.id;
        await context.store.save();
        return reply(interaction, successPanel(`Клан **${name}** создан.`, 'Клан создан'));
      }

      if (subcommand === 'вступить') {
        const profile = context.store.ensureUser(interaction.guildId, interaction.user);
        if (profile.clanId) {
          return reply(interaction, errorPanel('Ты уже состоишь в клане. Сначала используй `/clan выйти`.'), { ephemeral: true });
        }

        const clan = context.store.findClan(interaction.guildId, interaction.options.getString('name', true));
        if (!clan) return reply(interaction, errorPanel('Клан с таким названием не найден.'), { ephemeral: true });

        clan.members ||= [];
        if (!clan.members.includes(interaction.user.id)) clan.members.push(interaction.user.id);
        profile.clanId = clan.id;
        await context.store.save();
        return reply(interaction, successPanel(`Ты вступил в клан **${clan.name}**.`, 'Добро пожаловать'), { ephemeral: true });
      }

      if (subcommand === 'выйти') {
        const clan = context.store.leaveClan(interaction.guildId, interaction.user.id);
        if (!clan) return reply(interaction, errorPanel('Ты сейчас не состоишь в клане.'), { ephemeral: true });

        await context.store.save();
        return reply(interaction, successPanel(`Ты покинул клан **${clan.name}**.`, 'Клан покинут'), { ephemeral: true });
      }

      if (subcommand === 'рейтинг') {
        const rows = context.store.clans(interaction.guildId)
          .map((clan) => context.store.ensureClanShape(clan))
          .sort((a, b) => (b.seasonPoints || 0) - (a.seasonPoints || 0) || (b.rating || 0) - (a.rating || 0))
          .slice(0, 10)
          .map((clan, index) => `**${index + 1}.** ${clan.name} — ${clan.seasonPoints || 0} SP • уровень ${clan.level}`);

        return reply(interaction, panel({
          title: '🏅 Клановый рейтинг',
          description: 'Топ по сезонным очкам и рейтингу.',
          color: COLORS.clans,
          lines: rows.length ? rows : ['Кланы пока не участвуют в рейтинге.']
        }));
      }

      const clan = resolveClan(interaction, context);
      if (!clan) {
        return reply(interaction, errorPanel('Клан не найден. Укажи название или вступи в клан.'), { ephemeral: true });
      }
      context.store.ensureClanShape(clan);

      if (subcommand === 'банк') {
        return reply(interaction, panel({
          title: `🏦 Банк клана — ${clan.name}`,
          description: `🪙 В банке: **${formatCoins(clan.bank)}**`,
          color: COLORS.clans,
          fields: [
            { name: '⭐ Уровень', value: String(clan.level) },
            { name: '💸 Стоимость улучшения', value: formatCoins(clanLevelCost(clan)) },
            { name: '🏅 Сезонные очки', value: String(clan.seasonPoints || 0) }
          ]
        }));
      }

      if (subcommand === 'донат') {
        const amount = interaction.options.getInteger('сумма', true);
        const profile = context.store.ensureUser(interaction.guildId, interaction.user);
        if (profile.clanId !== clan.id) return reply(interaction, errorPanel('Донатить можно только в свой клан.'), { ephemeral: true });
        if (profile.balance < amount) return reply(interaction, errorPanel('У тебя не хватает монет.'), { ephemeral: true });

        profile.balance -= amount;
        clan.bank += amount;
        clan.xp += Math.floor(amount / 5);
        context.store.progressClanQuest(interaction.guildId, interaction.user.id, 'donate_1000', amount);
        context.store.recordTransaction(interaction.guildId, {
          type: 'clan',
          fromId: interaction.user.id,
          amount,
          note: `донат в клан ${clan.name}`
        });
        await context.store.save();
        return reply(interaction, successPanel(`Ты внёс **${formatCoins(amount)}** в банк клана **${clan.name}**.`, 'Клановый донат'));
      }

      if (subcommand === 'задания') {
        return reply(interaction, panel({
          title: `📝 Задания — ${clan.name}`,
          description: 'Выполняются всей командой. Награды идут в банк и XP клана.',
          color: COLORS.clans,
          lines: clan.quests.map((quest) =>
            `**${quest.title}**\n${quest.completed ? 'выполнено' : `${quest.progress}/${quest.target}`} • награда ${formatCoins(quest.reward)}`
          )
        }));
      }

      if (subcommand === 'магазин') {
        return reply(interaction, panel({
          title: `🛍️ Магазин клана — ${clan.name}`,
          description: `🏦 Банк: **${formatCoins(clan.bank)}**`,
          color: COLORS.clans,
          lines: [
            `**Улучшение клана** — ${formatCoins(clanLevelCost(clan))}`,
            '**Клановая роль** — 5000 монет в банк',
            '**Буст рейтинга войны** — 3000 монет в банк'
          ],
          footer: 'Покупки кланового магазина используют банк клана.'
        }));
      }

      if (subcommand === 'улучшить') {
        if (!ensureOwner(interaction, clan)) return reply(interaction, errorPanel('Улучшать клан может только владелец.'), { ephemeral: true });
        const cost = clanLevelCost(clan);
        if (clan.bank < cost) return reply(interaction, errorPanel(`В банке не хватает монет. Нужно ${formatCoins(cost)}.`), { ephemeral: true });

        clan.bank -= cost;
        clan.level += 1;
        clan.rating += 10;
        await context.store.save();
        return reply(interaction, successPanel(`Клан **${clan.name}** улучшен до уровня **${clan.level}**.`, 'Уровень клана повышен'));
      }

      if (subcommand === 'война') {
        const action = interaction.options.getString('действие', true);
        const activeWar = context.store.activeWarForClan(interaction.guildId, clan.id);

        if (action === 'start') {
          if (!ensureOwner(interaction, clan)) return reply(interaction, errorPanel('Начать войну может только владелец клана.'), { ephemeral: true });
          if (activeWar) return reply(interaction, errorPanel('У клана уже есть активная война.'), { ephemeral: true });

          const enemyName = interaction.options.getString('клан');
          if (!enemyName) return reply(interaction, errorPanel('Укажи клан соперника.'), { ephemeral: true });
          const enemy = context.store.findClan(interaction.guildId, enemyName);
          if (!enemy || enemy.id === clan.id) return reply(interaction, errorPanel('Клан соперника не найден.'), { ephemeral: true });
          if (context.store.activeWarForClan(interaction.guildId, enemy.id)) return reply(interaction, errorPanel('У соперника уже есть активная война.'), { ephemeral: true });

          const war = context.store.createClanWar(interaction.guildId, clan.id, enemy.id);
          await context.store.save();
          return reply(interaction, panel({
            title: '⚔️ Клановая война началась!',
            description: `**${clan.name}** vs **${enemy.name}**\nСрок: **24 часа**\nОчки: +1 сообщение, +5 за 10 минут войса, +20 победа в дуэли, +50 участие в ивенте.`,
            color: COLORS.danger,
            footer: `ID войны: ${war.id}`
          }));
        }

        if (!activeWar) return reply(interaction, errorPanel('У клана нет активной войны.'), { ephemeral: true });
        const enemyId = activeWar.clanAId === clan.id ? activeWar.clanBId : activeWar.clanAId;
        const enemy = context.store.guild(interaction.guildId).clans[enemyId];

        if (action === 'finish') {
          if (activeWar.endsAt > Date.now() && !ensureOwner(interaction, clan)) {
            return reply(interaction, errorPanel('Досрочно завершить войну может только владелец.'), { ephemeral: true });
          }
          const result = context.store.finishClanWar(interaction.guildId, activeWar.id);
          await context.store.save();
          return reply(interaction, panel({
            title: '🏁 Клановая война завершена',
            description: `Победитель: **${result.winner.name}**\nНаграда: **500 XP**, **1000 монет в банк**, **50 сезонных очков**.`,
            color: COLORS.clans,
            fields: [
              { name: clan.name, value: String(activeWar.clanAId === clan.id ? activeWar.scoreA : activeWar.scoreB) },
              { name: enemy?.name || 'Соперник', value: String(activeWar.clanAId === clan.id ? activeWar.scoreB : activeWar.scoreA) }
            ]
          }));
        }

        return reply(interaction, panel({
          title: '⚔️ Статус войны',
          description: `**${clan.name}** vs **${enemy?.name || 'Соперник'}**\nДо конца: **${formatDuration(activeWar.endsAt - Date.now())}**`,
          color: COLORS.danger,
          fields: [
            { name: clan.name, value: String(activeWar.clanAId === clan.id ? activeWar.scoreA : activeWar.scoreB) },
            { name: enemy?.name || 'Соперник', value: String(activeWar.clanAId === clan.id ? activeWar.scoreB : activeWar.scoreA) }
          ]
        }));
      }

      if (subcommand === 'онлайн') {
        return reply(interaction, panel({
          title: `Онлайн клана: ${clan.name}`,
          description: `Участников: ${clan.members?.length || 0}`,
          color: COLORS.clans,
          fields: [
            { name: 'Голосовой онлайн', value: formatMinutes(clanOnline(context.store, interaction.guildId, context.voiceTracker, clan)) }
          ]
        }));
      }

      return reply(interaction, clanProfilePanel(context, interaction.guildId, clan));
    }
  }
];

module.exports = {
  commands
};
