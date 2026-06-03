const basic = require('./basic');
const profile = require('./profile');
const games = require('./games');
const tops = require('./tops');
const economy = require('./economy');
const cases = require('./cases');
const roles = require('./roles');
const clans = require('./clans');
const market = require('./market');
const moderation = require('./moderation');
const rooms = require('./rooms');
const admin = require('./admin');
const music = require('./music');
const fun = require('./fun');
const casino = require('./casino');
const love = require('./love');

const modules = [basic, profile, games, tops, economy, cases, roles, clans, market, moderation, rooms, admin, music, fun, casino, love];
const moduleByName = { basic, profile, games, tops, economy, cases, roles, clans, market, moderation, rooms, admin, music, fun, casino, love };

// Документация маршрутизации компонентов: customId-префикс → модуль-владелец.
// handleComponent по-прежнему опрашивает модули по цепочке (см. ниже); эта карта
// нужна для читаемости и диагностики — на старте проверяем, что каждый владелец
// зарегистрирован, чтобы не потерять обработчик при переименовании модуля.
const COMPONENT_PREFIXES = {
  'admin:': 'admin',
  'casino:': 'casino',
  'duel:': 'fun',
  'inventory:': 'economy',
  'love:': 'love',
  'mod:': 'moderation',
  'music:': 'music',
  'profile:': 'profile',
  'room:': 'rooms',
  'shop:': 'economy',
  'top:': 'tops',
  'transactions:': 'economy'
};

for (const [prefix, name] of Object.entries(COMPONENT_PREFIXES)) {
  if (!moduleByName[name]) {
    throw new Error(`COMPONENT_PREFIXES: модуль "${name}" для префикса "${prefix}" не зарегистрирован`);
  }
}

const commands = modules.flatMap((module) => module.commands || []);

const seen = new Set();
const duplicates = new Set();
for (const command of commands) {
  const name = command.data.name;
  if (seen.has(name)) duplicates.add(name);
  seen.add(name);
}

if (duplicates.size > 0) {
  throw new Error(`Duplicate command names: ${[...duplicates].join(', ')}`);
}

const commandMap = new Map(commands.map((command) => [command.data.name, command]));

async function handleComponent(interaction, context) {
  for (const module of modules) {
    if (!module.handleComponent) continue;
    const handled = await module.handleComponent(interaction, context);
    if (handled) return true;
  }
  return false;
}

module.exports = {
  commandMap,
  commands,
  handleComponent,
  COMPONENT_PREFIXES
};
