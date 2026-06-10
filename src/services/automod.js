// Автомодерация входящих сообщений. Чистая логика проверки правил + применение
// эскалирующего наказания (удалить → warn → авто-таймаут). Администраторы и роли
// из bypassRoleIds не проверяются. Текст сообщений требует MessageContent intent.

const { PermissionFlagsBits } = require('discord.js');
const eventLogger = require('./eventLogger');

// In-memory окна активности на пользователя: таймстемпы сообщений, упоминаний и
// последнее содержимое (для детекта дубликатов). Ключ — `${guildId}:${userId}`.
const windows = new Map();

const INVITE_RE = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg|discord\.me)\/[\w-]+/i;
const URL_RE = /https?:\/\/[^\s]+/gi;
const CUSTOM_EMOJI_RE = /<a?:\w+:\d+>/g;
const UNICODE_EMOJI_RE = /\p{Extended_Pictographic}/gu;

function windowFor(key) {
  let entry = windows.get(key);
  if (!entry) {
    entry = { msgs: [], mentions: [], lastContent: null, lastRepeat: 0 };
    windows.set(key, entry);
  }
  return entry;
}

function prune(list, now, windowMs) {
  while (list.length && now - list[0].t > windowMs) list.shift();
}

function capsRatio(text) {
  const letters = text.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
  if (letters.length < 10) return 0;
  const upper = letters.replace(/[^A-ZА-ЯЁ]/g, '').length;
  return upper / letters.length;
}

function countEmoji(text) {
  const custom = (text.match(CUSTOM_EMOJI_RE) || []).length;
  const unicode = (text.match(UNICODE_EMOJI_RE) || []).length;
  return custom + unicode;
}

// Прогон всех правил. Возвращает массив нарушений [{ rule, label }].
function runRules(message, cfg) {
  const content = message.content || '';
  const now = Date.now();
  const key = `${message.guildId}:${message.author.id}`;
  const win = windowFor(key);
  const violations = [];

  // Спам по частоте сообщений
  win.msgs.push({ t: now });
  prune(win.msgs, now, cfg.spamWindowMs);
  if (win.msgs.length >= cfg.spamCount) {
    violations.push({ rule: 'spam-rate', label: `спам (${win.msgs.length} сообщений за ${Math.round(cfg.spamWindowMs / 1000)} сек)` });
  }

  // Дубликаты подряд
  if (content && content === win.lastContent) {
    win.lastRepeat += 1;
    if (win.lastRepeat >= 3) violations.push({ rule: 'дубликаты', label: 'повтор одинаковых сообщений' });
  } else {
    win.lastContent = content;
    win.lastRepeat = 1;
  }

  // Инвайт-ссылки Discord
  if (cfg.blockInvites && INVITE_RE.test(content)) {
    violations.push({ rule: 'invite-link', label: 'ссылка-приглашение Discord' });
  }

  // Внешние ссылки (кроме whitelist), если включено
  if (cfg.blockLinks) {
    const urls = content.match(URL_RE) || [];
    const bad = urls.find((url) => {
      if (INVITE_RE.test(url)) return false; // уже поймано отдельным правилом
      return !cfg.linkWhitelist.some((allowed) => url.toLowerCase().includes(allowed.toLowerCase()));
    });
    if (bad) violations.push({ rule: 'external-link', label: 'запрещённая внешняя ссылка' });
  }

  // Пинг-флуд (упоминаний за раз)
  const mentionCount = message.mentions.users.size;
  if (mentionCount >= cfg.mentionLimit || message.mentions.everyone) {
    violations.push({ rule: 'mention-flood', label: `массовый пинг (${message.mentions.everyone ? '@everyone/@here' : mentionCount + ' участников'})` });
  }

  // Частый пинг по времени
  if (mentionCount > 0) {
    win.mentions.push({ t: now, n: mentionCount });
    prune(win.mentions, now, cfg.mentionRateMs);
    const total = win.mentions.reduce((sum, m) => sum + m.n, 0);
    if (total >= cfg.mentionRate) {
      violations.push({ rule: 'mention-rate', label: `частый пинг (${total} за ${Math.round(cfg.mentionRateMs / 1000)} сек)` });
    }
  }

  // CAPS-флуд
  if (cfg.capsEnabled && capsRatio(content) > 0.7) {
    violations.push({ rule: 'caps-флуд', label: 'капс (крик заглавными)' });
  }

  // Эмодзи-флуд
  if (cfg.emojiLimit > 0 && countEmoji(content) > cfg.emojiLimit) {
    violations.push({ rule: 'эмодзи-флуд', label: 'переизбыток эмодзи' });
  }

  // Новострочный флуд (стена текста)
  if (cfg.newlineLimit > 0 && (content.match(/\n/g) || []).length > cfg.newlineLimit) {
    violations.push({ rule: 'новострочный-флуд', label: 'стена текста (много переносов)' });
  }

  // Запрещённые слова
  if (cfg.badwords.length) {
    const lower = content.toLowerCase();
    const hit = cfg.badwords.find((word) => word && lower.includes(word.toLowerCase()));
    if (hit) violations.push({ rule: 'запрещённые-слова', label: 'запрещённое слово' });
  }

  return violations;
}

// Подобрать длительность таймаута по числу страйков (наибольший подходящий шаг).
function timeoutForStrikes(steps, strikes) {
  let chosen = 0;
  for (const step of steps) {
    if (strikes >= step.strikes && step.ms > chosen) chosen = step.ms;
  }
  return chosen;
}

function humanDuration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} мин`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.round(hours / 24)} дн`;
}

async function enforce(message, violations, context) {
  const { store, client } = context;
  const guildId = message.guildId;
  const userId = message.author.id;
  const reasons = violations.map((v) => v.label).join(', ');
  const reason = `Автомод: ${reasons}`;

  // Удалить сообщение
  await message.delete().catch(() => null);

  // Записать в историю наказаний и лог автомода
  store.addModerationAction(guildId, {
    type: 'automod',
    targetId: userId,
    moderatorId: client.user?.id,
    reason
  });
  store.addAutomodViolation(guildId, {
    userId,
    username: message.author.username,
    channelId: message.channelId,
    rules: violations.map((v) => v.rule),
    content: (message.content || '').slice(0, 500)
  });

  // Эскалация
  const strikes = store.addAutomodStrike(guildId, userId);
  const cfg = store.getAutomodConfig(guildId);
  const timeoutMs = timeoutForStrikes(cfg.timeoutSteps, strikes);
  let timedOut = 0;
  if (timeoutMs > 0 && message.member?.moderatable) {
    const ok = await message.member.timeout(timeoutMs, reason).then(() => true).catch(() => false);
    if (ok) timedOut = timeoutMs;
  }

  // Предупреждение в канал (самоудаляющееся, чтобы не засорять).
  const warnText = timedOut
    ? `${message.author}, нарушение: ${reasons}. Выдан мут на ${humanDuration(timedOut)} (страйк ${strikes}).`
    : `${message.author}, нарушение: ${reasons}. Сообщение удалено (страйк ${strikes}).`;
  message.channel
    .send({ content: warnText, allowedMentions: { users: [userId] } })
    .then((sent) => setTimeout(() => sent.delete().catch(() => null), 8000))
    .catch(() => null);

  // Лог события автомода
  eventLogger.emit(guildId, 'automod', {
    description: `Автомод сработал на <@${userId}> в <#${message.channelId}>.`,
    lines: [`Правила: ${reasons}`, `Страйк: ${strikes}`, timedOut ? `Мут: ${humanDuration(timedOut)}` : 'Без мута'],
    footer: message.author.tag || message.author.username
  });
}

// Точка входа из MessageCreate. Возвращает true, если сообщение было обработано
// автомодом (удалено) — вызывающий код должен прервать дальнейшую обработку.
async function checkAndEnforce(message, context) {
  try {
    if (!message.guildId || message.author.bot) return false;
    const cfg = context.store.getAutomodConfig(message.guildId);
    if (!cfg.enabled) return false;

    // Обход для администраторов и ManageGuild
    const perms = message.member?.permissions;
    if (perms?.has(PermissionFlagsBits.Administrator) || perms?.has(PermissionFlagsBits.ManageGuild)) {
      return false;
    }
    // Обход по ролям
    if (cfg.bypassRoleIds.length && message.member?.roles?.cache?.hasAny?.(...cfg.bypassRoleIds)) {
      return false;
    }

    const violations = runRules(message, cfg);
    if (!violations.length) return false;

    await enforce(message, violations, context);
    return true;
  } catch (error) {
    console.error('[automod] error:', error);
    return false;
  }
}

module.exports = { checkAndEnforce };
