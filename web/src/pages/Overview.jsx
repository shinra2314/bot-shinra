import { useEffect, useState } from 'react';
import { api } from '../api.js';

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}ч ${m}м`;
}

export default function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = () => api.overview().then(setData).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  if (error) return <div className="empty">Ошибка: {error}</div>;
  if (!data) return <div className="empty">Загрузка…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Onix · мониторинг</div>
          <h1 className="page-title">Обзор</h1>
        </div>
        <div className="bot-id">
          {data.botAvatar && <img className="bot-avatar" src={data.botAvatar} alt="" />}
          <span className="muted">{data.botTag || '—'}</span>
        </div>
      </div>

      <div className="grid cols-4">
        <div className="panel stat"><div className="k">Серверов</div><div className="v accent">{data.guildCount}</div></div>
        <div className="panel stat"><div className="k">Пользователей</div><div className="v">{data.totals.users}</div></div>
        <div className="panel stat"><div className="k">Открытых тикетов</div><div className="v info">{data.totals.openTickets}</div></div>
        <div className="panel stat"><div className="k">Жалоб</div><div className="v gold">{data.totals.reports}</div></div>
      </div>

      <div className="grid cols-3" style={{ marginTop: 16 }}>
        <div className="panel stat"><div className="k">Пинг шлюза</div><div className="v success">{data.ping} ms</div></div>
        <div className="panel stat"><div className="k">Аптайм</div><div className="v">{fmtUptime(data.uptimeMs)}</div></div>
        <div className="panel stat"><div className="k">WS статус</div><div className="v">{data.wsStatus === 0 ? 'READY' : data.wsStatus}</div></div>
      </div>
    </>
  );
}
