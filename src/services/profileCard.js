const sharp = require('sharp');
const { formatCoins, formatMinutes, levelFromXp } = require('../utils/format');

const PROFILE_CATALOG = {
  frames: [
    { id: 'default', name: 'Onix Classic', price: 0 },
    { id: 'neon', name: 'Neon Dragon', price: 15000 },
    { id: 'emerald', name: 'Emerald Pulse', price: 9000 },
    { id: 'royal', name: 'Royal Violet', price: 12000 }
  ],
  colors: [
    { id: 'violet', name: 'Фиолетовый', price: 0, value: '#8b5cf6' },
    { id: 'green', name: 'Зелёный', price: 2500, value: '#4ade80' },
    { id: 'rose', name: 'Розовый', price: 2500, value: '#fb7185' },
    { id: 'gold', name: 'Золотой', price: 5000, value: '#facc15' }
  ],
  backgrounds: [
    { id: 'onix', name: 'Onix Night', price: 0 },
    { id: 'matrix', name: 'Matrix Room', price: 7000 },
    { id: 'mafia', name: 'Mafia Night', price: 8000 },
    { id: 'love', name: 'Love Core', price: 8000 }
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

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortText(value, max = 22) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function imageDataUri(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const png = await sharp(buffer).resize(250, 250).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

function backgroundGradient(backgroundId) {
  const gradients = {
    onix: ['#07070c', '#121827', '#101012'],
    matrix: ['#04130d', '#101a16', '#06110c'],
    mafia: ['#130609', '#171019', '#0b080d'],
    love: ['#170510', '#20101a', '#09070d']
  };
  return gradients[backgroundId] || gradients.onix;
}

function badgeName(profile) {
  const favorite = profile.customization?.favoriteBadge || profile.badges?.[0] || 'onix';
  return findCatalogItem('badges', favorite)?.name || favorite;
}

function achievementLines(profile) {
  const achievements = profile.achievements?.slice(0, 3);
  if (achievements?.length) return achievements;
  return ['Первый профиль', 'Старт сезона', 'Onix Member'];
}

async function renderProfileCard({ user, profile, clan, liveMinutes = 0, rank = 'нет' }) {
  const level = levelFromXp(profile.xp);
  const color = findCatalogItem('colors', profile.customization?.color)?.value || '#8b5cf6';
  const green = '#4ade80';
  const [bg1, bg2, bg3] = backgroundGradient(profile.customization?.background);
  const avatar = await imageDataUri(user.displayAvatarURL({ size: 512, extension: 'png' }));
  const icon = findCatalogItem('icons', profile.customization?.icon)?.symbol || '✦';
  const title = findCatalogItem('titles', profile.customization?.title)?.name || profile.customization?.title || 'Новичок Onix';
  const favoriteBadge = badgeName(profile);
  const favoriteRoles = profile.favoriteRoles?.slice(0, 3).join(' • ') || 'не выбраны';
  const achievements = achievementLines(profile);

  const svg = `
  <svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${bg1}"/>
        <stop offset="0.55" stop-color="${bg2}"/>
        <stop offset="1" stop-color="${bg3}"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${color}"/>
        <stop offset="1" stop-color="${green}"/>
      </linearGradient>
      <radialGradient id="glow" cx="30%" cy="20%" r="80%">
        <stop offset="0" stop-color="${color}" stop-opacity="0.23"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.55"/>
      </filter>
      <style>
        .panel { fill: rgba(16,18,26,.72); stroke: rgba(255,255,255,.11); stroke-width: 1.4; }
        .soft { fill: rgba(255,255,255,.055); stroke: rgba(255,255,255,.08); stroke-width: 1.2; }
        .label { fill: rgba(255,255,255,.58); font-size: 22px; font-family: Arial, sans-serif; font-weight: 600; }
        .value { fill: #f7f7fb; font-size: 34px; font-family: Arial, sans-serif; font-weight: 800; }
        .small { fill: rgba(255,255,255,.74); font-size: 24px; font-family: Arial, sans-serif; font-weight: 700; }
        .muted { fill: rgba(255,255,255,.48); font-size: 19px; font-family: Arial, sans-serif; font-weight: 600; }
        .title { fill: #ffffff; font-size: 40px; font-family: Arial, sans-serif; font-weight: 900; }
      </style>
    </defs>
    <rect width="1600" height="900" rx="24" fill="url(#bg)"/>
    <rect width="1600" height="900" rx="24" fill="url(#glow)"/>

    <rect x="54" y="54" width="470" height="792" rx="30" class="panel" filter="url(#shadow)"/>
    <rect x="54" y="54" width="470" height="792" rx="30" fill="none" stroke="url(#accent)" stroke-width="2"/>

    <circle cx="289" cy="214" r="126" fill="rgba(255,255,255,.035)" stroke="rgba(255,255,255,.11)" stroke-width="3"/>
    <circle cx="289" cy="214" r="142" fill="none" stroke="url(#accent)" stroke-width="14" stroke-dasharray="510 180" transform="rotate(-70 289 214)"/>
    ${avatar ? `<clipPath id="avatarClip"><circle cx="289" cy="214" r="108"/></clipPath><image href="${avatar}" x="181" y="106" width="216" height="216" clip-path="url(#avatarClip)"/>` : `<circle cx="289" cy="214" r="108" fill="#20232d"/>`}

    <rect x="100" y="386" width="304" height="82" rx="12" class="soft"/>
    <rect x="417" y="386" width="78" height="82" rx="18" class="soft"/>
    <rect x="80" y="390" width="5" height="38" rx="4" fill="${green}"/>
    <text x="112" y="425" class="title">${escapeXml(shortText(user.globalName || user.username, 15))}</text>
    <text x="112" y="451" class="muted">${escapeXml(title)}</text>
    <text x="444" y="439" class="value">${level.level}</text>

    <rect x="84" y="520" width="412" height="138" rx="18" class="soft"/>
    <text x="110" y="558" class="label">Баланс</text>
    <text x="110" y="604" class="value">${escapeXml(formatCoins(profile.balance).replace(' мон.', ''))}</text>
    <text x="110" y="635" class="muted">coins</text>
    <text x="316" y="558" class="label">Ранг</text>
    <text x="316" y="604" class="value">${escapeXml(rank)}</text>

    <rect x="84" y="682" width="412" height="132" rx="18" class="soft"/>
    <text x="110" y="722" class="label">Любимый бейдж</text>
    <text x="110" y="770" class="value">${escapeXml(favoriteBadge)}</text>
    <text x="440" y="768" class="value" fill="${color}">${escapeXml(icon)}</text>

    <rect x="578" y="54" width="440" height="328" rx="28" class="panel"/>
    <rect x="606" y="82" width="386" height="132" rx="18" class="soft"/>
    <circle cx="676" cy="148" r="52" fill="rgba(255,255,255,.035)" stroke="rgba(255,255,255,.13)" stroke-width="4"/>
    <text x="752" y="136" class="label">Клан</text>
    <text x="752" y="178" class="value">${escapeXml(shortText(clan?.name || 'Нет клана', 17))}</text>
    <rect x="606" y="242" width="386" height="112" rx="18" class="soft"/>
    <circle cx="676" cy="298" r="42" fill="rgba(255,255,255,.035)" stroke="${color}" stroke-opacity=".45" stroke-width="4"/>
    <text x="752" y="290" class="label">Репутация</text>
    <text x="752" y="330" class="value">${profile.reputation || 0}</text>

    <rect x="1046" y="54" width="500" height="328" rx="28" class="panel"/>
    ${[0,1,2,3,4,5].map((i) => {
      const x = 1074 + (i % 3) * 164;
      const y = 82 + Math.floor(i / 3) * 166;
      const badge = profile.badges?.[i] || (i === 0 ? favoriteBadge : '');
      return `<rect x="${x}" y="${y}" width="136" height="136" rx="22" class="soft"/><text x="${x + 68}" y="${y + 80}" class="small" text-anchor="middle">${escapeXml(shortText(badge, 9))}</text>`;
    }).join('')}

    <rect x="578" y="408" width="968" height="438" rx="28" class="panel"/>
    <rect x="606" y="436" width="290" height="170" rx="18" class="soft"/>
    <text x="640" y="500" class="label">Голосовой онлайн</text>
    <text x="640" y="552" class="value">${escapeXml(formatMinutes(profile.voiceMinutes + liveMinutes))}</text>
    <rect x="922" y="436" width="290" height="170" rx="18" class="soft"/>
    <text x="956" y="500" class="label">Любовный профиль</text>
    <text x="956" y="552" class="value">${profile.lovePartnerId ? 'Активен' : 'Нет пары'}</text>
    <rect x="1240" y="436" width="278" height="112" rx="18" class="soft"/>
    <text x="1306" y="482" class="label">Сезон</text>
    <text x="1306" y="520" class="small">${escapeXml(shortText(profile.seasonRank, 14))}</text>

    <rect x="606" y="634" width="290" height="170" rx="18" class="soft"/>
    <text x="640" y="694" class="label">Любимые роли</text>
    <text x="640" y="746" class="small">${escapeXml(shortText(favoriteRoles, 24))}</text>
    <rect x="922" y="634" width="290" height="170" rx="18" class="soft"/>
    <text x="956" y="694" class="label">Уровень XP</text>
    <text x="956" y="746" class="value">${level.xp}</text>
    <rect x="1240" y="582" width="278" height="222" rx="18" class="soft"/>
    <text x="1272" y="630" class="label">Достижения</text>
    ${achievements.map((line, index) => `<text x="1272" y="${680 + index * 42}" class="small">${escapeXml(shortText(line, 16))}</text>`).join('')}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = {
  PROFILE_CATALOG,
  findCatalogItem,
  renderProfileCard
};
