const { COLORS, ICONS, ButtonStyle, button, panel } = require('./components');

// Статичная панель тикетов для текстового канала (видна всем).
// Кнопки открывают модалку; после отправки бот создаёт приватный канал тикет-N / жалоба-N.
// Маршрутизация компонентов — модуль tickets (префикс customId `ticket:`).
function ticketPanel() {
  return panel({
    title: 'Тикеты',
    icon: '🎫',
    eyebrow: 'Поддержка Onix',
    description: 'Опиши вопрос в форме — бот создаст для тебя личный канал, который видят только ты и администрация.',
    color: COLORS.info,
    fields: [
      {
        name: '📋 Тикеты',
        value: 'Открой личный билет для решения вопроса, обсуждения предложений или жалоб.'
      },
      {
        name: '🚨 Жалобы',
        value: 'Если нарушение чётко видно — воспользуйся кнопкой быстрого реагирования.'
      }
    ],
    footer: 'Не указывай пароли и прочую конфиденциальную информацию.',
    actions: [
      button('ticket:open:ticket', '📋 Создать билет', ButtonStyle.Secondary),
      button('ticket:open:report', '🚨 Подать жалобу', ButtonStyle.Secondary)
    ]
  });
}

module.exports = { ticketPanel };
