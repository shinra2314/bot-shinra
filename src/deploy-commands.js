const { REST, Routes } = require('discord.js');
const config = require('./config');
const { commands } = require('./commands');

function shouldCleanGlobalCommands() {
  if (!config.guildId) return false;
  return process.env.CLEAN_GLOBAL_COMMANDS !== 'false';
}

async function main() {
  if (!config.token) {
    throw new Error('DISCORD_TOKEN is missing in .env');
  }
  if (!config.clientId) {
    throw new Error('DISCORD_CLIENT_ID is missing in .env');
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = commands.map((command) => command.data.toJSON());

  if (config.guildId) {
    if (shouldCleanGlobalCommands()) {
      await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
      console.log('Cleared global commands to prevent duplicate command suggestions.');
    }

    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(`Registered ${body.length} guild commands for ${config.guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(config.clientId), { body });
  console.log(`Registered ${body.length} global commands.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
