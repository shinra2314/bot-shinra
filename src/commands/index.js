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
const tickets = require('./tickets');
const rooms = require('./rooms');
const admin = require('./admin');
const music = require('./music');
const fun = require('./fun');
const casino = require('./casino');
const love = require('./love');
const automod = require('./automod');
const panels = require('./panels');
const selfroles = require('./selfroles');
const quests = require('./quests');
const drops = require('./drops');
const giveaway = require('./giveaway');
const lfg = require('./lfg');
const season = require('./season');
const streams = require('./streams');
const prestige = require('./prestige');
const boss = require('./boss');
const battlepass = require('./battlepass');

const modules = [basic, profile, games, tops, economy, cases, roles, clans, market, moderation, tickets, rooms, admin, music, fun, casino, love, automod, panels, selfroles, quests, drops, giveaway, lfg, season, streams, prestige, boss, battlepass];
const moduleByName = { basic, profile, games, tops, economy, cases, roles, clans, market, moderation, tickets, rooms, admin, music, fun, casino, love, automod, panels, selfroles, quests, drops, giveaway, lfg, season, streams, prestige, boss, battlepass };

// Документация маршрутизации компонентов: customId-префикс → модуль-владелец.
// handleComponent по-прежнему опрашивает модули по цепочке (см. ниже); эта карта
// нужна для читаемости и диагностики — на старте проверяем, что каждый владелец
// зарегистрирован, чтобы не потерять обработчик при переименовании модуля.
const COMPONENT_PREFIXES = {
  'admin:': 'admin',
  'case:': 'cases',
  'clan:': 'clans',
  'drop:': 'drops',
  'casino:': 'casino',
  'economy:': 'economy',
  'duel:': 'fun',
  'event:': 'games',
  'giveaway:': 'giveaway',
  'inventory:': 'economy',
  'lfg:': 'lfg',
  'love:': 'love',
  'mafia:': 'games',
  'market:': 'market',
  'mod:': 'moderation',
  'music:': 'music',
  'pass:': 'battlepass',
  'prestige:': 'prestige',
  'profile:': 'profile',
  'role:': 'roles',
  'room:': 'rooms',
  'selfrole:': 'selfroles',
  'shop:': 'economy',
  'ticket:': 'tickets',
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
