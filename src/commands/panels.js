const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { componentPayload, errorPanel, reply, successPanel } = require('../ui/components');
const { DOMAIN } = require('../services/canvas/theme');
const { buildHubBanner } = require('../services/profileCard');
const { roomHubPanel } = require('../ui/roomHubPanel');

// Реестр семейств → { label, build(imageUrl), banner }.
// build() возвращает Components V2 (panel с imageUrl-баннером, если карта собралась).
// banner — spec корпоративного баннера (paintGridCard: шапка + сетка фич 3x2).
// Иконки только из доступного набора: coins, lotus, snow, level, voice, messages, trophy, heart, clan, case.
const FAMILIES = {
  love: {
    label: 'Отношения',
    build: (img) => require('./love').hubPanel?.(img),
    banner: {
      title: 'Отношения', subtitle: 'Создавайте пару и развивайте профиль', accent: DOMAIN.love,
      items: [
        { icon: 'heart', name: 'Профиль', price: 'пара' },
        { icon: 'heart', name: 'Предложение', price: 'старт' },
        { icon: 'level', name: 'Действия', price: '+настр.' },
        { icon: 'coins', name: 'Подарки', price: 'буст' },
        { icon: 'trophy', name: 'Уровень', price: 'рост' },
        { icon: 'messages', name: 'Название', price: 'своё' }
      ]
    }
  },
  casino: {
    label: 'Казино',
    build: (img) => require('./casino').hubPanel?.(img),
    banner: {
      title: 'ONIX CASINO', subtitle: 'Слоты, кости, рулетка и лоты', accent: DOMAIN.casino,
      items: [
        { icon: 'coins', name: 'Слоты', price: 'x12' },
        { icon: 'case', name: 'Кости', price: 'x5' },
        { icon: 'trophy', name: 'Рулетка', price: 'x36' },
        { icon: 'coins', name: 'Лоты', price: '150' },
        { icon: 'level', name: 'Статистика', price: 'профиль' },
        { icon: 'snow', name: 'Удача', price: 'джекпот' }
      ]
    }
  },
  clan: {
    label: 'Кланы',
    build: (img) => require('./clans').hubPanel?.(img),
    banner: {
      title: 'Кланы', subtitle: 'Профиль, банк, война и рейтинг', accent: DOMAIN.clans,
      items: [
        { icon: 'clan', name: 'Профиль', price: 'клан' },
        { icon: 'coins', name: 'Банк', price: 'донат' },
        { icon: 'trophy', name: 'Война', price: '24ч' },
        { icon: 'case', name: 'Магазин', price: 'апгрейд' },
        { icon: 'level', name: 'Уровни', price: 'рост' },
        { icon: 'messages', name: 'Задания', price: 'награды' }
      ]
    }
  },
  event: {
    label: 'Ивенты',
    build: (img) => require('./games').eventHubPanel?.(img),
    banner: {
      title: 'Ивенты', subtitle: 'Запись, лидерборд и награды', accent: DOMAIN.games,
      items: [
        { icon: 'trophy', name: 'Ивенты', price: 'список' },
        { icon: 'messages', name: 'Запись', price: '+50' },
        { icon: 'level', name: 'Очки', price: 'топ' },
        { icon: 'coins', name: 'Награды', price: 'монеты' },
        { icon: 'clan', name: 'Турниры', price: 'команды' },
        { icon: 'snow', name: 'Розыгрыши', price: 'призы' }
      ]
    }
  },
  mafia: {
    label: 'Мафия',
    build: (img) => require('./games').mafiaHubPanel?.(img),
    banner: {
      title: 'Мафия и клозы', subtitle: 'Статистика, топ и история игр', accent: DOMAIN.games,
      items: [
        { icon: 'case', name: 'Игры', price: 'счёт' },
        { icon: 'trophy', name: 'Топ', price: 'лучшие' },
        { icon: 'level', name: 'Рейтинг', price: 'ELO' },
        { icon: 'messages', name: 'История', price: 'игры' },
        { icon: 'voice', name: 'Клозы', price: 'режим' },
        { icon: 'snow', name: 'MVP', price: 'награда' }
      ]
    }
  },
  market: {
    label: 'Маркет',
    build: (img) => require('./market').hubPanel?.(img),
    banner: {
      title: 'Маркет и аукционы', subtitle: 'Торговля предметами между игроками', accent: DOMAIN.gold,
      items: [
        { icon: 'coins', name: 'Лоты', price: 'купить' },
        { icon: 'case', name: 'Продажа', price: 'выставить' },
        { icon: 'trophy', name: 'Аукционы', price: 'ставки' },
        { icon: 'coins', name: 'Ставка', price: 'выше' },
        { icon: 'level', name: 'Сделки', price: 'история' },
        { icon: 'messages', name: 'Комиссия', price: '8%' }
      ]
    }
  },
  role: {
    label: 'Личные роли',
    build: (img) => require('./roles').hubPanel?.(img),
    banner: {
      title: 'Личные роли', subtitle: 'Своя роль: цвет, цена и продажа', accent: DOMAIN.profile,
      items: [
        { icon: 'clan', name: 'Создание', price: 'своя' },
        { icon: 'level', name: 'Цвет', price: 'HEX' },
        { icon: 'coins', name: 'Цена', price: 'магазин' },
        { icon: 'trophy', name: 'Продажа', price: 'вкл' },
        { icon: 'messages', name: 'Инфо', price: 'статус' },
        { icon: 'case', name: 'Купоны', price: 'rolePass' }
      ]
    }
  },
  case: {
    label: 'Кейсы',
    build: (img) => require('./cases').hubPanel?.(img),
    banner: {
      title: 'Кейсы', subtitle: 'Открывай кейсы и собирай призы', accent: DOMAIN.gold,
      items: [
        { icon: 'case', name: 'Открыть', price: '4 типа' },
        { icon: 'coins', name: 'Монеты', price: 'до 10k' },
        { icon: 'level', name: 'Опыт', price: 'XP' },
        { icon: 'lotus', name: 'Лотусы', price: 'дроп' },
        { icon: 'trophy', name: 'Легендарка', price: 'джекпот' },
        { icon: 'messages', name: 'Шансы', price: '%' }
      ]
    }
  },
  mod: {
    label: 'Модерация',
    build: (img) => require('./moderation').hubPanel?.(img),
    banner: {
      title: 'Модерация', subtitle: 'Жалобы, варны и история наказаний', accent: DOMAIN.danger,
      items: [
        { icon: 'trophy', name: 'Жалобы', price: 'очередь' },
        { icon: 'level', name: 'Варн', price: 'выдать' },
        { icon: 'messages', name: 'История', price: 'лог' },
        { icon: 'clan', name: 'Бан', price: 'репорт' },
        { icon: 'voice', name: 'Мьют', price: 'таймаут' },
        { icon: 'snow', name: 'Апелляции', price: 'разбор' }
      ]
    }
  },
  top: {
    label: 'Топы',
    build: (img) => require('./tops').hubPanel?.(img),
    banner: {
      title: 'Топы сервера', subtitle: 'Лидерборды и рейтинги', accent: DOMAIN.primary,
      items: [
        { icon: 'coins', name: 'Баланс', price: '#1' },
        { icon: 'voice', name: 'Онлайн', price: 'войс' },
        { icon: 'level', name: 'Уровень', price: 'XP' },
        { icon: 'heart', name: 'Любовь', price: 'пары' },
        { icon: 'clan', name: 'Кланы', price: 'рейтинг' },
        { icon: 'trophy', name: 'Топ-10', price: 'сервер' }
      ]
    }
  },
  profile: {
    label: 'Профиль',
    build: (img) => require('./profile').hubPanel?.(img),
    banner: {
      title: 'Профиль', subtitle: 'Карточка, кастомизация и достижения', accent: DOMAIN.profile,
      items: [
        { icon: 'level', name: 'Уровень', price: 'XP' },
        { icon: 'coins', name: 'Баланс', price: 'монеты' },
        { icon: 'trophy', name: 'Достижения', price: 'коллекция' },
        { icon: 'clan', name: 'Клан', price: 'статус' },
        { icon: 'messages', name: 'Сообщений', price: 'актив' },
        { icon: 'heart', name: 'Статус', price: 'пара' }
      ]
    }
  },
  music: {
    label: 'Музыка',
    build: (img) => require('./music').hubPanel?.(img),
    banner: {
      title: 'Музыка', subtitle: 'Очередь и управление воспроизведением', accent: DOMAIN.music,
      items: [
        { icon: 'voice', name: 'Очередь', price: 'плеер' },
        { icon: 'messages', name: 'Трек', price: 'добавить' },
        { icon: 'level', name: 'Громкость', price: '1-200' },
        { icon: 'snow', name: 'Скип', price: 'дальше' },
        { icon: 'trophy', name: 'Контроль', price: 'пауза' },
        { icon: 'heart', name: 'Любимое', price: 'плейлист' }
      ]
    }
  },
  economy: {
    label: 'Экономика',
    build: (img) => require('./economy').hubPanel?.(img),
    banner: {
      title: 'Экономика', subtitle: 'Баланс, награды, магазин и переводы', accent: DOMAIN.gold,
      items: [
        { icon: 'coins', name: 'Баланс', price: 'монеты' },
        { icon: 'case', name: 'Награда', price: 'timely' },
        { icon: 'lotus', name: 'Лотусы', price: 'премиум' },
        { icon: 'snow', name: 'Снежки', price: 'инвентарь' },
        { icon: 'trophy', name: 'Магазин', price: 'покупки' },
        { icon: 'level', name: 'Транзакции', price: 'история' }
      ]
    }
  },
  room: {
    label: 'Комнаты',
    build: (img) => roomHubPanel(img),
    banner: {
      title: 'Личные голосовые комнаты', subtitle: 'Своя комната — свои правила', accent: DOMAIN.voice,
      items: [
        { icon: 'voice', name: 'Лимит мест', price: 'до 99' },
        { icon: 'messages', name: 'Название', price: 'своё' },
        { icon: 'level', name: 'Битрейт', price: 'выше' },
        { icon: 'clan', name: 'Вайтлист', price: 'доступ' },
        { icon: 'trophy', name: 'Приватность', price: 'замок' },
        { icon: 'snow', name: 'Регион', price: 'выбор' }
      ]
    }
  }
};

function canAdmin(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

async function publish(interaction, key) {
  const family = FAMILIES[key];
  if (!family) return { key, ok: false };

  // Рендерим корпоративный баннер (canvas). Если canvas недоступен — панель без картинки.
  const card = family.banner ? await buildHubBanner(family.banner).catch(() => null) : null;

  let panelComponents;
  try {
    panelComponents = family.build(card?.imageUrl || null);
  } catch {
    panelComponents = null;
  }
  if (!panelComponents) return { key, ok: false };

  const sent = await interaction.channel?.send(componentPayload(panelComponents, { files: card?.files })).catch(() => null);
  return { key, ok: Boolean(sent) };
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('панель')
      .setDescription('Опубликовать многофункциональную панель семейства команд (только админ)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((option) =>
        option
          .setName('семейство')
          .setDescription('Какую панель опубликовать')
          .setRequired(true)
          .addChoices(
            ...Object.entries(FAMILIES).map(([value, { label }]) => ({ name: label, value })),
            { name: 'Все панели', value: 'все' }
          )
      ),
    async execute(interaction) {
      if (!interaction.guildId) return reply(interaction, errorPanel('Команда работает только на сервере.'), { ephemeral: true });
      if (!canAdmin(interaction)) return reply(interaction, errorPanel('Нужны права управления сервером.'), { ephemeral: true });

      const key = interaction.options.getString('семейство', true);
      const keys = key === 'все' ? Object.keys(FAMILIES) : [key];

      // Параллельно: рендер баннеров + отправка. «все» = 14 канвас-карт — последовательно
      // не уложиться в 3с окно interaction, и финальный ack протухнет.
      const results = await Promise.all(keys.map((k) => publish(interaction, k)));

      const ok = results.filter((r) => r.ok).map((r) => FAMILIES[r.key].label);
      const pending = results.filter((r) => !r.ok).map((r) => FAMILIES[r.key].label);

      if (ok.length === 0) {
        return reply(interaction, errorPanel(`Не удалось опубликовать: ${pending.join(', ') || 'неизвестно'}`), { ephemeral: true });
      }

      const lines = [`Опубликовано: ${ok.join(', ')}.`];
      if (pending.length) lines.push(`Не удалось: ${pending.join(', ')}.`);
      return reply(interaction, successPanel(lines.join('\n'), 'Панель'), { ephemeral: true });
    }
  }
];

module.exports = { commands };
