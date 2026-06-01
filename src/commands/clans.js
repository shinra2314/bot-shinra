const { SlashCommandBuilder } = require('discord.js');
const { COLORS, ICONS, errorPanel, mediaPanel, panel, reply, successPanel } = require('../ui/components');
const { formatCoins, formatDuration, formatMinutes, mentionUser } = require('../utils/format');
const { buildClanCard, buildWarCard } = require('../services/profileCard');

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

const CLAN_UNLOCKS = [
  { level: 1, key: 'base', title: 'Банк, профиль и базовые задания', description: 'донаты, XP и командные задания' },
  { level: 2, key: 'shop', title: 'Клановый магазин', description: 'покупки и планы развития через банк' },
  { level: 3, key: 'war', title: 'Клановые войны', description: '24 часа соревнования против другого клана' },
  { level: 4, key: 'war_bonus', title: 'Военный буст', description: '+20% к очкам войны за активность' },
  { level: 5, key: 'roles', title: 'Клановые роли', description: 'слоты под клановые роли и косметику' },
  { level: 7, key: 'quest_bonus', title: 'Буст заданий', description: '+15% к наградам клановых заданий' },
  { level: 10, key: 'legend', title: 'Легенда Onix', description: 'сезонная эмблема и статус топ-клана' }
];

function unlockedClanFeatures(level) {
  return CLAN_UNLOCKS.filter((unlock) => level >= unlock.level);
}

function nextClanUnlock(level) {
  return CLAN_UNLOCKS.find((unlock) => unlock.level > level) || null;
}

function clanHasUnlock(clan, key) {
  const unlock = CLAN_UNLOCKS.find((item) => item.key === key);
  return Boolean(unlock && Number(clan.level || 1) >= unlock.level);
}

function lockedClanPanel(clan, key) {
  const unlock = CLAN_UNLOCKS.find((item) => item.key === key);
  return errorPanel(`Эта механика откроется на **${unlock.level} уровне** клана.\nСейчас у **${clan.name}** уровень **${clan.level}**.`);
}

async function clanProfilePanel(context, guildId, clan) {
  context.store.ensureClanShape(clan);
  const owner = clan.ownerId ? mentionUser(clan.ownerId) : 'не указан';
  const previewMembers = (clan.members || []).slice(0, 8).map(mentionUser).join(', ') || 'нет участников';
  const activeWar = context.store.activeWarForClan(guildId, clan.id);
  const unlocked = unlockedClanFeatures(clan.level).map((item) => `• ${item.title}`).join('\n');
  const nextUnlock = nextClanUnlock(clan.level);

  // Карта клана (картинка): эмблема, уровень, плитки и состав.
  const memberAvatars = (clan.members || []).slice(0, 6).map((userId) => ({
    avatarUrl: context.client.users.cache.get(userId)?.displayAvatarURL({ extension: 'png', size: 64 })
  }));
  const card = await buildClanCard({
    name: clan.name,
    tag: clan.tag || undefined,
    level: clan.level,
    ring: { value: clan.level, max: 10 },
    members: memberAvatars,
    tiles: [
      { icon: 'coins', label: 'Банк', value: Number(clan.bank || 0).toLocaleString('ru-RU'), accent: '#FFD24A' },
      { icon: 'clan', label: 'Состав', value: String(clan.members?.length || 0) },
      { icon: 'trophy', label: 'Рейтинг', value: String(clan.rating || 0) },
      { icon: 'level', label: 'Уровень', value: String(clan.level) }
    ]
  });

  const components = mediaPanel({
    title: `Клан: ${clan.name}`,
    icon: ICONS.clan,
    eyebrow: 'Кланы Onix',
    description: clan.description || 'Описание не указано.',
    color: COLORS.clans,
    imageUrl: card?.imageUrl,
    lines: [
      `${ICONS.profile} **Владелец** — ${owner}`,
      `${ICONS.star} **Рейтинг сезона** — ${clan.rating || 0} рейтинга • ${clan.seasonPoints || 0} SP`,
      `${ICONS.profile} **Участники** — ${previewMembers}`,
      `${ICONS.clan} **Война** — ${activeWar ? `активна до <t:${Math.floor(activeWar.endsAt / 1000)}:R>` : 'нет активной войны'}`,
      `${ICONS.success} **Открытые механики**\n${unlocked || 'пока нет'}`,
      `${ICONS.up} **Следующее улучшение** — ${nextUnlock ? `Уровень ${nextUnlock.level}: ${nextUnlock.title}` : 'все основные механики открыты'}`
    ]
  });

  return { components, files: card?.files };
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
          title: 'Клановый рейтинг',
          icon: ICONS.tops,
          eyebrow: 'Кланы Onix',
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
        const nextUnlock = nextClanUnlock(clan.level);
        return reply(interaction, panel({
          title: `Банк клана — ${clan.name}`,
          icon: ICONS.economy,
          eyebrow: 'Кланы Onix',
          description: `${ICONS.coins} В банке: **${formatCoins(clan.bank)}**`,
          color: COLORS.clans,
          stats: [
            { icon: ICONS.level, name: 'Уровень', value: String(clan.level) },
            { icon: ICONS.up, name: 'Стоимость улучшения', value: formatCoins(clanLevelCost(clan)) },
            { icon: ICONS.star, name: 'Сезонные очки', value: String(clan.seasonPoints || 0) },
            { icon: ICONS.info, name: 'Следующее открытие', value: nextUnlock ? `Ур. ${nextUnlock.level}: ${nextUnlock.title}` : 'все механики открыты' }
          ],
          statColumns: 1
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
          title: `Клановые задания — ${clan.name}`,
          icon: ICONS.star,
          eyebrow: 'Кланы Onix',
          description: clanHasUnlock(clan, 'quest_bonus')
            ? 'Выполняются всей командой. У клана открыт буст: награды заданий увеличены на 15%.'
            : 'Выполняются всей командой. Награды идут в банк и XP клана.',
          color: COLORS.clans,
          lines: clan.quests.map((quest) =>
            `${quest.completed ? ICONS.success : ICONS.star} **${quest.title}**\n-# ${quest.completed ? 'выполнено' : `${quest.progress}/${quest.target}`} • награда ${formatCoins(quest.reward)}`
          )
        }));
      }

      if (subcommand === 'магазин') {
        if (!clanHasUnlock(clan, 'shop')) return reply(interaction, lockedClanPanel(clan, 'shop'), { ephemeral: true });

        const lines = [
          `**Улучшение клана** — ${formatCoins(clanLevelCost(clan))}`,
          clanHasUnlock(clan, 'war')
            ? '**Военный контракт** — открыт, запускай через `/clan война`'
            : '**Военный контракт** — откроется на 3 уровне',
          clanHasUnlock(clan, 'war_bonus')
            ? '**Военный буст** — активен: +20% к очкам войны'
            : '**Военный буст** — откроется на 4 уровне',
          clanHasUnlock(clan, 'roles')
            ? '**Клановая роль** — доступна для настройки владельцем'
            : '**Клановая роль** — откроется на 5 уровне',
          clanHasUnlock(clan, 'quest_bonus')
            ? '**Буст заданий** — активен: +15% к наградам'
            : '**Буст заданий** — откроется на 7 уровне'
        ];

        return reply(interaction, panel({
          title: `Клановый магазин — ${clan.name}`,
          icon: ICONS.shop,
          eyebrow: 'Кланы Onix',
          description: `${ICONS.coins} Банк: **${formatCoins(clan.bank)}**`,
          color: COLORS.clans,
          lines,
          footer: 'Покупки кланового магазина используют банк клана.'
        }));
      }

      if (subcommand === 'улучшить') {
        if (!ensureOwner(interaction, clan)) return reply(interaction, errorPanel('Улучшать клан может только владелец.'), { ephemeral: true });
        const cost = clanLevelCost(clan);
        if (clan.bank < cost) return reply(interaction, errorPanel(`В банке не хватает монет. Нужно ${formatCoins(cost)}.`), { ephemeral: true });

        clan.bank -= cost;
        const previousLevel = clan.level;
        clan.level += 1;
        clan.rating += 10;
        const opened = CLAN_UNLOCKS
          .filter((unlock) => unlock.level > previousLevel && unlock.level <= clan.level)
          .map((unlock) => `• ${unlock.title}: ${unlock.description}`);
        await context.store.save();
        return reply(interaction, panel({
          title: 'Уровень клана повышен',
          icon: ICONS.up,
          eyebrow: 'Кланы Onix',
          description: `Клан **${clan.name}** улучшен до уровня **${clan.level}**.`,
          color: COLORS.success,
          fields: [
            { name: `${ICONS.coins} Списано из банка`, value: formatCoins(cost) },
            { name: `${ICONS.success} Открыто`, value: opened.length ? opened.join('\n') : 'новые механики на следующих уровнях' },
            { name: `${ICONS.up} Следующий уровень`, value: formatCoins(clanLevelCost(clan)) }
          ]
        }));
      }

      if (subcommand === 'война') {
        if (!clanHasUnlock(clan, 'war')) return reply(interaction, lockedClanPanel(clan, 'war'), { ephemeral: true });

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
          const startCard = await buildWarCard({
            title: 'Война началась',
            subtitle: 'Срок: 24 часа',
            a: { name: clan.name, score: 0 },
            b: { name: enemy.name, score: 0 }
          });
          return reply(interaction, mediaPanel({
            title: 'Клановая война началась',
            icon: '⚔️',
            eyebrow: 'Клановые войны',
            description: `**${clan.name}** ⚔️ **${enemy.name}**\nОчки: +1 сообщение, +5 за 10 минут войса, +20 победа в дуэли, +50 участие в ивенте.`,
            color: COLORS.danger,
            imageUrl: startCard?.imageUrl,
            footer: `ID войны: ${war.id}`
          }), { files: startCard?.files });
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
          const ownScore = activeWar.clanAId === clan.id ? activeWar.scoreA : activeWar.scoreB;
          const enemyScore = activeWar.clanAId === clan.id ? activeWar.scoreB : activeWar.scoreA;
          const finishCard = await buildWarCard({
            title: 'Война завершена',
            subtitle: `Победитель: ${result.winner.name}`,
            a: { name: clan.name, score: ownScore },
            b: { name: enemy?.name || 'Соперник', score: enemyScore }
          });
          return reply(interaction, mediaPanel({
            title: 'Клановая война завершена',
            icon: ICONS.tops,
            eyebrow: 'Клановые войны',
            description: `Победитель: **${result.winner.name}**\nНаграда: **500 XP**, **1000 монет в банк**, **50 сезонных очков**.`,
            color: COLORS.clans,
            imageUrl: finishCard?.imageUrl
          }), { files: finishCard?.files });
        }

        const ownScore = activeWar.clanAId === clan.id ? activeWar.scoreA : activeWar.scoreB;
        const enemyScore = activeWar.clanAId === clan.id ? activeWar.scoreB : activeWar.scoreA;
        const statusCard = await buildWarCard({
          title: 'Клановая война',
          subtitle: `До конца: ${formatDuration(activeWar.endsAt - Date.now())}`,
          a: { name: clan.name, score: ownScore },
          b: { name: enemy?.name || 'Соперник', score: enemyScore }
        });
        return reply(interaction, mediaPanel({
          title: 'Статус клановой войны',
          icon: '⚔️',
          eyebrow: 'Клановые войны',
          description: `**${clan.name}** ⚔️ **${enemy?.name || 'Соперник'}**\nДо конца: **${formatDuration(activeWar.endsAt - Date.now())}**`,
          color: COLORS.danger,
          imageUrl: statusCard?.imageUrl
        }), { files: statusCard?.files });
      }

      if (subcommand === 'онлайн') {
        return reply(interaction, panel({
          title: `Онлайн клана — ${clan.name}`,
          icon: ICONS.voice,
          eyebrow: 'Кланы Onix',
          description: `${ICONS.profile} Участников: ${clan.members?.length || 0}`,
          color: COLORS.clans,
          stats: [
            { icon: ICONS.voice, name: 'Голосовой онлайн', value: formatMinutes(clanOnline(context.store, interaction.guildId, context.voiceTracker, clan)) }
          ]
        }));
      }

      const { components, files } = await clanProfilePanel(context, interaction.guildId, clan);
      return reply(interaction, components, { files });
    }
  }
];

module.exports = {
  commands
};
