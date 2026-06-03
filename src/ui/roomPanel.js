const { COLORS, ICONS, ButtonStyle, button, panel } = require('./components');
const { mentionUser } = require('../utils/format');

// Пресеты битрейта (kbps). Верхняя планка зависит от буста сервера — лишнее
// отсекается при применении (setBitrate бросит, ловим).
const BITRATE_PRESETS = [64, 96, 128, 256, 384];

// Голосовые регионы Discord. value 'auto' => снять привязку (rtcRegion = null).
const REGION_OPTIONS = [
  { label: 'Авто', value: 'auto' },
  { label: 'Россия', value: 'russia' },
  { label: 'Роттердам', value: 'rotterdam' },
  { label: 'Сингапур', value: 'singapore' },
  { label: 'США — восток', value: 'us-east' },
  { label: 'США — запад', value: 'us-west' },
  { label: 'Япония', value: 'japan' },
  { label: 'Индия', value: 'india' }
];

// Единая панель управления комнатой — рендерится и из /room панель, и из
// авто-сообщения при создании комнаты. customId-ы общие (room:*), их ловит
// handleComponent в src/commands/rooms.js.
function roomPanel(roomData) {
  const { channel, room, channelId } = roomData;
  const whitelistCount = room.whitelist?.length || 0;
  const pinned = Number(room.pinnedUntil || 0) > Date.now();
  const persistence = room.persistent ? 'постоянная' : pinned ? 'закреплена' : 'временная';

  return panel({
    title: channel?.name || 'Личная комната',
    icon: ICONS.voice,
    eyebrow: 'Управление комнатой · Onix',
    description: [
      `${ICONS.voice} Канал: ${channel ? `<#${channel.id}>` : 'не найден'}`,
      `${ICONS.profile} Владелец: ${mentionUser(room.ownerId)}`
    ].join('\n'),
    color: room.locked ? COLORS.warning : COLORS.info,
    stats: [
      { icon: room.locked ? '🔒' : '🔓', name: 'Доступ', value: room.locked ? 'закрыта' : 'открыта' },
      { icon: '👁️', name: 'Видимость', value: room.hidden ? 'скрыта' : 'видна' },
      { icon: '👥', name: 'Лимит', value: String(channel?.userLimit || 'нет') },
      { icon: '🎚️', name: 'Битрейт', value: `${Math.round((channel?.bitrate || 64000) / 1000)} kbps` },
      { icon: '🌐', name: 'Регион', value: channel?.rtcRegion || 'авто' },
      { icon: '✅', name: 'Вайтлист', value: String(whitelistCount) },
      { icon: '📌', name: 'Тип', value: persistence }
    ],
    statColumns: 2,
    footer: 'Управлять может только владелец комнаты.',
    actions: [
      button(`room:lock:${channelId}`, '🔒 Закрыть', ButtonStyle.Secondary, room.locked),
      button(`room:open:${channelId}`, '🔓 Открыть', ButtonStyle.Success, !room.locked),
      button(`room:hide:${channelId}`, '🙈 Скрыть', ButtonStyle.Secondary, room.hidden),
      button(`room:show:${channelId}`, '👁️ Показать', ButtonStyle.Primary, !room.hidden),
      button(`room:rename:${channelId}`, '✏️ Название', ButtonStyle.Secondary),
      button(`room:limit:${channelId}`, '👥 Лимит', ButtonStyle.Secondary),
      button(`room:bitrate:${channelId}`, '🎚️ Битрейт', ButtonStyle.Secondary),
      button(`room:region:${channelId}`, '🌐 Регион', ButtonStyle.Secondary),
      button(`room:whitelist:${channelId}`, '✅ Вайтлист', ButtonStyle.Secondary),
      button(`room:kick:${channelId}`, '🚪 Кикнуть', ButtonStyle.Secondary),
      button(`room:transfer:${channelId}`, '👑 Передать', ButtonStyle.Secondary),
      button(`room:delete:${channelId}`, '🗑️ Удалить', ButtonStyle.Danger)
    ]
  });
}

module.exports = { roomPanel, BITRATE_PRESETS, REGION_OPTIONS };
