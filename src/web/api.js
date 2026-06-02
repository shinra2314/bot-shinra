// REST API веб-дашборда. Роутер монтируется в server.js под /api.
// Работает с теми же context.store (singleton) и context.client, что и бот —
// данные консистентны мгновенно. После мутаций вызываем store.save().

const express = require('express');
const { sendToChannel, listTextChannels, listGuilds } = require('./botBridge');

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

  // ---- send-as-bot (admin composer) ----
  router.post('/send', asyncRoute(async (req, res) => {
    const { channelId, content } = req.body || {};
    if (!channelId || !content) return res.status(400).json({ error: 'CHANNEL_AND_CONTENT_REQUIRED' });
    const text = String(content).slice(0, MAX_MESSAGE_LEN);
    const result = await sendToChannel(client, channelId, text);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { createApiRouter };
