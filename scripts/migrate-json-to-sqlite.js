const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/services/db');

const projectRoot = path.resolve(__dirname, '..');
const jsonPath = path.resolve(projectRoot, process.env.JSON_PATH || 'data/database.json');
const sqlitePath = path.resolve(projectRoot, process.env.DATABASE_PATH || 'data/onix.db');

if (!fs.existsSync(jsonPath)) {
  console.error(`Source JSON not found: ${jsonPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(jsonPath, 'utf8');
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (error) {
  console.error(`Failed to parse JSON: ${error.message}`);
  process.exit(1);
}

const guilds = parsed.guilds || {};
const entries = Object.entries(guilds);
if (entries.length === 0) {
  console.warn('No guilds found in source JSON; nothing to migrate.');
}

const db = openDb(sqlitePath);
const stmt = db.prepare(
  'INSERT INTO guilds (guild_id, data, updated_at) VALUES (?, ?, ?) ' +
  'ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
);

const now = Date.now();
const migrate = db.transaction((items) => {
  for (const [guildId, guildData] of items) {
    stmt.run(guildId, JSON.stringify(guildData), now);
  }
});
migrate(entries);
db.close();

console.log(`Migrated ${entries.length} guild(s):`);
console.log(`  from ${jsonPath}`);
console.log(`  to   ${sqlitePath}`);
