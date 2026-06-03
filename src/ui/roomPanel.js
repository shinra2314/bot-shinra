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
  return panel({
    title: 'Панель личной комнаты',
    icon: ICONS.voice,
    eyebrow: 'Комнаты Onix',
    description: `Комната: ${channel ? `<#${channel.id}>` : 'не найдена'}\nВладелец: ${mentionUser(room.ownerId)}`,
    color: COLORS.info,
    stats: [
      { icon: room.locked ? '🔒' : '🔓', name: 'Закрыта', value: room.locked ? 'да' : 'нет' },
      { icon: '👁️', name: 'Скрыта', value: room.hidden ? 'да' : 'нет' },
      { icon: ICONS.profile, name: 'Лимит', value: String(channel?.userLimit || 'нет') },
      { icon: '🎚️', name: 'Битрейт', value: `${Math.round((channel?.bitrate || 64000) / 1000)} kbps` },
      { icon: '🌐', name: 'Регион', value: channel?.rtcRegion || 'авто' },
      { icon: '✅', name: 'Вайтлист', value: String(whitelistCount) }
    ],
    statColumns: 2,
    actions: [
      button(`room:lock:${channelId}`, 'Закрыть', ButtonStyle.Secondary, room.locked),
      button(`room:open:${channelId}`, 'Открыть', ButtonStyle.Success, !room.locked),
      button(`room:hide:${channelId}`, 'Скрыть', ButtonStyle.Secondary, room.hidden),
      button(`room:show:${channelId}`, 'Показать', ButtonStyle.Primary, !room.hidden),
      button(`room:rename:${channelId}`, 'Название', ButtonStyle.Secondary),
      button(`room:limit:${channelId}`, 'Лимит', ButtonStyle.Secondary),
      button(`room:bitrate:${channelId}`, 'Битрейт', ButtonStyle.Secondary),
      button(`room:region:${channelId}`, 'Регион', ButtonStyle.Secondary),
      button(`room:whitelist:${channelId}`, 'Вайтлист', ButtonStyle.Secondary),
      button(`room:kick:${channelId}`, 'Кикнуть', ButtonStyle.Secondary),
      button(`room:transfer:${channelId}`, 'Передать', ButtonStyle.Secondary),
      button(`room:delete:${channelId}`, 'Удалить', ButtonStyle.Danger)
    ]
  });
}

module.exports = { roomPanel, BITRATE_PRESETS, REGION_OPTIONS };
