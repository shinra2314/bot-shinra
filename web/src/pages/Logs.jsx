import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

export default function Logs({ ctx }) {
  const { gid } = ctx;
  const [catalog, setCatalog] = useState({});
  const [config, setConfig] = useState(null);
  const [channels, setChannels] = useState([]);
  const [master, setMaster] = useState('');
  const [events, setEvents] = useState({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  function load() {
    if (!gid) return;
    api.logs(gid).then(({ config: cfg, catalog: cat }) => {
      setCatalog(cat);
      setConfig(cfg);
      setMaster(cfg.logChannelId || '');
      setEvents(cfg.events || {});
    }).catch(() => setConfig(false));
    api.channels(gid).then(setChannels).catch(() => setChannels([]));
  }
  useEffect(load, [gid]);

  // Группировка событий по категориям из каталога.
  const groups = useMemo(() => {
    const out = {};
    for (const [key, meta] of Object.entries(catalog)) {
      (out[meta.category] ||= []).push({ key, ...meta });
    }
    return out;
  }, [catalog]);

  function flash(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 2600); }

  function setEvent(key, patch) {
    setEvents((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await api.patchLogs(gid, { logChannelId: master || null, events });
      setConfig(updated.config);
      setEvents(updated.config.events || {});
      flash('Логи сохранены');
    } catch (err) { flash(err.message, false); }
    setBusy(false);
  }

  if (!gid) return <div className="empty">Нет доступных серверов.</div>;
  if (config === false) return <div className="empty">Не удалось загрузить настройки.</div>;
  if (!config) return <div className="empty">Загрузка…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Аудит сервера</div>
          <h1 className="page-title">Логи событий</h1>
        </div>
      </div>

      <form className="panel" onSubmit={save}>
        <label className="field"><span>Мастер-канал логов (по умолчанию для всех событий)</span>
          <select value={master} onChange={(e) => setMaster(e.target.value)} style={{ width: '100%' }}>
            <option value="">— не задан —</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.canSend}>#{c.name}{c.canSend ? '' : ' — нет прав'}</option>
            ))}
          </select>
        </label>

        {Object.entries(groups).map(([category, items]) => (
          <div key={category} style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{category}</div>
            {items.map((ev) => {
              const cur = events[ev.key] || {};
              return (
                <div key={ev.key} className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    type="checkbox"
                    checked={cur.enabled !== false}
                    onChange={(e) => setEvent(ev.key, { enabled: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ flex: 1, minWidth: 220 }}>{ev.icon} {ev.label}</span>
                  <select
                    value={cur.channelId || ''}
                    onChange={(e) => setEvent(ev.key, { channelId: e.target.value || null })}
                    style={{ minWidth: 180 }}
                  >
                    <option value="">Мастер-канал</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id} disabled={!c.canSend}>#{c.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        ))}

        <button className="primary" type="submit" disabled={busy} style={{ marginTop: 16 }}>Сохранить</button>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Если задан мастер-канал, события пишутся по умолчанию — сними флажок, чтобы отключить нужное.
          Без своего канала событие идёт в мастер-канал. Голос, вход/выход и баны требуют включённых привилегированных интентов у бота.
        </p>
      </form>

      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`}>{toast.msg}</div>}
    </>
  );
}
