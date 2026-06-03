import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Подписи и подсказки для редактируемых ключей экономики.
const FIELDS = [
  { key: 'startBalance', label: 'Стартовый баланс', hint: 'Монеты при первом появлении пользователя' },
  { key: 'timelyReward', label: 'Награда /timely (монеты)', hint: 'Сколько монет даёт печенье' },
  { key: 'timelySnowballs', label: 'Награда /timely (снежки)', hint: 'Сколько снежков даёт печенье' },
  { key: 'timelyCooldownHours', label: 'Кулдаун /timely (часы)', hint: 'Через сколько часов снова доступно' },
  { key: 'personalRolePrice', label: 'Цена личной роли', hint: 'Стоимость создания личной роли' }
];

export default function Settings({ ctx }) {
  const { gid } = ctx;
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  function load() {
    if (!gid) return;
    api.settings(gid).then((s) => {
      setSettings(s);
      const d = {};
      for (const f of FIELDS) d[f.key] = String(s[f.key]?.value ?? '');
      setDraft(d);
    }).catch(() => setSettings(false));
  }
  useEffect(load, [gid]);

  function flash(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 2600); }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const patch = {};
      for (const f of FIELDS) patch[f.key] = draft[f.key] === '' ? null : Number(draft[f.key]);
      const updated = await api.patchSettings(gid, patch);
      setSettings(updated);
      flash('Настройки сохранены');
    } catch (err) { flash(err.message, false); }
    setBusy(false);
  }

  async function reset(key) {
    setBusy(true);
    try {
      const updated = await api.patchSettings(gid, { [key]: null });
      setSettings(updated);
      setDraft((d) => ({ ...d, [key]: String(updated[key]?.value ?? '') }));
      flash('Сброшено к дефолту');
    } catch (err) { flash(err.message, false); }
    setBusy(false);
  }

  if (!gid) return <div className="empty">Нет доступных серверов.</div>;
  if (settings === false) return <div className="empty">Не удалось загрузить настройки.</div>;
  if (!settings) return <div className="empty">Загрузка…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Конфигурация</div>
          <h1 className="page-title">Экономика</h1>
        </div>
      </div>

      <form className="panel" onSubmit={save}>
        {FIELDS.map((f) => {
          const meta = settings[f.key] || {};
          return (
            <label className="field" key={f.key}>
              <span>
                {f.label}
                {meta.overridden ? <em className="muted" style={{ marginLeft: 8, fontStyle: 'normal' }}>· изменено (дефолт {meta.default})</em> : null}
              </span>
              <div className="btn-row" style={{ marginTop: 0 }}>
                <input
                  type="number"
                  min="0"
                  value={draft[f.key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  placeholder={String(meta.default ?? '')}
                  style={{ flex: 1, minWidth: 160 }}
                />
                {meta.overridden ? (
                  <button type="button" onClick={() => reset(f.key)} disabled={busy}>Сброс</button>
                ) : null}
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{f.hint}</p>
            </label>
          );
        })}
        <button className="primary" type="submit" disabled={busy}>Сохранить</button>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Изменения применяются мгновенно для этого сервера. Пустое поле = вернуть дефолт.</p>
      </form>

      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`}>{toast.msg}</div>}
    </>
  );
}
