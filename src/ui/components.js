const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} = require('discord.js');

const COLORS = {
  primary: 0x7C3AED,
  success: 0x22C55E,
  warning: 0xF59E0B,
  danger: 0xEF4444,
  info: 0x38BDF8,
  economy: 0xFACC15,
  games: 0xFB7185,
  clans: 0x34D399,
  music: 0xA78BFA
};

function text(content) {
  return new TextDisplayBuilder().setContent(String(content || ''));
}

function separator(divider = true, spacing = SeparatorSpacingSize.Small) {
  return new SeparatorBuilder().setDivider(divider).setSpacing(spacing);
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function addActions(container, actions) {
  if (actions.length === 0) return;

  container.addSeparatorComponents(separator(false, SeparatorSpacingSize.Small));
  for (const group of chunk(actions, 5)) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(...group));
  }
}

function stat(name, value, hint) {
  return [`**${name}**`, String(value ?? '0'), hint ? `-# ${hint}` : null].filter(Boolean).join('\n');
}

function panel({
  title,
  description,
  color = COLORS.primary,
  fields = [],
  lines = [],
  footer,
  actions = [],
  thumbnail,
  eyebrow
}) {
  const container = new ContainerBuilder().setAccentColor(color);
  const header = [eyebrow ? `-# ${eyebrow}` : null, `## ${title}`, description].filter(Boolean).join('\n');

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

  const bodyLines = [...lines];
  for (const field of fields) {
    bodyLines.push(`**${field.name}**\n${field.value}`);
  }

  if (bodyLines.length > 0) {
    container.addSeparatorComponents(separator(false, SeparatorSpacingSize.Small));
    for (const line of bodyLines) {
      container.addTextDisplayComponents(text(line));
    }
  }

  if (footer) {
    container.addSeparatorComponents(separator(true, SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(text(`-# ${footer}`));
  }

  addActions(container, actions);

  return [container];
}

function mediaPanel({ title, description, imageUrl, color = COLORS.primary, footer, actions = [] }) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(text([`## ${title}`, description].filter(Boolean).join('\n')));

  if (imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems((item) =>
        item.setURL(imageUrl).setDescription(title)
      )
    );
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

async function update(interaction, components) {
  return interaction.update({
    components: Array.isArray(components) ? components : [components],
    allowedMentions: { parse: [] }
  });
}

function errorPanel(message, title = '❌ Не получилось') {
  return panel({
    title,
    description: message,
    color: COLORS.danger
  });
}

function successPanel(message, title = '✔️ Готово') {
  return panel({
    title,
    description: message,
    color: COLORS.success
  });
}

module.exports = {
  COLORS,
  ButtonStyle,
  button,
  componentFlags,
  componentPayload,
  errorPanel,
  linkButton,
  mediaPanel,
  panel,
  reply,
  select,
  stat,
  successPanel,
  text,
  update
};
