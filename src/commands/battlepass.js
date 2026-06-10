const { SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  ButtonStyle,
  bar,
  button,
  errorPanel,
  mediaPanel,
  reply,
  update
} = require('../ui/components');
const { mentionUser } = require('../utils/format');
const { buildHubBanner } = require('../services/profileCard');

// Сезонный пропуск поверх seasonXp: 1 тир = TIER_XP сезонного опыта, максимум MAX_TIER.
// Награда за тир: монеты по формуле + кейс на каждом 5-м тире (30-й — легендарный).
const TIER_XP = 1000;
const MAX_TIER = 30;

function rewardForTier(tier) {
  const coins = 150 + tier * 25;
  let caseType = null;
  if (tier === MAX_TIER) caseType = 'legendary';
  else if (tier % 10 === 0) caseType = 'epic';
  else if (tier % 5 === 0) caseType = 'rare';
  return { coins, caseType };
}

function caseLabel(type) {
  return { rare: 'редкий кейс', epic: 'эпический кейс', legendary: 'легендарный кейс' }[type] || type;
}

function currentTier(profile) {
  return Math.min(MAX_TIER, Math.floor(Number(profile.seasonXp || 0) / TIER_XP));
}

// Лениво сбрасывает прогресс пропуска при смене сезона.
function syncPassSeason(profile, season) {
  if (Number(profile.passSeason || 0) !== season.number) {
    profile.passSeason = season.number;
    profile.passClaimedTier = 0;
  }
}

// Забрать все доступные тиры. Возвращает { tiers, coins, cases } либо null (нечего).
function claimAll(profile, season) {
  syncPassSeason(profile, season);
  const tier = currentTier(profile);
  const from = Number(profile.passClaimedTier || 0) + 1;
  if (from > tier) return null;
  let coins = 0;
  const cases = [];
  for (let t = from; t <= tier; t += 1) {
    const reward = rewardForTier(t);
    coins += reward.coins;
    if (reward.caseType) cases.push(reward.caseType);
  }
  profile.balance = Number(profile.balance || 0) + coins;
  profile.cases ||= {};
  for (const type of cases) profile.cases[type] = Number(profile.cases[type] || 0) + 1;
  profile.passClaimedTier = tier;
  return { tiers: tier - from + 1, coins, cases };
}

async function passBanner() {
  return buildHubBanner({
    title: 'Сезонный пропуск',
    subtitle: 'Награды за сезонную активность',
    accent: '#a78bfa',
    items: [
      { icon: 'level', name: 'Тиры', price: `до ${MAX_TIER}` },
      { icon: 'coins', name: 'Монеты', price: 'за тир' },
      { icon: 'trophy', name: 'Кейсы', price: '5/10/…' },
      { icon: 'voice', name: 'Войс', price: 'XP' },
      { icon: 'messages', name: 'Чат', price: 'XP' },
      { icon: 'snow', name: 'Сезон', price: 'сброс' }
    ]
  }).catch(() => null);
}

async function passPanelReply(interaction, context, { viaUpdate = false, notice = null } = {}) {
  const { store } = context;
  const season = store.getSeason(interaction.guildId);
  if (!season || season.ended) {
    const respond = viaUpdate ? update : reply;
    return respond(interaction, errorPanel('Сейчас нет активного сезона — пропуск спит. Админ: `/сезон старт`.'), { ephemeral: true });
  }

  const profile = store.ensureUser(interaction.guildId, interaction.user);
  syncPassSeason(profile, season);
  const tier = currentTier(profile);
  const claimed = Number(profile.passClaimedTier || 0);
  const seasonXp = Number(profile.seasonXp || 0);
  const intoTier = seasonXp - tier * TIER_XP;
  const claimable = tier - claimed;

  const nextRewards = [];
  for (let t = tier + 1; t <= Math.min(tier + 3, MAX_TIER); t += 1) {
    const reward = rewardForTier(t);
    nextRewards.push(`Тир ${t}: 🪙 ${reward.coins}${reward.caseType ? ` + 🎴 ${caseLabel(reward.caseType)}` : ''}`);
  }

  const lines = [
    notice,
    `🎖️ Тир: **${tier}/${MAX_TIER}** • Сезонный опыт: **${seasonXp}**`,
    tier < MAX_TIER ? `\`${bar(intoTier, TIER_XP, 14)}\` до тира ${tier + 1}: ${TIER_XP - intoTier} XP` : '🏁 Максимальный тир достигнут!',
    claimable > 0 ? `🎁 Доступно к получению: **${claimable} тир(а)**` : '✅ Все награды забраны.',
    nextRewards.length ? '' : null,
    nextRewards.length ? '__Дальше по треку:__' : null,
    ...nextRewards
  ].filter((line) => line !== null && line !== undefined);

  const banner = await passBanner();
  const respond = viaUpdate ? update : reply;
  return respond(
    interaction,
    mediaPanel({
      title: `Сезонный пропуск — ${season.name}`,
      icon: '🎫',
      eyebrow: 'Battle Pass Onix',
      description: `${mentionUser(interaction.user.id)}, опыт сезона капает за чат и войс — тиры открываются сами.`,
      imageUrl: banner?.imageUrl,
      color: COLORS.primary,
      lines,
      actions: claimable > 0 ? [button('pass:claim', `🎁 Забрать (${claimable})`, ButtonStyle.Success)] : [],
      footer: `1 тир = ${TIER_XP} сезонного XP. Прогресс сбрасывается с новым сезоном.`
    }),
    { files: banner?.files, ephemeral: true }
  );
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('пропуск')
      .setDescription('Сезонный пропуск: тиры и награды'),
    async execute(interaction, context) {
      if (!interaction.guildId) return reply(interaction, errorPanel('Только на сервере.'), { ephemeral: true });
      return passPanelReply(interaction, context);
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton() || !interaction.customId.startsWith('pass:')) return false;
  const [, action] = interaction.customId.split(':');
  if (action !== 'claim') return false;

  const season = context.store.getSeason(interaction.guildId);
  if (!season || season.ended) {
    await reply(interaction, errorPanel('Сезон уже завершён.'), { ephemeral: true });
    return true;
  }

  const profile = context.store.ensureUser(interaction.guildId, interaction.user);
  const claimed = claimAll(profile, season);
  if (!claimed) {
    await reply(interaction, errorPanel('Пока нечего забирать — набери ещё сезонного опыта.'), { ephemeral: true });
    return true;
  }
  await context.store.save();

  const casesText = claimed.cases.length ? ` + 🎴 ${claimed.cases.map(caseLabel).join(', ')}` : '';
  await passPanelReply(interaction, context, {
    viaUpdate: true,
    notice: `🎉 Получено за ${claimed.tiers} тир(а): **${claimed.coins} монет**${casesText}!`
  });
  return true;
}

module.exports = {
  commands,
  handleComponent
};
