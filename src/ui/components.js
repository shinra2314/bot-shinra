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
  ThumbnailBuilder
} = require('discord.js');

const COLORS = {
  primary: 0xA855F7,
  success: 0x34F5A0,
  warning: 0xFFD24A,
  danger: 0xFF3B6B,
  info: 0x22D3EE,
  economy: 0xFFD24A,
  games: 0xFF3B6B,
  clans: 0x34F5A0,
  music: 0xA78BFA,
  love: 0xFF3B6B,
  profile: 0xA855F7,
  neutral: 0x12131A,
  accent: 0xA855F7
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
  level: '⭐',
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
  icon
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

async function reply(interaction, components, options = {}) {
  const payload = componentPayload(components, options);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

async function update(interaction, components, options = {}) {
  return interaction.update({
    components: Array.isArray(components) ? components : [components],
    allowedMentions: { parse: [] },
    files: options.files
  });
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
  update
};
