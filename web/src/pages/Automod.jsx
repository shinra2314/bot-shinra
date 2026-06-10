import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Числовые поля. ms-поля показываем в секундах и конвертируем при сохранении.
const NUM_FIELDS = [
  { key: 'spamCount', label: 'Антиспам: сообщений за окно', hint: 'Порог числа сообщений' },
  { key: 'spamWindowMs', label: 'Антиспам: окно (сек)', hint: 'За сколько секунд считаем', unit: 'sec' },
  { key: 'mentionLimit', label: 'Лимит упоминаний за сообщение', hint: 'Массовый пинг' },
  { key: 'mentionRate', label: 'Частый пинг: упоминаний за окно', hint: 'Суммарно по сообщениям' },
  { key: 'mentionRateMs', label: 'Частый пинг: окно (сек)', hint: 'За сколько секунд', unit: 'sec' },
  { key: 'emojiLimit', label: 'Лимит эмодзи', hint: 'Больше — нарушение' },
  { key: 'newlineLimit', label: 'Лимит переносов строк', hint: 'Стена текста' }
];

const BOOL_FIELDS = [
  { key: 'enabled', label: 'Автомодерация включена' },
  { key: 'blockInvites', label: 'Блокировать инвайты Discord' },
  { key: 'blockLinks', label: 'Блокировать внешние ссылки (кроме whitelist)' },
  { key: 'capsEnabled', label: 'Ловить капс (крик заглавными)' }
];

export default function Automod({ ctx }) {
  const { gid } = ctx;
  const [cfg, setCfg] = useState(null);
  const [draft, setDraft] = useState({});
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  function load() {
    if (!gid) return;
    api.automod(gid).then((c) => {
      setCfg(c);
      const d = { ...c };
      d.spamWindowMs = Math.round((c.spamWindowMs || 0) / 1000);
      d.mentionRateMs = Math.round((c.mentionRateMs || 0) / 1000);
      d.badwords = (c.badwords || []).join('\n');
      d.linkWhitelist = (c.linkWhitelist || []).join('\n');
      d.bypassRoleIds = (c.bypassRoleIds || []).join(', ');
      setDraft(d);
    }).catch(() => setCfg(false));
    api.automodLog(gid).then(setLog).catch(() => setLog([]));
  }
  useEffect(load, [gid]);

  function flash(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 2600); }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const patch = {};
      for (const f of NUM_FIELDS) {
        let v = Number(draft[f.key]);
        if (!Number.isFinite(v) || v < 0) continue;
        if (f.unit === 'sec') v *= 1000;
        patch[f.key] = v;
      }
      for (const f of BOOL_FIELDS) patch[f.key] = Boolean(draft[f.key]);
      patch.badwords = String(draft.badwords || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      patch.linkWhitelist = String(draft.linkWhitelist || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      patch.bypassRoleIds = String(draft.bypassRoleIds || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      const updated = await api.patchAutomod(gid, patch);
      setCfg(updated);
      flash('Настройки сохранены');
    } catch (err) { flash(err.message, false); }
    setBusy(false);
  }

  if (!gid) return <div className="empty">Нет доступных серверов.</div>;
  if (cfg === false) return <div className="empty">Не удалось загрузить настройки.</div>;
  if (!cfg) return <div className="empty">Загрузка…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Защита сервера</div>
          <h1 className="page-title">Автомодерация</h1>
        </div>
      </div>

      <form className="panel" onSubmit={save}>
        {BOOL_FIELDS.map((f) => (
          <label className="field" key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={Boolean(draft[f.key])}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))}
              style={{ width: 18, height: 18 }}
            />
            <span>{f.label}</span>
          </label>
        ))}

        {NUM_FIELDS.map((f) => (
          <label className="field" key={f.key}>
            <span>{f.label}</span>
            <input
              type="number"
              min="0"
              value={draft[f.key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{f.hint}</p>
          </label>
        ))}

        <label className="field"><span>Запрещённые слова (через запятую или с новой строки)</span>
          <textarea value={draft.badwords ?? ''} onChange={(e) => setDraft((d) => ({ ...d, badwords: e.target.value }))} placeholder="слово1, слово2…" />
        </label>
        <label className="field"><span>Белый список доменов для ссылок</span>
          <textarea value={draft.linkWhitelist ?? ''} onChange={(e) => setDraft((d) => ({ ...d, linkWhitelist: e.target.value }))} placeholder="google., youtube.…" />
        </label>
        <label className="field"><span>ID ролей-исключений (автомод их не трогает)</span>
          <input type="text" value={draft.bypassRoleIds ?? ''} onChange={(e) => setDraft((d) => ({ ...d, bypassRoleIds: e.target.value }))} placeholder="123..., 456..." />
        </label>

        <button className="primary" type="submit" disabled={busy}>Сохранить</button>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Администраторы и участники с ролями-исключениями не модерируются. Эскалация: {(cfg.timeoutSteps || []).map((s) => `${s.strikes} страйк → ${Math.round(s.ms / 60000)} мин мут`).join(', ') || '—'}.
        </p>
      </form>

      <div className="page-head" style={{ marginTop: 24 }}>
        <div><div className="eyebrow">Журнал</div><h2 className="page-title" style={{ fontSize: 20 }}>Последние срабатывания</h2></div>
      </div>
      <div className="panel">
        {log.length === 0 ? <div className="muted">Пока пусто.</div> : log.map((e) => (
          <div key={e.id} className="field" style={{ borderBottom: '1px solid rgba(255,255,255,.06)', paddingBottom: 8 }}>
            <span><strong>{e.userName || e.userId}</strong> — {(e.rules || []).join(', ')}</span>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>{new Date(e.createdAt).toLocaleString('ru-RU')} · {e.content || '—'}</p>
          </div>
        ))}
      </div>

      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`}>{toast.msg}</div>}
    </>
  );
}
