import { useEffect, useState } from 'react';
import { api } from '../api.js';

const CURRENCIES = [
  { value: 'balance', label: 'Монеты 🪙' },
  { value: 'lotuses', label: 'Лотусы 🌸' },
  { value: 'snowballs', label: 'Снежки ❄️' }
];

export default function Users({ ctx }) {
  const { gid } = ctx;
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [currency, setCurrency] = useState('balance');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  function load() {
    if (!gid) return;
    setLoading(true);
    api.users(gid, q).then((list) => { setUsers(list); setLoading(false); }).catch(() => setLoading(false));
  }
  // Дебаунс поиска.
  useEffect(() => {
    if (!gid) return;
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [gid, q]);

  function flash(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 2600); }

  async function apply(e) {
    e.preventDefault();
    const value = Math.trunc(Number(amount));
    if (!selected || !Number.isFinite(value) || value === 0) return;
    setBusy(true);
    try {
      const updated = await api.adjustUser(gid, selected.id, { currency, amount: value, reason });
      setSelected(updated);
      setUsers((list) => list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      setAmount('');
      setReason('');
      flash('Баланс обновлён');
    } catch (err) { flash(err.message, false); }
    setBusy(false);
  }

  if (!gid) return <div className="empty">Нет доступных серверов.</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Экономика</div>
          <h1 className="page-title">Пользователи</h1>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по имени или ID…" style={{ minWidth: 220 }} />
      </div>

      {selected && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="page-head" style={{ marginBottom: 12 }}>
            <div>
              <div className="title" style={{ fontSize: 18 }}>{selected.username || selected.id}</div>
              <div className="sub">ID: {selected.id}</div>
            </div>
            <button onClick={() => setSelected(null)}>Закрыть</button>
          </div>
          <div className="grid cols-3" style={{ marginBottom: 14 }}>
            <div className="panel stat"><div className="k">Монеты</div><div className="v accent">{selected.balance}</div></div>
            <div className="panel stat"><div className="k">Лотусы</div><div className="v gold">{selected.lotuses}</div></div>
            <div className="panel stat"><div className="k">Снежки</div><div className="v info">{selected.snowballs}</div></div>
          </div>
          <form onSubmit={apply}>
            <div className="btn-row" style={{ marginBottom: 12 }}>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="± количество" style={{ width: 140 }} />
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина (необязательно)" style={{ flex: 1, minWidth: 160 }} />
            </div>
            <button className="primary" type="submit" disabled={busy || !amount}>Применить</button>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Отрицательное число — списание. Баланс не уходит ниже нуля.</p>
          </form>
        </div>
      )}

      {loading ? <div className="empty">Загрузка…</div>
        : users.length === 0 ? <div className="empty">Никого не найдено.</div>
        : users.map((u) => (
          <div className="row" key={u.id} onClick={() => setSelected(u)} style={{ cursor: 'pointer' }}>
            <div className="grow">
              <div className="title">{u.username || u.id}</div>
              <div className="sub">🪙 {u.balance} · 🌸 {u.lotuses} · ❄️ {u.snowballs} · 💬 {u.messages}</div>
            </div>
            <button className="primary" onClick={(e) => { e.stopPropagation(); setSelected(u); }}>Управлять</button>
          </div>
        ))}

      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`}>{toast.msg}</div>}
    </>
  );
}
