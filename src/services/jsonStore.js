const fs = require('node:fs/promises');
const path = require('node:path');

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
    transactions: [],
    caseHistory: [],
    reports: [],
    moderationHistory: [],
    tickets: [],
    tempRooms: {}
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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
    lastTimely: 0,
    timelyStreak: 0,
    lastRepGiven: 0,
    messageCount: 0,
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

class JsonStore {
  constructor(filePath, config) {
    this.filePath = filePath;
    this.config = config;
    this.data = createDefaultData();
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.data = JSON.parse(raw);
      if (!this.data.guilds) this.data.guilds = {};
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.data = createDefaultData();
      await this.save();
    }
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(() => fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8'))
      .then(() => fs.rename(tmp, this.filePath));
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
    guild.users[user.id].lastTimely ??= 0;
    guild.users[user.id].timelyStreak ??= 0;
    guild.users[user.id].lastRepGiven ??= 0;
    guild.users[user.id].messageCount ??= 0;
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
    this.addClanWarScore(guildId, userId, Math.floor(minutes / 10) * 5, 'voice');
    this.progressClanQuest(guildId, userId, 'voice_120', minutes);
    return profile;
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
    if (war.clanAId === clan.id) war.scoreA += points;
    if (war.clanBId === clan.id) war.scoreB += points;
    war.lastSource = source;
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
      clan.bank += quest.reward;
      clan.xp += quest.reward;
      clan.seasonPoints += Math.ceil(quest.reward / 20);
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

  activeEvents(guildId) {
    return this.guild(guildId).events.filter((event) => event.status !== 'завершён');
  }

  backupPath() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(path.dirname(this.filePath), `backup-${stamp}.json`);
  }

  async backup() {
    const target = this.backupPath();
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(this.data, null, 2), 'utf8');
    return target;
  }
}

module.exports = JsonStore;
