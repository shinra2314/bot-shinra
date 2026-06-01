const { AttachmentBuilder } = require('discord.js');
const { formatCoins, formatMinutes, levelFromXp } = require('../utils/format');
const { buildImageUrl, imgLayer, txtLayer } = require('./imgenx');
const {
  CARD_AVAILABLE, loadIcons, loadRemoteImage,
  paintHeroCard, paintProfileCard, paintLeaderboardCard, paintResultCard,
  paintClanCard, paintLoveCard, paintDropCard, paintGridCard, paintWarCard
} = require('./cardRenderer');
const { ACCENT } = require('./canvas/theme');

const PROFILE_CATALOG = {
  frames: [
    { id: 'default', name: 'Onix Classic', price: 0 },
    { id: 'neon', name: 'Neon Dragon', price: 15000 },
    { id: 'emerald', name: 'Emerald Pulse', price: 9000 },
    { id: 'royal', name: 'Royal Violet', price: 12000 }
  ],
  colors: [
    { id: 'violet', name: 'Фиолетовый', price: 0, value: '#8b5cf6' },
    { id: 'red', name: 'Красный', price: 0, value: '#ef4444' },
    { id: 'green', name: 'Зелёный', price: 2500, value: '#4ade80' },
    { id: 'rose', name: 'Розовый', price: 2500, value: '#fb7185' },
    { id: 'gold', name: 'Золотой', price: 5000, value: '#facc15' },
    { id: 'blue', name: 'Голубой', price: 2500, value: '#38bdf8' }
  ],
  // Баннеры карточки: тематический градиент-фон + рекомендованный акцент (раскрас).
  // Покупаются в магазине (категория «Баннеры») и выбираются в /profile настроить → фон.
  backgrounds: [
    { id: 'onix', name: 'Onix Night', price: 0, theme: { from: '#1b1d27', to: '#0b0c12' }, accent: '#E0506B' },
    { id: 'crimson', name: 'Crimson', price: 4000, theme: { from: '#2a0d14', to: '#0e0608' }, accent: '#ff5a6e' },
    { id: 'gold', name: 'Golden Hour', price: 5000, theme: { from: '#2a2310', to: '#0f0d07' }, accent: '#f5c451' },
    { id: 'emerald', name: 'Emerald Pulse', price: 5000, theme: { from: '#0c241b', to: '#070f0b' }, accent: '#4ade80' },
    { id: 'violet', name: 'Violet Dream', price: 5000, theme: { from: '#1d1430', to: '#0b0814' }, accent: '#a78bfa' },
    { id: 'ocean', name: 'Ocean', price: 5000, theme: { from: '#0c1c2a', to: '#070d12' }, accent: '#38bdf8' },
    { id: 'mafia', name: 'Mafia Night', price: 8000, theme: { from: '#241016', to: '#0c0608' }, accent: '#ff5a6e' },
    { id: 'love', name: 'Love Core', price: 8000, theme: { from: '#2a1020', to: '#120712' }, accent: '#f472b6' }
  ],
  icons: [
    { id: 'spark', name: 'Искра', price: 0, symbol: '✦' },
    { id: 'crown', name: 'Корона', price: 4000, symbol: '♛' },
    { id: 'star', name: 'Звезда', price: 2500, symbol: '★' },
    { id: 'shield', name: 'Щит', price: 2500, symbol: '⬟' }
  ],
  titles: [
    { id: 'newbie', name: 'Новичок Onix', price: 0 },
    { id: 'old', name: 'Старожил', price: 3000 },
    { id: 'mafia_mvp', name: 'Мафия MVP', price: 6000 },
    { id: 'voice_monster', name: 'Голосовой монстр', price: 6000 },
    { id: 'economy_god', name: 'Бог экономики', price: 8000 },
    { id: 'onix_legend', name: 'Легенда Onix', price: 12000 }
  ],
  badges: [
    { id: 'onix', name: 'Onix', price: 0, symbol: '◆' },
    { id: 'mvp', name: 'MVP', price: 5000, symbol: '★' },
    { id: 'rich', name: 'Rich', price: 5000, symbol: '●' },
    { id: 'voice', name: 'Voice', price: 5000, symbol: '◉' }
  ]
};

function findCatalogItem(type, id) {
  return PROFILE_CATALOG[type]?.find((item) => item.id === id) || PROFILE_CATALOG[type]?.[0];
}

const BACKGROUND_FILLS = {
  onix: '0x0c0e16',
  matrix: '0x041510',
  mafia: '0x140609',
  love: '0x170510'
};

function hexToImgenx(hex) {
  if (!hex) return '0xffffff';
  const value = hex.startsWith('#') ? hex.slice(1) : hex;
  return `0x${value.toLowerCase()}`;
}

function shortText(value, max = 22) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function badgeName(profile) {
  const favorite = profile.customization?.favoriteBadge || profile.badges?.[0] || 'onix';
  return findCatalogItem('badges', favorite)?.name || favorite;
}

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 500;
const MAX_URL_LENGTH = 2000;

function getProfileCardUrl({ user, profile, liveMinutes = 0 }) {
  const level = levelFromXp(profile.xp);
  const fill = BACKGROUND_FILLS[profile.customization?.background] || BACKGROUND_FILLS.onix;
  const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
  const voiceTotal = formatMinutes((profile.voiceMinutes || 0) + liveMinutes);
  const balance = formatCoins(profile.balance).replace(' мон.', '');
  const name = shortText(user.globalName || user.username, 16);

  const valueColor = '0xf7f7fb';
  const accent = '0x9aa0b4';

  const layers = [
    imgLayer(avatarUrl, { x: 220, y: 250, w: 280, h: 280, rd: 99999, o: 'cm' }),
    txtLayer(name, { x: 420, y: 180, c: valueColor, s: 56, o: 'sm', f: 'Montserrat' }),
    txtLayer(`LVL ${level.level}  XP ${level.xp}`, { x: 420, y: 260, c: accent, s: 32, o: 'sm', f: 'Montserrat' }),
    txtLayer(`${balance} coins`, { x: 420, y: 340, c: valueColor, s: 40, o: 'sm', f: 'Montserrat' }),
    txtLayer(`Voice: ${voiceTotal}`, { x: 420, y: 400, c: accent, s: 28, o: 'sm', f: 'Montserrat' })
  ];

  const url = buildImageUrl({ width: CARD_WIDTH, height: CARD_HEIGHT, fill, layers });
  if (url.length > MAX_URL_LENGTH) {
    return buildImageUrl({
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fill,
      layers: [
        imgLayer(avatarUrl, { x: 220, y: 250, w: 280, h: 280, rd: 99999, o: 'cm' }),
        txtLayer(name, { x: 420, y: 220, c: valueColor, s: 56, o: 'sm', f: 'Montserrat' }),
        txtLayer(`LVL ${level.level}`, { x: 420, y: 300, c: accent, s: 32, o: 'sm', f: 'Montserrat' }),
        txtLayer(`${balance} coins`, { x: 420, y: 360, c: valueColor, s: 36, o: 'sm', f: 'Montserrat' })
      ]
    });
  }
  return url;
}

function normalizeHex(value) {
  const v = String(value || '').replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(v) ? `#${v.toLowerCase()}` : null;
}

function accentFor(profile) {
  const hex = normalizeHex(profile.customization?.color);
  if (hex) return hex;
  const color = findCatalogItem('colors', profile.customization?.color);
  return color?.value || '#E0506B';
}

function bannerFor(profile) {
  return findCatalogItem('backgrounds', profile.customization?.background) || PROFILE_CATALOG.backgrounds[0];
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ru-RU');
}

async function loadAvatar(user) {
  return loadRemoteImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
}

function attachment(buffer) {
  return {
    files: [new AttachmentBuilder(buffer, { name: 'card.png' })],
    imageUrl: 'attachment://card.png'
  };
}

// Топ-роль участника: исключаем @everyone (id роли совпадает с id гильдии),
// берём наивысшую по позиции. Цвет роли по умолчанию (#000000) считаем «нет цвета».
function topRole(member) {
  const roles = member?.roles?.cache;
  if (!roles) return null;
  const role = roles
    .filter((r) => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .first();
  if (!role) return null;
  const color = role.hexColor && role.hexColor !== '#000000' ? role.hexColor : null;
  const iconUrl = typeof role.iconURL === 'function' ? role.iconURL({ extension: 'png', size: 64 }) : null;
  return { name: role.name, color, iconUrl };
}

// Карта статусов присутствия → подпись и цвет индикатора.
const PRESENCE = {
  online: { label: 'В сети', color: '#3ba55d' },
  idle: { label: 'Не активен', color: '#faa61a' },
  dnd: { label: 'Не беспокоить', color: '#ed4245' },
  offline: { label: 'Не в сети', color: '#747f8d' }
};

// Геройская карточка профиля. Возвращает { files, imageUrl } для вложения
// или { imageUrl } с imgenx-фоллбэком, если canvas недоступен.
// presenceStatus: 'online'|'idle'|'dnd'|'offline'|null; tags: string[].
async function buildProfileCard({ user, member, profile, clan, rank, liveMinutes = 0, presenceStatus = null, tags = [] }) {
  if (!CARD_AVAILABLE) {
    return { imageUrl: getProfileCardUrl({ user, profile, liveMinutes }) };
  }
  await loadIcons();
  const level = levelFromXp(profile.xp);
  const title = findCatalogItem('titles', profile.customization?.title)?.name;
  const role = topRole(member);

  // Аватар и иконку роли грузим параллельно: команда не дефёрится, бюджет ~3с.
  const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
  const [avatar, roleIcon] = await Promise.all([
    loadRemoteImage(avatarUrl),
    role?.iconUrl ? loadRemoteImage(role.iconUrl) : Promise.resolve(null)
  ]);

  const chips = [{ kind: 'love', text: profile.lovePartnerId ? 'В паре' : 'Холост', accent: '#fb7185' }];
  if (role) chips.push({ kind: 'role', text: shortText(role.name, 16), icon: roleIcon, color: role.color });
  chips.push({ kind: 'clan', text: clan?.name ? shortText(clan.name, 16) : 'Нет клана', icon: 'clan' });

  const buffer = paintProfileCard({
    accent: accentFor(profile),
    background: bannerFor(profile).theme,
    avatar,
    name: shortText(user.globalName || user.username, 16),
    subtitle: title || 'Профиль Onix',
    ring: { value: level.progress, max: level.needed },
    level: level.level,
    currencies: [
      { name: 'Монеты', sub: 'Обычная', value: formatNumber(profile.balance), color: '#f5c451' },
      { name: 'Лотусы', sub: 'Премиум', value: formatNumber(profile.lotuses), color: '#a78bfa' }
    ],
    chips,
    presence: presenceStatus ? (PRESENCE[presenceStatus] || PRESENCE.offline) : null,
    tags: Array.isArray(tags) ? tags.slice(0, 3) : [],
    tiles: [
      { icon: 'voice', label: 'Онлайн', value: formatMinutes((profile.voiceMinutes || 0) + liveMinutes) },
      { icon: 'messages', label: 'Сообщений', value: formatNumber(profile.messages) },
      { icon: 'trophy', label: 'В топе', value: rank || 'Вне топа' },
      { icon: 'level', label: 'Достижений', value: formatNumber(profile.achievements?.length || 0) }
    ],
    achievements: (Array.isArray(profile.achievements) ? profile.achievements : [])
      .slice().reverse().map((item) => (item && item.name) || String(item))
  });
  return attachment(buffer);
}

async function buildBalanceCard({ user, profile }) {
  if (!CARD_AVAILABLE) return null;
  await loadIcons();
  const level = levelFromXp(profile.xp);
  const buffer = paintHeroCard({
    accent: accentFor(profile),
    avatar: await loadAvatar(user),
    name: shortText(user.globalName || user.username, 16),
    subtitle: 'Экономика Onix',
    ring: { value: level.progress, max: level.needed },
    level: level.level,
    title: 'Текущий баланс',
    tiles: [
      { icon: 'coins', label: 'Монеты', value: formatNumber(profile.balance), accent: '#f5c451' },
      { icon: 'lotus', label: 'Лотусы', value: formatNumber(profile.lotuses) },
      { icon: 'snow', label: 'Снежки', value: formatNumber(profile.snowballs) },
      { icon: 'level', label: 'Уровень', value: String(level.level) }
    ]
  });
  return attachment(buffer);
}

async function buildTimelyCard({ user, profile, reward, snowballs, xp }) {
  if (!CARD_AVAILABLE) return null;
  await loadIcons();
  const level = levelFromXp(profile.xp);
  const buffer = paintHeroCard({
    accent: accentFor(profile),
    avatar: await loadAvatar(user),
    name: shortText(user.globalName || user.username, 16),
    subtitle: 'Печенье с предсказанием',
    ring: { value: level.progress, max: level.needed },
    level: level.level,
    title: 'Награда дня',
    tiles: [
      { icon: 'coins', label: 'Монеты', value: `+${formatNumber(reward)}`, accent: '#7CFFB2' },
      { icon: 'snow', label: 'Снежки', value: `+${formatNumber(snowballs)}`, accent: '#7CFFB2' },
      { icon: 'level', label: 'Опыт', value: `+${formatNumber(xp)}`, accent: '#7CFFB2' }
    ]
  });
  return attachment(buffer);
}

// Грузит аватары для набора строк/участников параллельно (с таймаутом).
// entries: [{ avatarUrl, ... }] → возвращает Map(avatarUrl → Image|null).
async function loadAvatarMap(entries) {
  const urls = [...new Set(entries.map((e) => e && e.avatarUrl).filter(Boolean))];
  const images = await Promise.all(urls.map((url) => loadRemoteImage(url)));
  return new Map(urls.map((url, i) => [url, images[i]]));
}

// Карта лидерборда. rows: [{ rank, name, value, avatarUrl }].
async function buildLeaderboardCard({ title, subtitle, rows = [], accent = ACCENT.gold }) {
  if (!CARD_AVAILABLE) return null;
  await loadIcons();
  const top = rows.slice(0, 10);
  const avatars = await loadAvatarMap(top);
  const buffer = paintLeaderboardCard({
    accent,
    title,
    subtitle,
    rows: top.map((r) => ({
      rank: r.rank,
      name: shortText(r.name, 24),
      value: r.value,
      avatar: avatars.get(r.avatarUrl) || null,
      highlight: Boolean(r.highlight)
    }))
  });
  return attachment(buffer);
}

// Карта исхода игры. outcome: 'win'|'lose'|'draw'.
async function buildResultCard({ user, outcome, title, lines = [], delta, accent }) {
  if (!CARD_AVAILABLE) return null;
  await loadIcons();
  const avatar = user ? await loadAvatar(user) : null;
  const buffer = paintResultCard({
    outcome,
    title,
    delta,
    lines,
    accent,
    avatar,
    name: user ? shortText(user.globalName || user.username, 24) : null
  });
  return attachment(buffer);
}

// Карта клана. members: [{ avatarUrl }]; tiles/war — готовые spec-поля.
async function buildClanCard({ name, tag, level, ring, members = [], tiles = [], war, accent = ACCENT.success }) {
  if (!CARD_AVAILABLE) return null;
  await loadIcons();
  const avatars = await loadAvatarMap(members);
  const buffer = paintClanCard({
    accent,
    name: shortText(name, 18),
    tag,
    level,
    ring,
    tiles,
    war,
    members: members.slice(0, 6).map((m) => ({ avatar: avatars.get(m.avatarUrl) || null }))
  });
  return attachment(buffer);
}

// Парная карта любви. a/b: { name, avatarUrl } (b может быть null).
async function buildLoveCard({ a, b, days, compatibility, tiles = [], accent = ACCENT.love }) {
  if (!CARD_AVAILABLE) return null;
  await loadIcons();
  const [aAvatar, bAvatar] = await Promise.all([
    a?.avatarUrl ? loadRemoteImage(a.avatarUrl) : Promise.resolve(null),
    b?.avatarUrl ? loadRemoteImage(b.avatarUrl) : Promise.resolve(null)
  ]);
  const buffer = paintLoveCard({
    accent,
    days,
    compatibility,
    tiles,
    a: { name: shortText(a?.name, 18), avatar: aAvatar },
    b: b ? { name: shortText(b.name, 18), avatar: bAvatar } : null
  });
  return attachment(buffer);
}

// Карта выпавшего предмета. rarity: 'common'|'rare'|'epic'|'legendary'.
async function buildDropCard({ rarity, itemName, itemKind, valueText, fromCase }) {
  if (!CARD_AVAILABLE) return null;
  await loadIcons();
  const buffer = paintDropCard({ rarity, itemName, itemKind, valueText, fromCase });
  return attachment(buffer);
}

// Карта сетки товаров/инвентаря. items: [{ icon, name, price, owned }].
async function buildGridCard({ title, subtitle, items = [], accent = ACCENT.profile }) {
  if (!CARD_AVAILABLE) return null;
  await loadIcons();
  const buffer = paintGridCard({ accent, title, subtitle, items });
  return attachment(buffer);
}

// Карта-уведомление о достижении (на базе drop-лейаута с золотым свечением).
async function buildAchievementCard({ name }) {
  if (!CARD_AVAILABLE) return null;
  await loadIcons();
  const buffer = paintDropCard({
    rarity: 'legendary',
    topLabel: 'ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО',
    itemName: name,
    itemKind: 'trophy',
    footnote: ''
  });
  return attachment(buffer);
}

// Versus-карта клановой войны. a/b: { name, score }.
async function buildWarCard({ title, subtitle, a, b, accent }) {
  if (!CARD_AVAILABLE) return null;
  await loadIcons();
  const buffer = paintWarCard({ title, subtitle, a, b, accent });
  return attachment(buffer);
}

module.exports = {
  PROFILE_CATALOG,
  findCatalogItem,
  getProfileCardUrl,
  buildProfileCard,
  buildBalanceCard,
  buildTimelyCard,
  buildLeaderboardCard,
  buildResultCard,
  buildClanCard,
  buildLoveCard,
  buildDropCard,
  buildGridCard,
  buildAchievementCard,
  buildWarCard
};
