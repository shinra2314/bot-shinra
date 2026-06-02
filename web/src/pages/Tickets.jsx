import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

// Тикеты создаются только Discord-командой /ticket. Сайт — просмотр и обработка.
export default function Tickets({ ctx }) {
  const { gid } = ctx;
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gid) return;
    setLoading(true);
    api.tickets(gid, filter).then((t) => { setTickets(t); setLoading(false); }).catch(() => setLoading(false));
  }, [gid, filter]);

  if (!gid) return <div className="empty">Нет доступных серверов.</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Поддержка</div>
          <h1 className="page-title">Тикеты</h1>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Все</option>
          <option value="open">Открытые</option>
          <option value="closed">Закрытые</option>
        </select>
      </div>

      {loading ? <div className="empty">Загрузка…</div>
        : tickets.length === 0 ? <div className="empty">Тикетов нет. Их создают через команду <code>/ticket</code> в Discord.</div>
        : tickets.map((t) => (
          <Link key={t.id} to={`/tickets/${t.id}`}>
            <div className="row">
              <div className="grow">
                <div className="title">{t.topic || 'Без темы'}</div>
                <div className="sub">{t.userName || t.userId || 'аноним'} · {new Date(t.createdAt).toLocaleString('ru-RU')} · {t.messages?.length || 0} сообщ.</div>
              </div>
              <span className={`badge ${t.source === 'web' ? 'web' : 'discord'}`}>{t.source || 'discord'}</span>
              <span className={`badge ${t.status === 'closed' ? 'closed' : 'open'}`}>{t.status}</span>
            </div>
          </Link>
        ))}
    </>
  );
}
