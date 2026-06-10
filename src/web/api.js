// REST API веб-дашборда. Роутер монтируется в server.js под /api.
// Работает с теми же context.store (singleton) и context.client, что и бот —
// данные консистентны мгновенно. После мутаций вызываем store.save().

const express = require('express');
const { sendToChannel, listTextChannels, listGuilds } = require('./botBridge');
const { ECONOMY_SETTING_KEYS } = require('../services/store');
const { LOG_EVENTS } = require('../services/eventLogger');

const MAX_MESSAGE_LEN = 2000;

function createApiRouter(context) {
  const { store, client } = context;
  const router = express.Router();

  // ---- helpers ----
  const startedAt = Date.now();

  function userName(guildId, userId) {
    if (!userId) return null;
    const profile = store.getUser(guildId, userId);
    if (profile?.username) return profile.username;
    const cached = client.users.cache.get(userId);
    return cached ? cached.globalName || cached.username : userId;
  }

  function enrichTicket(guildId, ticket) {
    return {
      ...ticket,
      userName: userName(guildId, ticket.userId),
      targetName: ticket.targetId ? userName(guildId, ticket.targetId) : null
    };
  }

  function asyncRoute(handler) {
    return (req, res) => {
      Promise.resolve(handler(req, res)).catch((error) => {
        console.error('[web] api error:', error);
        if (!res.headersSent) res.status(500).json({ error: 'INTERNAL', message: error.message });
      });
    };
  }

  // ---- overview / health ----
  router.get('/overview', asyncRoute(async (req, res) => {
    const guilds = await listGuilds(client);
    let users = 0;
    let openTickets = 0;
    let reports = 0;
    for (const g of guilds) {
      users += store.users(g.id).length;
      const tickets = store.tickets(g.id);
      openTickets += tickets.filter((t) => t.status !== 'closed').length;
      reports += store.guild(g.id).reports.length;
    }
    res.json({
      ok: true,
      uptimeMs: Date.now() - startedAt,
      wsStatus: client.ws?.status ?? null,
      ping: Math.round(client.ws?.ping ?? -1),
      botTag: client.user?.tag || null,
      botAvatar: client.user?.displayAvatarURL?.({ size: 128 }) || null,
      guildCount: guilds.length,
      totals: { users, openTickets, reports }
    });
  }));

  // ---- guilds ----
  router.get('/guilds', asyncRoute(async (req, res) => {
    res.json(await listGuilds(client));
  }));

  router.get('/guilds/:gid/channels', asyncRoute(async (req, res) => {
    res.json(await listTextChannels(client, req.params.gid));
  }));

  // ---- tickets ----
  router.get('/guilds/:gid/tickets', asyncRoute(async (req, res) => {
    const { status } = req.query;
    let tickets = store.tickets(req.params.gid);
    if (status) tickets = tickets.filter((t) => t.status === status);
    res.json(tickets.map((t) => enrichTicket(req.params.gid, t)));
  }));

  router.get('/guilds/:gid/tickets/:id', asyncRoute(async (req, res) => {
    const ticket = store.getTicket(req.params.gid, req.params.id);
    if (!ticket) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(enrichTicket(req.params.gid, ticket));
  }));

  router.patch('/guilds/:gid/tickets/:id', asyncRoute(async (req, res) => {
    const patch = {};
    if (req.body?.status) patch.status = String(req.body.status);
    const ticket = store.updateTicket(req.params.gid, req.params.id, patch);
    if (!ticket) return res.status(404).json({ error: 'NOT_FOUND' });
    if (patch.status) {
      store.addAuditEntry(req.params.gid, {
        action: 'ticket_status',
        actor: 'web',
        targetId: ticket.userId,
        detail: `Тикет ${ticket.id} → ${patch.status}`
      });
    }
    await store.save();
    res.json(enrichTicket(req.params.gid, ticket));
  }));

  // Ответ админа: пишем в тред тикета и (best-effort) DM автору через бота.
  router.post('/guilds/:gid/tickets/:id/reply', asyncRoute(async (req, res) => {
    const body = String(req.body?.body || '').slice(0, MAX_MESSAGE_LEN);
    if (!body) return res.status(400).json({ error: 'BODY_REQUIRED' });
    const ticket = store.getTicket(req.params.gid, req.params.id);
    if (!ticket) return res.status(404).json({ error: 'NOT_FOUND' });

    let viaBot = false;
    if (req.body?.notify && ticket.userId) {
      const user = await client.users.fetch(ticket.userId).catch(() => null);
      if (user) {
        const sent = await user
          .send({ content: `📨 Ответ по тикету \`${ticket.id}\`:\n${body}`, allowedMentions: { parse: [] } })
          .then(() => true)
          .catch(() => false);
        viaBot = sent;
      }
    }
    store.addTicketMessage(req.params.gid, req.params.id, { author: 'admin', body, viaBot });
    store.addAuditEntry(req.params.gid, {
      action: 'ticket_reply',
      actor: 'web',
      targetId: ticket.userId,
      detail: `Ответ по тикету ${ticket.id}${viaBot ? ' (DM)' : ''}`
    });
    await store.save();
    res.json(enrichTicket(req.params.gid, ticket));
  }));

  // ---- reports ----
  router.get('/guilds/:gid/reports', asyncRoute(async (req, res) => {
    const reports = store.guild(req.params.gid).reports.map((r) => ({
      ...r,
      reporterName: userName(req.params.gid, r.reporterId),
      targetName: userName(req.params.gid, r.targetId)
    }));
    res.json(reports);
  }));

  // Резолв жалобы: смена статуса + запись в audit-log.
  router.patch('/guilds/:gid/reports/:id', asyncRoute(async (req, res) => {
    const status = String(req.body?.status || '').trim();
    if (!status) return res.status(400).json({ error: 'STATUS_REQUIRED' });
    const report = store.updateReport(req.params.gid, req.params.id, { status });
    if (!report) return res.status(404).json({ error: 'NOT_FOUND' });
    store.addAuditEntry(req.params.gid, {
      action: 'report_status',
      actor: 'web',
      targetId: report.targetId,
      detail: `Жалоба ${report.id} → ${status}`
    });
    await store.save();
    res.json({
      ...report,
      reporterName: userName(req.params.gid, report.reporterId),
      targetName: userName(req.params.gid, report.targetId)
    });
  }));

  // ---- users (управление) ----
  function userSummary(profile) {
    return {
      id: profile.id,
      username: profile.username,
      balance: Number(profile.balance || 0),
      lotuses: Number(profile.lotuses || 0),
      snowballs: Number(profile.snowballs || 0),
      xp: Number(profile.xp || 0),
      messages: Number(profile.messages || 0),
      voiceMinutes: Number(profile.voiceMinutes || 0)
    };
  }

  router.get('/guilds/:gid/users', asyncRoute(async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    let users = store.users(req.params.gid);
    if (q) {
      users = users.filter((u) =>
        String(u.username || '').toLowerCase().includes(q) || String(u.id).includes(q));
    }
    users = users
      .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))
      .slice(0, 50)
      .map(userSummary);
    res.json(users);
  }));

  router.get('/guilds/:gid/users/:id', asyncRoute(async (req, res) => {
    const profile = store.getUser(req.params.gid, req.params.id);
    if (!profile) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ ...userSummary(profile), reputation: Number(profile.reputation || 0), seasonRank: profile.seasonRank || null });
  }));

  // Корректировка валюты (amount может быть отрицательным). Пишем транзакцию + audit.
  const ADJUSTABLE = new Set(['balance', 'lotuses', 'snowballs']);
  router.post('/guilds/:gid/users/:id/adjust', asyncRoute(async (req, res) => {
    const currency = String(req.body?.currency || '');
    const amount = Math.trunc(Number(req.body?.amount));
    const reason = String(req.body?.reason || 'дашборд').slice(0, 200);
    if (!ADJUSTABLE.has(currency)) return res.status(400).json({ error: 'BAD_CURRENCY' });
    if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'BAD_AMOUNT' });

    const profile = store.getUser(req.params.gid, req.params.id);
    if (!profile) return res.status(404).json({ error: 'NOT_FOUND' });

    profile[currency] = Math.max(0, Number(profile[currency] || 0) + amount);
    store.recordTransaction(req.params.gid, {
      type: amount >= 0 ? 'admin_grant' : 'admin_deduct',
      toId: profile.id,
      amount: Math.abs(amount),
      note: `${reason} (${currency})`
    });
    store.addAuditEntry(req.params.gid, {
      action: 'currency_adjust',
      actor: 'web',
      targetId: profile.id,
      detail: `${amount >= 0 ? '+' : ''}${amount} ${currency} → ${reason}`
    });
    await store.save();
    res.json(userSummary(profile));
  }));

  // ---- audit-log ----
  router.get('/guilds/:gid/audit', asyncRoute(async (req, res) => {
    const entries = store.auditLog(req.params.gid).map((entry) => ({
      ...entry,
      targetName: entry.targetId ? userName(req.params.gid, entry.targetId) : null
    }));
    res.json(entries);
  }));

  // ---- настройки экономики ----
  router.get('/guilds/:gid/settings', asyncRoute(async (req, res) => {
    res.json(store.economySettings(req.params.gid));
  }));

  // body: { <key>: number | null }. null сбрасывает override к дефолту config.
  router.patch('/guilds/:gid/settings', asyncRoute(async (req, res) => {
    const patch = req.body && typeof req.body === 'object' ? req.body : {};
    const applied = [];
    const rejected = [];
    for (const [key, raw] of Object.entries(patch)) {
      if (!ECONOMY_SETTING_KEYS.includes(key)) { rejected.push(key); continue; }
      const value = raw === null || raw === '' ? null : Number(raw);
      if (value !== null && (!Number.isFinite(value) || value < 0)) { rejected.push(key); continue; }
      store.setEconomySetting(req.params.gid, key, value);
      applied.push(`${key}=${value === null ? 'default' : value}`);
    }
    if (rejected.length) return res.status(400).json({ error: 'BAD_SETTING', keys: rejected });
    if (applied.length) {
      store.addAuditEntry(req.params.gid, {
        action: 'settings_update',
        actor: 'web',
        detail: `Экономика: ${applied.join(', ')}`
      });
      await store.save();
    }
    res.json(store.economySettings(req.params.gid));
  }));

  // ---- автомодерация ----
  router.get('/guilds/:gid/automod', asyncRoute(async (req, res) => {
    res.json(store.getAutomodConfig(req.params.gid));
  }));

  router.patch('/guilds/:gid/automod', asyncRoute(async (req, res) => {
    const patch = req.body && typeof req.body === 'object' ? req.body : {};
    const updated = store.setAutomodConfig(req.params.gid, patch);
    store.addAuditEntry(req.params.gid, {
      action: 'automod_config',
      actor: 'web',
      detail: `Автомод: ${Object.keys(patch).join(', ') || '—'}`
    });
    await store.save();
    res.json(updated);
  }));

  router.get('/guilds/:gid/automod/log', asyncRoute(async (req, res) => {
    const entries = store.automodLog(req.params.gid).map((e) => ({
      ...e,
      userName: userName(req.params.gid, e.userId)
    }));
    res.json(entries);
  }));

  // ---- логи событий ----
  router.get('/guilds/:gid/logs', asyncRoute(async (req, res) => {
    res.json({ config: store.getLogConfig(req.params.gid), catalog: LOG_EVENTS });
  }));

  router.patch('/guilds/:gid/logs', asyncRoute(async (req, res) => {
    const patch = req.body && typeof req.body === 'object' ? req.body : {};
    const updated = store.setLogConfig(req.params.gid, patch);
    store.addAuditEntry(req.params.gid, {
      action: 'logs_config',
      actor: 'web',
      detail: 'Обновлены настройки логов'
    });
    await store.save();
    res.json({ config: updated, catalog: LOG_EVENTS });
  }));

  // ---- send-as-bot (admin composer) ----
  router.post('/send', asyncRoute(async (req, res) => {
    const { channelId, content } = req.body || {};
    if (!channelId || !content) return res.status(400).json({ error: 'CHANNEL_AND_CONTENT_REQUIRED' });
    const text = String(content).slice(0, MAX_MESSAGE_LEN);
    const result = await sendToChannel(client, channelId, text);
    if (!result.ok) return res.status(400).json({ error: result.error });
    if (result.guildId) {
      store.addAuditEntry(result.guildId, {
        action: 'send_as_bot',
        actor: 'web',
        detail: `Сообщение в #${result.channelName || channelId} (${text.length} символов)`
      });
      await store.save();
    }
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { createApiRouter };
