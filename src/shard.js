const path = require('node:path');
const { ShardingManager } = require('discord.js');
const config = require('./config');

if (!config.token) {
  console.error('DISCORD_TOKEN is missing in .env');
  process.exit(1);
}

function resolveTotalShards() {
  const raw = process.env.SHARD_COUNT;
  if (!raw || raw === 'auto') return 'auto';
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 'auto';
}

const manager = new ShardingManager(path.join(__dirname, 'index.js'), {
  token: config.token,
  totalShards: resolveTotalShards(),
  respawn: true
});

manager.on('shardCreate', (shard) => {
  console.log(`[shard] launched #${shard.id}`);
  shard.on('death', (process) => console.warn(`[shard] #${shard.id} died (code ${process.exitCode})`));
  shard.on('disconnect', () => console.warn(`[shard] #${shard.id} disconnected`));
  shard.on('reconnecting', () => console.log(`[shard] #${shard.id} reconnecting`));
});

async function shutdown(signal) {
  console.log(`[shard-manager] received ${signal}, stopping shards...`);
  for (const shard of manager.shards.values()) {
    shard.kill();
  }
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

manager.spawn().catch((error) => {
  console.error('[shard-manager] spawn failed:', error);
  process.exit(1);
});
