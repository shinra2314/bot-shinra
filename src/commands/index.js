const basic = require('./basic');
const profile = require('./profile');
const games = require('./games');
const tops = require('./tops');
const economy = require('./economy');
const roles = require('./roles');
const clans = require('./clans');
const market = require('./market');
const moderation = require('./moderation');
const rooms = require('./rooms');
const admin = require('./admin');
const music = require('./music');
const fun = require('./fun');

const modules = [basic, profile, games, tops, economy, roles, clans, market, moderation, rooms, admin, music, fun];
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
  handleComponent
};
