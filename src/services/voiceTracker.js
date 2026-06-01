function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function createVoiceTracker(store) {
  const sessions = new Map();

  function start(guildId, userId, startedAt = Date.now()) {
    sessions.set(sessionKey(guildId, userId), startedAt);
  }

  function isTracking(guildId, userId) {
    return sessions.has(sessionKey(guildId, userId));
  }

  async function stop(guildId, userId) {
    const key = sessionKey(guildId, userId);
    const startedAt = sessions.get(key);
    if (!startedAt) return 0;

    sessions.delete(key);
    const minutes = Math.max(1, Math.floor((Date.now() - startedAt) / 60000));
    store.addVoiceMinutes(guildId, userId, minutes);
    await store.save();
    return minutes;
  }

  function currentMinutes(guildId, userId) {
    const startedAt = sessions.get(sessionKey(guildId, userId));
    if (!startedAt) return 0;
    return Math.max(1, Math.floor((Date.now() - startedAt) / 60000));
  }

  async function syncMember(member) {
    if (!member?.guild?.id || !member.user || member.user.bot) return 0;

    const guildId = member.guild.id;
    store.ensureUser(guildId, member.user);
    if (member.voice?.channelId) {
      if (!isTracking(guildId, member.id)) start(guildId, member.id);
      await store.save();
      return currentMinutes(guildId, member.id);
    }

    if (isTracking(guildId, member.id)) return stop(guildId, member.id);
    return 0;
  }

  function hydrate(client) {
    for (const guild of client.guilds.cache.values()) {
      for (const state of guild.voiceStates.cache.values()) {
        if (!state.member?.user.bot && state.channelId) {
          store.ensureUser(guild.id, state.member.user);
          start(guild.id, state.member.id);
        }
      }
    }
  }

  async function stopAll() {
    const entries = [...sessions.keys()];
    for (const key of entries) {
      const [guildId, userId] = key.split(':');
      await stop(guildId, userId);
    }
  }

  async function handleVoiceStateUpdate(oldState, newState) {
    const user = newState.member?.user || oldState.member?.user;
    if (!user || user.bot) return;

    const guildId = newState.guild.id;
    store.ensureUser(guildId, user);

    if (!oldState.channelId && newState.channelId) {
      start(guildId, user.id);
      await store.save();
      return;
    }

    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId && !isTracking(guildId, user.id)) {
      start(guildId, user.id);
      await store.save();
      return;
    }

    if (oldState.channelId && !newState.channelId) {
      await stop(guildId, user.id);
    }
  }

  return {
    currentMinutes,
    handleVoiceStateUpdate,
    hydrate,
    isTracking,
    syncMember,
    stopAll
  };
}

module.exports = createVoiceTracker;
