const { COLORS, ICONS, ButtonStyle, button, panel } = require('./components');

// Статичная панель самостоятельных ролей. Кнопка на роль — клик переключает
// (выдаёт/снимает) роль у нажавшего. customId: selfrole:toggle:<roleId>.
// roles: [{ roleId, label, description?, emoji? }]; imageUrl — баннер-карта (опц.).
function selfRolePanel(roles = [], imageUrl) {
  const base = {
    imageUrl,
    title: 'Выбор ролей',
    icon: ICONS.star,
    eyebrow: 'Самостоятельные роли',
    color: COLORS.primary
  };

  if (!Array.isArray(roles) || roles.length === 0) {
    return panel({
      ...base,
      description: 'Роли ещё не настроены. Администратор добавляет их командой `/selfroles добавить`.'
    });
  }

  return panel({
    ...base,
    description: 'Нажми кнопку, чтобы получить роль. Повторный клик снимает её.',
    lines: roles.map((role) => {
      const prefix = role.emoji ? `${role.emoji} ` : '';
      const desc = role.description ? ` — ${role.description}` : '';
      return `${prefix}<@&${role.roleId}>${desc}`;
    }),
    actions: roles.slice(0, 25).map((role) =>
      button(
        `selfrole:toggle:${role.roleId}`,
        `${role.emoji ? `${role.emoji} ` : ''}${role.label}`,
        ButtonStyle.Secondary
      )
    )
  });
}

module.exports = { selfRolePanel };
