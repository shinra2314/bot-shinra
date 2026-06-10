const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  UserSelectMenuBuilder
} = require('discord.js');

const { DOMAIN, hexToInt } = require('../services/canvas/theme');

// COLORS выводятся из единой доменной палитры (theme.DOMAIN) через hexToInt —
// чтобы int-цвета панелей и hex-акценты canvas-карт не расходились. Форма экспорта
// неизменна (ключи те же), вызовы команд править не нужно.
const COLORS = {
  primary: hexToInt(DOMAIN.primary),
  success: hexToInt(DOMAIN.success),
  warning: hexToInt(DOMAIN.warning),
  danger: hexToInt(DOMAIN.danger),
  info: hexToInt(DOMAIN.info),
  economy: hexToInt(DOMAIN.economy),
  games: hexToInt(DOMAIN.games),
  clans: hexToInt(DOMAIN.clans),
  music: hexToInt(DOMAIN.music),
  love: hexToInt(DOMAIN.love),
  profile: hexToInt(DOMAIN.profile),
  neutral: hexToInt(DOMAIN.neutral),
  accent: hexToInt(DOMAIN.primary)
};

// Доменные иконки (unicode) для заголовков и строк-фактов в Components v2.
// В карточках-картинках используются flaticon-иконки, тут — только эмодзи,
// т.к. Discord не встраивает произвольные картинки в текст панелей.
const ICONS = {
  economy: '💰',
  coins: '🪙',
  lotus: '🌸',
  snow: '❄️',
  cases: '🎴',
  gift: '🎁',
  tops: '🏆',
  moderation: '🛡️',
  games: '🎲',
  casino: '🎰',
  love: '💞',
  music: '🎵',
  profile: '👤',
  clan: '⚔️',
  shop: '🛒',
  inventory: '🎒',
  xp: '✨',
  level: '🆙',
  voice: '🔊',
  time: '⏳',
  star: '⭐',
  fire: '🔥',
  up: '📈',
  down: '📉',
  success: '✅',
  error: '⛔',
  warning: '⚠️',
  info: 'ℹ️'
};

function text(content) {
  return new TextDisplayBuilder().setContent(String(content || ''));
}

function separator(divider = true, spacing = SeparatorSpacingSize.Small) {
  return new SeparatorBuilder().setDivider(divider).setSpacing(spacing);
}

function isButton(action) {
  const type = action?.data?.type || action?.toJSON?.().type;
  return type === 2;
}

// Кнопки группируются по 5 в ряд (лимит Discord), селекты — каждый в своём ряду.
function addActions(container, actions) {
  if (actions.length === 0) return;

  container.addSeparatorComponents(separator(false, SeparatorSpacingSize.Small));

  let buttonGroup = [];
  const flushButtons = () => {
    while (buttonGroup.length > 0) {
      const rowButtons = buttonGroup.splice(0, 5);
      container.addActionRowComponents(new ActionRowBuilder().addComponents(...rowButtons));
    }
  };

  for (const action of actions) {
    if (isButton(action)) {
      buttonGroup.push(action);
      continue;
    }

    flushButtons();
    container.addActionRowComponents(new ActionRowBuilder().addComponents(action));
  }

  flushButtons();
}

function stat(name, value, hint) {
  return [`**${name}**`, String(value ?? '0'), hint ? `-# ${hint}` : null].filter(Boolean).join('\n');
}

// Строка-факт: «🪙 Название — `значение`». Значение в инлайн-коде даёт
// аккуратную «капсулу», как боксы на референсе.
function keyValue(name, value, icon) {
  const prefix = icon ? `${icon} ` : '';
  return `${prefix}**${name}** — \`${value ?? '—'}\``;
}

// Сетка статов. items: [{ icon?, name, value }]. columns=2 кладёт по два факта
// в строку через разделитель, columns=1 — по одному.
function statGrid(items = [], { columns = 1 } = {}) {
  const cells = items
    .filter(Boolean)
    .map((item) => keyValue(item.name, item.value, item.icon));
  if (columns <= 1) return cells.join('\n');

  const rows = [];
  for (let i = 0; i < cells.length; i += columns) {
    rows.push(cells.slice(i, i + columns).join('   '));
  }
  return rows.join('\n');
}

// Текстовый прогресс-бар: ▰▰▰▱▱ + проценты.
function bar(value, max, width = 12) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const filled = Math.round(ratio * width);
  const percent = Math.round(ratio * 100);
  return `${'▰'.repeat(filled)}${'▱'.repeat(width - filled)} ${percent}%`;
}

function badge(label) {
  return `\`${label}\``;
}

function buildHeader({ icon, title, eyebrow, description }) {
  const heading = icon ? `## ${icon}  ${title}` : `## ${title}`;
  return [eyebrow ? `-# ${eyebrow}` : null, heading, description].filter(Boolean).join('\n');
}

function panel({
  title,
  description,
  color = COLORS.primary,
  fields = [],
  lines = [],
  stats = [],
  statColumns = 1,
  footer,
  actions = [],
  thumbnail,
  eyebrow,
  icon,
  imageUrl
}) {
  const container = new ContainerBuilder().setAccentColor(color);
  const header = buildHeader({ icon, title, eyebrow, description });

  if (thumbnail) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(header))
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(thumbnail)
            .setDescription(title)
        )
    );
  } else {
    container.addTextDisplayComponents(text(header));
  }

  // Баннер-картинка (attachment://...) сразу под заголовком — для hub-панелей.
  if (imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems((item) => item.setURL(imageUrl).setDescription(title || 'panel'))
    );
  }

  const bodyBlocks = [];
  if (stats.length > 0) {
    bodyBlocks.push(statGrid(stats, { columns: statColumns }));
  }
  bodyBlocks.push(...lines);
  for (const field of fields) {
    bodyBlocks.push(`**${field.name}**\n${field.value}`);
  }

  if (bodyBlocks.length > 0) {
    container.addSeparatorComponents(separator(false, SeparatorSpacingSize.Small));
    for (const block of bodyBlocks) {
      container.addTextDisplayComponents(text(block));
    }
  }

  if (footer) {
    container.addSeparatorComponents(separator(true, SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(text(`-# ${footer}`));
  }

  addActions(container, actions);

  return [container];
}

function mediaPanel({
  title,
  description,
  imageUrl,
  color = COLORS.primary,
  footer,
  actions = [],
  eyebrow,
  icon,
  lines = [],
  stats = [],
  statColumns = 1
}) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(text(buildHeader({ icon, title, eyebrow, description })));

  if (imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems((item) =>
        item.setURL(imageUrl).setDescription(title)
      )
    );
  }

  const bodyBlocks = [];
  if (stats.length > 0) bodyBlocks.push(statGrid(stats, { columns: statColumns }));
  bodyBlocks.push(...lines);
  if (bodyBlocks.length > 0) {
    container.addSeparatorComponents(separator(false, SeparatorSpacingSize.Small));
    for (const block of bodyBlocks) {
      container.addTextDisplayComponents(text(block));
    }
  }

  if (footer) {
    container.addSeparatorComponents(separator(true, SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(text(`-# ${footer}`));
  }

  addActions(container, actions);

  return [container];
}

function button(customId, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

function linkButton(label, url) {
  return new ButtonBuilder()
    .setLabel(label)
    .setStyle(ButtonStyle.Link)
    .setURL(url);
}

function select(customId, placeholder, options) {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(options);
}

function roleSelect(customId, placeholder, minValues = 0, maxValues = 5) {
  return new RoleSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(minValues)
    .setMaxValues(maxValues);
}

function userSelect(customId, placeholder, minValues = 1, maxValues = 1) {
  return new UserSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(minValues)
    .setMaxValues(maxValues);
}

function componentFlags(ephemeral = false) {
  return ephemeral
    ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    : MessageFlags.IsComponentsV2;
}

function componentPayload(components, options = {}) {
  return {
    components: Array.isArray(components) ? components : [components],
    flags: componentFlags(options.ephemeral),
    allowedMentions: options.allowedMentions || { parse: [] },
    files: options.files
  };
}

// Коды Discord для «протухшего»/уже отвеченного взаимодействия. Если ответ
// опоздал (рендер карты дольше 3 сек) — токен мёртв, и любой reply/update кинет
// 10062. Глотаем такие ошибки, чтобы один медленный рендер не ронял процесс.
const EXPIRED_INTERACTION_CODES = new Set([10062, 40060, 10008, 10015]);

function isExpiredInteraction(error) {
  return Boolean(error) && EXPIRED_INTERACTION_CODES.has(error.code);
}

async function reply(interaction, components, options = {}) {
  const payload = componentPayload(components, options);
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }
    return await interaction.reply(payload);
  } catch (error) {
    if (isExpiredInteraction(error)) return null;
    throw error;
  }
}

async function update(interaction, components, options = {}) {
  const payload = {
    components: Array.isArray(components) ? components : [components],
    allowedMentions: { parse: [] },
    files: options.files
  };
  try {
    // Если взаимодействие уже подтверждено (deferUpdate) — редактируем ответ.
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }
    return await interaction.update(payload);
  } catch (error) {
    if (isExpiredInteraction(error)) return null;
    throw error;
  }
}

function errorPanel(message, title = 'Не получилось') {
  return panel({
    title,
    icon: ICONS.error,
    description: message,
    color: COLORS.danger
  });
}

function successPanel(message, title = 'Готово') {
  return panel({
    title,
    icon: ICONS.success,
    description: message,
    color: COLORS.success
  });
}

function warningPanel(message, title = 'Внимание') {
  return panel({
    title,
    icon: ICONS.warning,
    description: message,
    color: COLORS.warning
  });
}

function infoPanel(message, title = 'Информация') {
  return panel({
    title,
    icon: ICONS.info,
    description: message,
    color: COLORS.info
  });
}

module.exports = {
  COLORS,
  ICONS,
  ButtonStyle,
  badge,
  bar,
  button,
  componentFlags,
  componentPayload,
  errorPanel,
  infoPanel,
  keyValue,
  linkButton,
  mediaPanel,
  panel,
  reply,
  roleSelect,
  select,
  stat,
  statGrid,
  successPanel,
  text,
  update,
  userSelect,
  warningPanel
};
