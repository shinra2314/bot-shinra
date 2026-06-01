const { REST, Routes } = require('discord.js');
const config = require('./config');
const { commands } = require('./commands');

function shouldCleanGlobalCommands() {
  if (config.guildIds.length === 0) return false;
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

  if (config.guildIds.length > 0) {
    if (shouldCleanGlobalCommands()) {
      await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
      console.log('Cleared global commands to prevent duplicate command suggestions.');
    }

    for (const guildId of config.guildIds) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body });
      console.log(`Registered ${body.length} guild commands for ${guildId}.`);
    }
    return;
  }

  await rest.put(Routes.applicationCommands(config.clientId), { body });
  console.log(`Registered ${body.length} global commands.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
