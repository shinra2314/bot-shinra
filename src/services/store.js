const path = require('node:path');
const fs = require('node:fs/promises');
const { openDb } = require('./db');

function createDefaultData() {
  return {
    version: 1,
    guilds: {}
  };
}

function createGuildData() {
  return {
    users: {},
    clans: {},
    clanWars: [],
    marketListings: [],
    auctions: [],
    events: [],
    duels: [],
    loveProposals: [],
    relationships: {},
    transactions: [],
    caseHistory: [],
    reports: [],
    moderationHistory: [],
    tickets: [],
    tempRooms: {}
  };
}

// Окно хранения событий активности и потолок их числа на пользователя.
const ACTIVITY_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_MAX_EVENTS = 200;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function relationKey(userAId, userBId) {
  return [userAId, userBId].sort().join(':');
}

function createUserData(user, startBalance) {
  return {
    id: user.id,
    username: user.globalName || user.username || user.id,
    balance: startBalance,
    lotuses: 0,
    snowballs: 0,
    reputation: 0,
    seasonRank: 'Новичок сезона',
    xp: 0,
    messages: 0,
    activity: { recent: [] },
    voiceMinutes: 0,
    voiceDailyDate: todayKey(),
    voiceDailyMinutes: 0,
    roomMinutes: 0,
    loveMinutes: 0,
    eventPoints: 0,
    eventWins: 0,
    mafia: {
      games: 0,
      wins: 0,
      rating: 1000,
      mvp: 0,
      history: []
    },
    closes: {
      games: 0,
      wins: 0,
      rating: 0
    },
    cases: {
      common: 1,
      rare: 0,
      epic: 0
    },
    rolePasses: 0,
    personalRoleId: null,
    roleCreatedAt: null,
    roleRenewedAt: null,
    rolePrice: 500,
    rolePurchases: 0,
    roleForSale: true,
    purchasedRoles: [],
    clanId: null,
    lovePartnerId: null,
    loveSince: null,
    loveXp: 0,
    loveMood: 70,
    loveStreak: 0,
    loveLastAction: 0,
    loveLastActionDate: null,
    casinoStats: {
      totalBet: 0,
      totalPayout: 0,
      games: 0,
      wins: 0,
      losses: 0,
      biggestWin: 0,
      history: []
    },
    lastTimely: 0,
    inventory: [],
    cosmetics: {
      frames: ['default'],
      colors: ['violet'],
      backgrounds: ['onix'],
      icons: ['spark'],
      titles: ['Новичок Onix'],
      badges: ['Onix']
    },
    customization: {
      frame: 'default',
      color: 'violet',
      background: 'onix',
      icon: 'spark',
      title: 'Новичок Onix',
      favoriteBadge: 'Onix'
    },
    favoriteRoles: [],
    badges: ['Onix'],
    achievements: []
  };
}

function createClanData({ id, name, description, ownerId }) {
  return {
    id,
    name,
    description,
    ownerId,
    members: [ownerId],
    rating: 0,
    level: 1,
    xp: 0,
    bank: 0,
    seasonPoints: 0,
    roles: [],
    quests: [
      { id: 'voice_120', title: '120 минут войса', progress: 0, target: 120, reward: 400, completed: false },
      { id: 'donate_1000', title: 'Собрать 1000 монет в банк', progress: 0, target: 1000, reward: 250, completed: false },
      { id: 'duel_3', title: 'Победить в 3 дуэлях', progress: 0, target: 3, reward: 300, completed: false }
    ],
    createdAt: Date.now()
  };
}

class Store {
  constructor(filePath, config) {
    this.filePath = filePath;
    this.config = config;
    this.data = createDefaultData();
    this.writeQueue = Promise.resolve();
    this.db = null;
    this._upsertStmt = null;
  }

  async load() {
    this.db = openDb(this.filePath);
    this._upsertStmt = this.db.prepare(
      'INSERT INTO guilds (guild_id, data, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    );

    const rows = this.db.prepare('SELECT guild_id, data FROM guilds').all();
    for (const row of rows) {
      try {
        this.data.guilds[row.guild_id] = JSON.parse(row.data);
      } catch (error) {
        console.error(`Failed to parse guild ${row.guild_id}:`, error);
      }
    }
  }

  async save() {
    if (!this.db) return;
    const snapshot = Object.entries(this.data.guilds).map(([id, data]) => [id, JSON.stringify(data)]);
    const now = Date.now();
    const stmt = this._upsertStmt;
    const db = this.db;

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(() => {
        const writeAll = db.transaction((entries) => {
          for (const [id, json] of entries) {
            stmt.run(id, json, now);
          }
        });
        writeAll(snapshot);
      });
    return this.writeQueue;
  }

  guild(guildId) {
    const id = guildId || 'dm';
    if (!this.data.guilds[id]) this.data.guilds[id] = createGuildData();
    this.data.guilds[id].users ||= {};
    this.data.guilds[id].clans ||= {};
    this.data.guilds[id].clanWars ||= [];
    this.data.guilds[id].marketListings ||= [];
    this.data.guilds[id].auctions ||= [];
    this.data.guilds[id].events ||= [];
    this.data.guilds[id].duels ||= [];
    this.data.guilds[id].loveProposals ||= [];
    this.data.guilds[id].relationships ||= {};
    this.data.guilds[id].transactions ||= [];
    this.data.guilds[id].caseHistory ||= [];
    this.data.guilds[id].reports ||= [];
    this.data.guilds[id].moderationHistory ||= [];
    this.data.guilds[id].tickets ||= [];
    this.data.guilds[id].tempRooms ||= {};
    return this.data.guilds[id];
  }

  ensureUser(guildId, user) {
    const guild = this.guild(guildId);
    if (!guild.users[user.id]) {
      guild.users[user.id] = createUserData(user, this.config.startBalance);
    }

    guild.users[user.id].username = user.globalName || user.username || guild.users[user.id].username;
    guild.users[user.id].id = user.id;
    guild.users[user.id].balance ??= this.config.startBalance;
    guild.users[user.id].lotuses ??= 0;
    guild.users[user.id].snowballs ??= 0;
    guild.users[user.id].reputation ??= 0;
    guild.users[user.id].seasonRank ??= 'Новичок сезона';
    guild.users[user.id].xp ??= 0;
    guild.users[user.id].messages ??= 0;
    guild.users[user.id].activity ||= { recent: [] };
    guild.users[user.id].activity.recent ||= [];
    guild.users[user.id].voiceMinutes ??= 0;
    guild.users[user.id].voiceDailyDate ??= todayKey();
    guild.users[user.id].voiceDailyMinutes ??= 0;
    guild.users[user.id].roomMinutes ??= 0;
    guild.users[user.id].loveMinutes ??= 0;
    guild.users[user.id].eventPoints ??= 0;
    guild.users[user.id].eventWins ??= 0;
    guild.users[user.id].mafia ||= { games: 0, wins: 0, rating: 1000, mvp: 0, history: [] };
    guild.users[user.id].closes ||= { games: 0, wins: 0, rating: 0 };
    guild.users[user.id].cases ||= { common: 0, rare: 0, epic: 0 };
    guild.users[user.id].cases.common ??= 0;
    guild.users[user.id].cases.rare ??= 0;
    guild.users[user.id].cases.epic ??= 0;
    guild.users[user.id].rolePasses ??= 0;
    guild.users[user.id].personalRoleId ??= null;
    guild.users[user.id].roleCreatedAt ??= null;
    guild.users[user.id].roleRenewedAt ??= null;
    guild.users[user.id].rolePrice ??= 500;
    guild.users[user.id].rolePurchases ??= 0;
    guild.users[user.id].roleForSale ??= true;
    guild.users[user.id].purchasedRoles ||= [];
    guild.users[user.id].clanId ??= null;
    guild.users[user.id].lovePartnerId ??= null;
    guild.users[user.id].loveSince ??= null;
    guild.users[user.id].loveXp ??= 0;
    guild.users[user.id].loveMood ??= 70;
    guild.users[user.id].loveStreak ??= 0;
    guild.users[user.id].loveLastAction ??= 0;
    guild.users[user.id].loveLastActionDate ??= null;
    guild.users[user.id].casinoStats ||= {};
    guild.users[user.id].casinoStats.totalBet ??= 0;
    guild.users[user.id].casinoStats.totalPayout ??= 0;
    guild.users[user.id].casinoStats.games ??= 0;
    guild.users[user.id].casinoStats.wins ??= 0;
    guild.users[user.id].casinoStats.losses ??= 0;
    guild.users[user.id].casinoStats.biggestWin ??= 0;
    guild.users[user.id].casinoStats.history ||= [];
    guild.users[user.id].lastTimely ??= 0;
    guild.users[user.id].inventory ||= [];
    guild.users[user.id].cosmetics ||= {};
    guild.users[user.id].cosmetics.frames ||= ['default'];
    guild.users[user.id].cosmetics.colors ||= ['violet'];
    guild.users[user.id].cosmetics.backgrounds ||= ['onix'];
    guild.users[user.id].cosmetics.icons ||= ['spark'];
    guild.users[user.id].cosmetics.titles ||= ['Новичок Onix'];
    guild.users[user.id].cosmetics.badges ||= ['Onix'];
    guild.users[user.id].customization ||= {};
    guild.users[user.id].customization.frame ||= 'default';
    guild.users[user.id].customization.color ||= 'violet';
    guild.users[user.id].customization.background ||= 'onix';
    guild.users[user.id].customization.icon ||= 'spark';
    guild.users[user.id].customization.title ||= 'Новичок Onix';
    guild.users[user.id].customization.favoriteBadge ||= 'Onix';
    guild.users[user.id].favoriteRoles ||= [];
    guild.users[user.id].badges ||= ['Onix'];
    guild.users[user.id].achievements ||= [];
    // Миграция: старые достижения хранились строками, новый формат — { id, name, at }.
    guild.users[user.id].achievements = guild.users[user.id].achievements.map((item) =>
      typeof item === 'string' ? { id: null, name: item, at: 0 } : item
    );
    return guild.users[user.id];
  }

  getUser(guildId, userId) {
    return this.guild(guildId).users[userId] || null;
  }

  users(guildId) {
    return Object.values(this.guild(guildId).users);
  }

  addBalance(guildId, user, amount, note = 'system') {
    const profile = this.ensureUser(guildId, user);
    profile.balance = Math.max(0, Number(profile.balance || 0) + amount);
    this.recordTransaction(guildId, {
      type: amount >= 0 ? 'income' : 'expense',
      toId: user.id,
      amount: Math.abs(amount),
      note
    });
    return profile;
  }

  transfer(guildId, fromUser, toUser, amount, note = 'transfer') {
    const from = this.ensureUser(guildId, fromUser);
    const to = this.ensureUser(guildId, toUser);
    if (from.balance < amount) {
      throw new Error('INSUFFICIENT_FUNDS');
    }

    from.balance -= amount;
    to.balance += amount;
    this.recordTransaction(guildId, {
      type: 'transfer',
      fromId: fromUser.id,
      toId: toUser.id,
      amount,
      note
    });
    return { from, to };
  }

  recordCasinoResult(guildId, user, result) {
    const profile = this.ensureUser(guildId, user);
    const bet = Math.max(0, Number(result.bet || 0));
    const payout = Math.max(0, Number(result.payout || 0));
    if (profile.balance < bet) throw new Error('INSUFFICIENT_FUNDS');

    profile.balance += payout - bet;
    profile.casinoStats ||= {};
    profile.casinoStats.totalBet = Number(profile.casinoStats.totalBet || 0) + bet;
    profile.casinoStats.totalPayout = Number(profile.casinoStats.totalPayout || 0) + payout;
    profile.casinoStats.games = Number(profile.casinoStats.games || 0) + 1;
    if (payout > bet) profile.casinoStats.wins = Number(profile.casinoStats.wins || 0) + 1;
    if (payout < bet) profile.casinoStats.losses = Number(profile.casinoStats.losses || 0) + 1;
    profile.casinoStats.biggestWin = Math.max(Number(profile.casinoStats.biggestWin || 0), Math.max(0, payout - bet));
    profile.casinoStats.history ||= [];
    profile.casinoStats.history.unshift({
      createdAt: Date.now(),
      game: result.game,
      bet,
      payout,
      profit: payout - bet,
      details: result.details || ''
    });
    profile.casinoStats.history = profile.casinoStats.history.slice(0, 30);

    const profit = payout - bet;
    if (profit !== 0) {
      this.recordTransaction(guildId, {
        type: 'casino',
        [profit > 0 ? 'toId' : 'fromId']: user.id,
        amount: Math.abs(profit),
        note: result.note || (profit > 0 ? 'casino win' : 'casino lose')
      });
    }

    return profile;
  }

  relationshipForUser(guildId, userId) {
    const profile = this.getUser(guildId, userId);
    if (!profile?.lovePartnerId) return null;
    const key = relationKey(userId, profile.lovePartnerId);
    return this.guild(guildId).relationships[key] || null;
  }

  createLoveProposal(guildId, proposal) {
    const guild = this.guild(guildId);
    guild.loveProposals = guild.loveProposals.filter((item) =>
      item.status === 'active' && Date.now() - Number(item.createdAt || 0) < 10 * 60 * 1000
    );
    const entry = {
      id: proposal.id,
      proposerId: proposal.proposerId,
      targetId: proposal.targetId,
      message: proposal.message || '',
      status: 'active',
      createdAt: Date.now()
    };
    guild.loveProposals.unshift(entry);
    return entry;
  }

  getLoveProposal(guildId, proposalId) {
    return this.guild(guildId).loveProposals.find((item) => item.id === proposalId && item.status === 'active') || null;
  }

  closeLoveProposal(guildId, proposalId, status = 'closed') {
    const proposal = this.guild(guildId).loveProposals.find((item) => item.id === proposalId);
    if (!proposal) return null;
    proposal.status = status;
    proposal.closedAt = Date.now();
    return proposal;
  }

  createRelationship(guildId, userA, userB) {
    const profileA = this.ensureUser(guildId, userA);
    const profileB = this.ensureUser(guildId, userB);
    if (profileA.lovePartnerId || profileB.lovePartnerId) throw new Error('ALREADY_IN_RELATIONSHIP');

    const key = relationKey(userA.id, userB.id);
    const relationship = {
      id: key,
      users: [userA.id, userB.id],
      title: 'Новая история',
      xp: 0,
      mood: 70,
      streak: 0,
      createdAt: Date.now(),
      lastActionAt: 0,
      lastActionDate: null,
      actions: [],
      gifts: []
    };
    this.guild(guildId).relationships[key] = relationship;

    profileA.lovePartnerId = userB.id;
    profileB.lovePartnerId = userA.id;
    profileA.loveSince = relationship.createdAt;
    profileB.loveSince = relationship.createdAt;
    profileA.loveXp = 0;
    profileB.loveXp = 0;
    profileA.loveMood = 70;
    profileB.loveMood = 70;
    profileA.loveStreak = 0;
    profileB.loveStreak = 0;
    return relationship;
  }

  updateRelationshipTitle(guildId, userId, title) {
    const relationship = this.relationshipForUser(guildId, userId);
    if (!relationship) return null;
    relationship.title = title;
    return relationship;
  }

  addLoveAction(guildId, actorId, action) {
    const relationship = this.relationshipForUser(guildId, actorId);
    if (!relationship) return null;

    const today = todayKey();
    if (relationship.lastActionDate === today) {
      relationship.streak = Number(relationship.streak || 0);
    } else if (relationship.lastActionAt && Date.now() - relationship.lastActionAt <= 48 * 60 * 60 * 1000) {
      relationship.streak = Number(relationship.streak || 0) + 1;
    } else {
      relationship.streak = 1;
    }

    relationship.xp = Number(relationship.xp || 0) + Number(action.xp || 0);
    relationship.mood = Math.max(0, Math.min(100, Number(relationship.mood || 70) + Number(action.mood || 0)));
    relationship.lastActionAt = Date.now();
    relationship.lastActionDate = today;
    relationship.actions ||= [];
    relationship.actions.unshift({
      actorId,
      type: action.type,
      label: action.label,
      mood: action.mood || 0,
      xp: action.xp || 0,
      createdAt: Date.now()
    });
    relationship.actions = relationship.actions.slice(0, 20);

    for (const userId of relationship.users) {
      const profile = this.getUser(guildId, userId);
      if (!profile) continue;
      profile.loveXp = relationship.xp;
      profile.loveMood = relationship.mood;
      profile.loveStreak = relationship.streak;
      profile.loveLastAction = relationship.lastActionAt;
      profile.loveLastActionDate = relationship.lastActionDate;
      profile.loveMinutes = Number(profile.loveMinutes || 0) + Math.ceil(Number(action.xp || 0) / 5);
    }

    return relationship;
  }

  endRelationship(guildId, userId) {
    const relationship = this.relationshipForUser(guildId, userId);
    if (!relationship) return null;
    for (const partnerId of relationship.users) {
      const profile = this.getUser(guildId, partnerId);
      if (!profile) continue;
      profile.lovePartnerId = null;
      profile.loveSince = null;
      profile.loveMood = 50;
      profile.loveStreak = 0;
    }
    relationship.status = 'ended';
    relationship.endedAt = Date.now();
    delete this.guild(guildId).relationships[relationship.id];
    return relationship;
  }

  recordTransaction(guildId, transaction) {
    const guild = this.guild(guildId);
    guild.transactions.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
      ...transaction
    });
    guild.transactions = guild.transactions.slice(0, 300);
  }

  transactionsFor(guildId, userId, limit = 10) {
    return this.guild(guildId).transactions
      .filter((item) => item.fromId === userId || item.toId === userId)
      .slice(0, limit);
  }

  addVoiceMinutes(guildId, userId, minutes) {
    const profile = this.getUser(guildId, userId);
    if (!profile) return null;
    const key = todayKey();
    if (profile.voiceDailyDate !== key) {
      profile.voiceDailyDate = key;
      profile.voiceDailyMinutes = 0;
    }
    profile.voiceMinutes = Number(profile.voiceMinutes || 0) + minutes;
    profile.voiceDailyMinutes = Number(profile.voiceDailyMinutes || 0) + minutes;
    this.addActivity(guildId, userId, minutes);
    this.addClanWarScore(guildId, userId, Math.floor(minutes / 10) * 5, 'voice');
    this.progressClanQuest(guildId, userId, 'voice_120', minutes);
    return profile;
  }

  // Активность: лёгкие события { t, w } в скользящем окне для тегов «#Самый активный».
  addActivity(guildId, userId, weight = 1) {
    const profile = this.getUser(guildId, userId);
    if (!profile || !weight) return null;
    profile.activity ||= { recent: [] };
    profile.activity.recent ||= [];
    const now = Date.now();
    profile.activity.recent.push({ t: now, w: weight });
    const cutoff = now - ACTIVITY_MAX_WINDOW_MS;
    profile.activity.recent = profile.activity.recent
      .filter((event) => event.t >= cutoff)
      .slice(-ACTIVITY_MAX_EVENTS);
    return profile;
  }

  addMessage(guildId, user) {
    const profile = this.ensureUser(guildId, user);
    profile.messages = Number(profile.messages || 0) + 1;
    this.addActivity(guildId, user.id, 1);
    return profile;
  }

  activityInWindow(guildId, userId, windowMs = ACTIVITY_MAX_WINDOW_MS) {
    const profile = this.getUser(guildId, userId);
    const recent = profile?.activity?.recent;
    if (!recent || recent.length === 0) return 0;
    const cutoff = Date.now() - windowMs;
    let sum = 0;
    for (const event of recent) {
      if (event.t >= cutoff) sum += Number(event.w || 0);
    }
    return sum;
  }

  // Позиция пользователя по активности за окно среди всех с ненулевой активностью.
  activityRank(guildId, userId, windowMs = ACTIVITY_MAX_WINDOW_MS) {
    const scored = this.users(guildId)
      .map((user) => ({ id: user.id, score: this.activityInWindow(guildId, user.id, windowMs) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    const index = scored.findIndex((entry) => entry.id === userId);
    return { rank: index === -1 ? 0 : index + 1, total: scored.length };
  }

  addReport(guildId, report) {
    const guild = this.guild(guildId);
    guild.reports.unshift({ createdAt: Date.now(), status: 'ожидает проверки', actions: [], ...report });
    guild.reports = guild.reports.slice(0, 100);
  }

  updateReport(guildId, reportId, patch) {
    const report = this.guild(guildId).reports.find((item) => item.id === reportId);
    if (!report) return null;
    Object.assign(report, patch);
    return report;
  }

  // ---- Тикеты (обращения) ----
  // Единый источник правды для тикетов: и Discord-команды, и веб-дашборд
  // ходят через эти методы. Старые тикеты без messages/source остаются валидны.
  tickets(guildId) {
    return this.guild(guildId).tickets;
  }

  addTicket(guildId, ticket) {
    const guild = this.guild(guildId);
    const record = {
      id: ticket.id || `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`,
      status: 'open',
      source: 'discord',
      messages: [],
      createdAt: Date.now(),
      ...ticket
    };
    guild.tickets.unshift(record);
    guild.tickets = guild.tickets.slice(0, 200);
    return record;
  }

  getTicket(guildId, ticketId) {
    return this.guild(guildId).tickets.find((item) => item.id === ticketId) || null;
  }

  updateTicket(guildId, ticketId, patch) {
    const ticket = this.getTicket(guildId, ticketId);
    if (!ticket) return null;
    Object.assign(ticket, patch);
    return ticket;
  }

  // author: 'user' | 'admin'; viaBot — было ли отправлено в Discord ботом.
  addTicketMessage(guildId, ticketId, { author, body, viaBot = false } = {}) {
    const ticket = this.getTicket(guildId, ticketId);
    if (!ticket) return null;
    ticket.messages ||= [];
    const message = { at: Date.now(), author: author || 'admin', body: String(body || ''), viaBot };
    ticket.messages.push(message);
    return message;
  }

  closeTicket(guildId, ticketId) {
    return this.updateTicket(guildId, ticketId, { status: 'closed', closedAt: Date.now() });
  }

  addModerationAction(guildId, action) {
    const guild = this.guild(guildId);
    guild.moderationHistory.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
      ...action
    });
    guild.moderationHistory = guild.moderationHistory.slice(0, 500);
  }

  moderationHistoryFor(guildId, userId, limit = 10) {
    return this.guild(guildId).moderationHistory
      .filter((item) => item.targetId === userId)
      .slice(0, limit);
  }

  addCaseHistory(guildId, entry) {
    const guild = this.guild(guildId);
    guild.caseHistory.unshift({ createdAt: Date.now(), ...entry });
    guild.caseHistory = guild.caseHistory.slice(0, 200);
  }

  caseHistoryFor(guildId, userId, limit = 10) {
    return this.guild(guildId).caseHistory
      .filter((item) => item.userId === userId)
      .slice(0, limit);
  }

  topUsers(guildId, selector, limit = 10) {
    return this.users(guildId)
      .slice()
      .sort((a, b) => selector(b) - selector(a))
      .slice(0, limit);
  }

  personalRoleListings(guildId) {
    return this.users(guildId)
      .filter((user) => user.personalRoleId && user.roleForSale !== false)
      .sort((a, b) => (b.rolePurchases || 0) - (a.rolePurchases || 0));
  }

  clans(guildId) {
    return Object.values(this.guild(guildId).clans);
  }

  createClan(guildId, data) {
    const clan = createClanData(data);
    this.guild(guildId).clans[clan.id] = clan;
    return clan;
  }

  ensureClanShape(clan) {
    clan.rating ??= 0;
    clan.level ??= 1;
    clan.xp ??= 0;
    clan.bank ??= 0;
    clan.seasonPoints ??= 0;
    clan.roles ||= [];
    clan.unlocks ||= [];
    clan.quests ||= createClanData({ id: clan.id, name: clan.name, description: clan.description, ownerId: clan.ownerId }).quests;
    return clan;
  }

  findClan(guildId, query) {
    const value = String(query || '').toLowerCase();
    return this.clans(guildId).find((clan) =>
      clan.id === query || String(clan.name || '').toLowerCase() === value
    );
  }

  userClan(guildId, userId) {
    const user = this.getUser(guildId, userId);
    if (!user?.clanId) return null;
    const clan = this.guild(guildId).clans[user.clanId] || null;
    return clan ? this.ensureClanShape(clan) : null;
  }

  leaveClan(guildId, userId) {
    const user = this.getUser(guildId, userId);
    if (!user?.clanId) return null;
    const clan = this.guild(guildId).clans[user.clanId] || null;
    if (clan?.members) {
      clan.members = clan.members.filter((id) => id !== userId);
    }
    user.clanId = null;
    return clan;
  }

  activeWarForClan(guildId, clanId) {
    const now = Date.now();
    return this.guild(guildId).clanWars.find((war) =>
      war.status === 'active' &&
      war.endsAt > now &&
      (war.clanAId === clanId || war.clanBId === clanId)
    ) || null;
  }

  createClanWar(guildId, clanAId, clanBId) {
    const war = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      clanAId,
      clanBId,
      scoreA: 0,
      scoreB: 0,
      status: 'active',
      createdAt: Date.now(),
      endsAt: Date.now() + 24 * 60 * 60 * 1000
    };
    this.guild(guildId).clanWars.unshift(war);
    this.guild(guildId).clanWars = this.guild(guildId).clanWars.slice(0, 100);
    return war;
  }

  addClanWarScore(guildId, userId, points, source = 'activity') {
    if (!points) return null;
    const clan = this.userClan(guildId, userId);
    if (!clan) return null;
    const war = this.activeWarForClan(guildId, clan.id);
    if (!war) return null;
    const earnedPoints = Number(clan.level || 1) >= 4 ? Math.ceil(points * 1.2) : points;
    if (war.clanAId === clan.id) war.scoreA += earnedPoints;
    if (war.clanBId === clan.id) war.scoreB += earnedPoints;
    war.lastSource = source;
    war.lastPoints = earnedPoints;
    war.updatedAt = Date.now();
    return war;
  }

  finishClanWar(guildId, warId) {
    const guild = this.guild(guildId);
    const war = guild.clanWars.find((item) => item.id === warId);
    if (!war || war.status !== 'active') return null;

    const clanA = guild.clans[war.clanAId];
    const clanB = guild.clans[war.clanBId];
    if (!clanA || !clanB) return null;
    this.ensureClanShape(clanA);
    this.ensureClanShape(clanB);

    const winner = war.scoreA >= war.scoreB ? clanA : clanB;
    winner.xp += 500;
    winner.bank += 1000;
    winner.seasonPoints += 50;
    winner.rating += 25;
    war.status = 'finished';
    war.winnerId = winner.id;
    war.finishedAt = Date.now();
    return { war, winner };
  }

  progressClanQuest(guildId, userId, questId, amount) {
    const clan = this.userClan(guildId, userId);
    if (!clan) return null;
    const quest = clan.quests.find((item) => item.id === questId);
    if (!quest || quest.completed) return null;
    quest.progress = Math.min(quest.target, Number(quest.progress || 0) + amount);
    if (quest.progress >= quest.target) {
      quest.completed = true;
      const reward = Number(clan.level || 1) >= 7 ? Math.ceil(quest.reward * 1.15) : quest.reward;
      clan.bank += reward;
      clan.xp += reward;
      clan.seasonPoints += Math.ceil(reward / 20);
    }
    return quest;
  }

  addMarketListing(guildId, listing) {
    const guild = this.guild(guildId);
    guild.marketListings.unshift({
      id: `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`,
      status: 'active',
      createdAt: Date.now(),
      ...listing
    });
    return guild.marketListings[0];
  }

  activeMarketListings(guildId) {
    return this.guild(guildId).marketListings.filter((item) => item.status === 'active');
  }

  addAuction(guildId, auction) {
    const guild = this.guild(guildId);
    guild.auctions.unshift({
      id: `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`,
      status: 'active',
      bids: [],
      createdAt: Date.now(),
      endsAt: Date.now() + 24 * 60 * 60 * 1000,
      ...auction
    });
    return guild.auctions[0];
  }

  activeAuctions(guildId) {
    return this.guild(guildId).auctions.filter((item) => item.status === 'active' && item.endsAt > Date.now());
  }

  // Структурированный предмет инвентаря. Старые записи — строки "type: name",
  // читаются толерантно в местах отображения.
  addInventoryItem(guildId, userId, { type, name, source = 'system' }) {
    const profile = this.guild(guildId).users[userId];
    if (!profile) return null;
    profile.inventory ||= [];
    const item = {
      id: `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`,
      type,
      name,
      source,
      at: Date.now()
    };
    profile.inventory.push(item);
    return item;
  }

  // Расчёт истёкших аукционов: предмет победителю, деньги продавцу минус комиссия.
  // Списание у победителя уже произошло при ставке (market.js). Возвращает
  // список рассчитанных аукционов (пусто, если нечего считать).
  settleExpiredAuctions(guildId, commission = 0.08) {
    const guild = this.guild(guildId);
    const now = Date.now();
    const settled = [];
    for (const auction of guild.auctions) {
      if (auction.status !== 'active' || Number(auction.endsAt || 0) > now) continue;
      if (auction.currentBidderId) {
        this.addInventoryItem(guildId, auction.currentBidderId, { type: auction.type, name: auction.name, source: 'auction' });
        const fee = Math.ceil(auction.currentBid * commission);
        const seller = this.getUser(guildId, auction.sellerId);
        if (seller) seller.balance = Number(seller.balance || 0) + auction.currentBid - fee;
        this.recordTransaction(guildId, {
          type: 'auction',
          fromId: auction.currentBidderId,
          toId: auction.sellerId,
          amount: auction.currentBid,
          note: `аукцион: ${auction.name}, комиссия ${fee}`
        });
        auction.status = 'sold';
        auction.winnerId = auction.currentBidderId;
      } else {
        auction.status = 'expired';
      }
      auction.settledAt = now;
      settled.push(auction);
    }
    return settled;
  }

  addEvent(guildId, event) {
    const guild = this.guild(guildId);
    guild.events.unshift({
      id: `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`,
      participants: [],
      status: 'набор открыт',
      createdAt: Date.now(),
      ...event
    });
    return guild.events[0];
  }

  addDuel(guildId, duel) {
    const guild = this.guild(guildId);
    guild.duels.unshift({ status: 'active', ...duel });
    guild.duels = guild.duels
      .filter((item) => item.status === 'active' || Date.now() - Number(item.createdAt || 0) < 60 * 60 * 1000)
      .slice(0, 100);
    return guild.duels[0];
  }

  getDuel(guildId, duelId) {
    return this.guild(guildId).duels.find((duel) => duel.id === duelId && duel.status === 'active') || null;
  }

  closeDuel(guildId, duelId, status = 'closed') {
    const duel = this.guild(guildId).duels.find((item) => item.id === duelId);
    if (!duel) return null;
    duel.status = status;
    duel.closedAt = Date.now();
    return duel;
  }

  activeEvents(guildId) {
    return this.guild(guildId).events.filter((event) => event.status !== 'завершён');
  }

  backupPath() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(path.dirname(this.filePath), `backup-${stamp}.db`);
  }

  async backup() {
    const target = this.backupPath();
    await fs.mkdir(path.dirname(target), { recursive: true });
    await this.db.backup(target);
    return target;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = Store;
