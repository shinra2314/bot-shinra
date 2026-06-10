const { COLORS, ICONS, ButtonStyle, button, mediaPanel, panel } = require('./components');

// Статичная панель управления комнатами для текстового канала-хаба.
// Видна всем; кнопка «Управление» открывает эфемерную личную панель владельца
// (customId без channelId — комната ищется по кликнувшему). Покупка — только в /shop.
// imageUrl (опц.) — баннер-карта (attachment://card.png) сверху панели.
function roomHubPanel(imageUrl) {
  const spec = {
    title: 'Личные голосовые комнаты',
    icon: ICONS.voice,
    eyebrow: 'Комнаты Onix',
    description: [
      'Своя комната — свои правила: лимит, название, битрейт, регион, вайтлист и приватность.',
      '',
      `${ICONS.shop} **Купить комнату** — в магазине: команда \`/shop\` → раздел «Системные товары».`,
      '⚙️ **Управлять** своей комнатой — кнопкой ниже (доступно только владельцу).'
    ].join('\n'),
    color: COLORS.info,
    lines: [
      '-# Комнату также можно создать, зайдя в голосовой триггер-канал.'
    ],
    footer: 'Управление работает только для владельца комнаты.',
    actions: [
      button('room:mypanel', '⚙️ Управление моей комнатой', ButtonStyle.Primary)
    ]
  };

  return imageUrl ? mediaPanel({ ...spec, imageUrl }) : panel(spec);
}

module.exports = { roomHubPanel };
