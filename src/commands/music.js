const { SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  ButtonStyle,
  button,
  errorPanel,
  panel,
  reply,
  update
} = require('../ui/components');

function requireGuild(interaction) {
  return interaction.guildId ? null : 'Эта команда работает только на сервере.';
}

function playerFor(state, guildId) {
  if (!state.music.has(guildId)) {
    state.music.set(guildId, {
      current: null,
      queue: [],
      volume: 80,
      paused: false
    });
  }
  return state.music.get(guildId);
}

function queuePanel(player, title = 'Музыка') {
  const queueLines = player.queue.slice(0, 5).map((track, index) => `**${index + 1}.** ${track}`);
  return panel({
    title,
    description: player.current
      ? `Сейчас в контроллере: **${player.current}**`
      : 'Очередь пуста.',
    color: COLORS.music,
    fields: [
      { name: 'Громкость', value: `${player.volume}%` },
      { name: 'Пауза', value: player.paused ? 'да' : 'нет' },
      { name: 'Очередь', value: queueLines.length ? queueLines.join('\n') : 'нет треков' }
    ],
    footer: 'Это UI-контроллер. Для настоящего аудио подключи player в src/commands/music.js.',
    actions: [
      button('music:pause', 'Пауза', ButtonStyle.Secondary, !player.current || player.paused),
      button('music:resume', 'Продолжить', ButtonStyle.Success, !player.current || !player.paused),
      button('music:skip', 'Скип', ButtonStyle.Primary, !player.current),
      button('music:stop', 'Стоп', ButtonStyle.Danger, !player.current && player.queue.length === 0)
    ]
  });
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('play')
      .setDescription('Включить песню')
      .addStringOption((option) => option.setName('query').setDescription('Название или ссылка').setMinLength(2).setRequired(true)),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });

      const player = playerFor(context.state, interaction.guildId);
      const query = interaction.options.getString('query', true);
      if (!player.current) {
        player.current = query;
        player.paused = false;
      } else {
        player.queue.push(query);
      }

      return reply(interaction, queuePanel(player, 'Трек добавлен'));
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('volume')
      .setDescription('Установить громкость')
      .addIntegerOption((option) => option.setName('percent').setDescription('Громкость 1-200').setMinValue(1).setMaxValue(200).setRequired(true)),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });
      const player = playerFor(context.state, interaction.guildId);
      player.volume = interaction.options.getInteger('percent', true);
      return reply(interaction, queuePanel(player, 'Громкость изменена'));
    }
  },
  {
    data: new SlashCommandBuilder().setName('skip').setDescription('Пропустить трек'),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });
      const player = playerFor(context.state, interaction.guildId);
      const skipped = player.current;
      player.current = player.queue.shift() || null;
      player.paused = false;
      return reply(interaction, skipped ? queuePanel(player, 'Трек пропущен') : errorPanel('Сейчас нет активного трека.'), { ephemeral: !skipped });
    }
  },
  {
    data: new SlashCommandBuilder().setName('pause').setDescription('Поставить трек на паузу'),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });
      const player = playerFor(context.state, interaction.guildId);
      if (!player.current) return reply(interaction, errorPanel('Сейчас нет активного трека.'), { ephemeral: true });
      player.paused = true;
      return reply(interaction, queuePanel(player, 'Пауза включена'));
    }
  },
  {
    data: new SlashCommandBuilder().setName('resume').setDescription('Убрать паузу и включить трек'),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });
      const player = playerFor(context.state, interaction.guildId);
      if (!player.current) return reply(interaction, errorPanel('Сейчас нет активного трека.'), { ephemeral: true });
      player.paused = false;
      return reply(interaction, queuePanel(player, 'Пауза снята'));
    }
  },
  {
    data: new SlashCommandBuilder().setName('stop').setDescription('Остановить воспроизведение'),
    async execute(interaction, context) {
      const guildError = requireGuild(interaction);
      if (guildError) return reply(interaction, errorPanel(guildError), { ephemeral: true });
      const player = playerFor(context.state, interaction.guildId);
      player.current = null;
      player.queue = [];
      player.paused = false;
      return reply(interaction, queuePanel(player, 'Музыка остановлена'));
    }
  }
];

async function handleComponent(interaction, context) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('music:')) return false;

  const player = playerFor(context.state, interaction.guildId);
  const action = interaction.customId.split(':')[1];

  if (action === 'pause' && player.current) {
    player.paused = true;
    await update(interaction, queuePanel(player, 'Пауза включена'));
    return true;
  }

  if (action === 'resume' && player.current) {
    player.paused = false;
    await update(interaction, queuePanel(player, 'Пауза снята'));
    return true;
  }

  if (action === 'skip' && player.current) {
    player.current = player.queue.shift() || null;
    player.paused = false;
    await update(interaction, queuePanel(player, 'Трек пропущен'));
    return true;
  }

  if (action === 'stop') {
    player.current = null;
    player.queue = [];
    player.paused = false;
    await update(interaction, queuePanel(player, 'Музыка остановлена'));
    return true;
  }

  await reply(interaction, errorPanel('Сейчас нет активного трека.'), { ephemeral: true });
  return true;
}

module.exports = {
  commands,
  handleComponent
};
