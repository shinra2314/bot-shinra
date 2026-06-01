const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const folders = ['src', 'scripts'];

function collectJsFiles(folder) {
  const current = path.join(root, folder);
  const entries = fs.readdirSync(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relative = path.join(folder, entry.name);
    const fullPath = path.join(root, relative);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(relative));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = folders.flatMap(collectJsFiles);
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Checked ${files.length} JavaScript files.`);
