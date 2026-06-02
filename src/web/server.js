// HTTP-сервер дашборда. Встроен в процесс бота (общий store + client).
// Под шардингом слушает только шард 0, чтобы не было конфликта портов.
// Авторизации нет (выбор владельца) — по умолчанию биндим 127.0.0.1.
// Если задан DASHBOARD_TOKEN, он требуется для всех /api, кроме публичных
// (/api/relay) и health (/api/overview).

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { createApiRouter } = require('./api');

const DIST_DIR = path.join(__dirname, '..', '..', 'web', 'dist');
const PUBLIC_PATHS = new Set(['/relay', '/overview']);

function onPrimaryShard(client) {
  if (!client.shard) return true;
  const ids = client.shard.ids || [];
  return ids.includes(0);
}

function tokenGuard(token) {
  return (req, res, next) => {
    if (!token) return next();
    if (PUBLIC_PATHS.has(req.path)) return next();
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const provided = bearer || req.query.token;
    if (provided === token) return next();
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  };
}

function createWebServer(context) {
  const { config, client } = context;
  const app = express();
  let server = null;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.use('/api', tokenGuard(config.webToken), createApiRouter(context));

  // Статика собранного React-SPA + fallback на index.html для роутинга.
  const hasDist = fs.existsSync(path.join(DIST_DIR, 'index.html'));
  if (hasDist) {
    app.use(express.static(DIST_DIR));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res
        .status(200)
        .type('html')
        .send('<h1>Onix dashboard</h1><p>Frontend не собран. Запусти <code>npm run web:build</code>.</p>');
    });
  }

  function start() {
    if (!onPrimaryShard(client)) {
      console.log('[web] не основной шард — HTTP-сервер не запускается.');
      return null;
    }
    server = app.listen(config.webPort, config.webHost, () => {
      const exposed = config.webHost === '0.0.0.0';
      console.log(`[web] dashboard на http://${config.webHost}:${config.webPort}`);
      if (exposed && !config.webToken) {
        console.warn('[web] ⚠ WEB_HOST=0.0.0.0 без DASHBOARD_TOKEN — send-as-bot открыт всем!');
      }
      if (!hasDist) console.warn('[web] web/dist не найден — собери фронт (npm run web:build).');
    });
    server.on('error', (error) => console.error('[web] ошибка сервера:', error.message));
    return server;
  }

  function stop() {
    return new Promise((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
      server = null;
    });
  }

  return { app, start, stop };
}

module.exports = { createWebServer };
