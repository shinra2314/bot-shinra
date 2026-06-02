import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';

export default function TicketDetail({ ctx }) {
  const { gid } = ctx;
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [body, setBody] = useState('');
  const [notify, setNotify] = useState(true);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!gid) return;
    api.ticket(gid, id).then(setTicket).catch(() => setTicket(false));
  }
  useEffect(load, [gid, id]);

  function flash(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 2600); }

  async function reply(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.replyTicket(gid, id, { body, notify });
      setBody('');
      flash('Ответ сохранён' + (notify ? ' и отправлен в DM' : ''));
      load();
    } catch (err) { flash(err.message, false); }
    setBusy(false);
  }

  async function setStatus(status) {
    await api.patchTicket(gid, id, { status });
    flash(status === 'closed' ? 'Тикет закрыт' : 'Статус обновлён');
    load();
  }

  if (ticket === false) return <div className="empty">Тикет не найден.</div>;
  if (!ticket) return <div className="empty">Загрузка…</div>;

  return (
    <>
      <Link to="/tickets" className="back">← к тикетам</Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">Тикет {ticket.id}</div>
          <h1 className="page-title">{ticket.topic || 'Без темы'}</h1>
        </div>
        <span className={`badge ${ticket.status === 'closed' ? 'closed' : 'open'}`}>{ticket.status}</span>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="sub">Автор: <b>{ticket.userName || ticket.userId || 'аноним'}</b></div>
        {ticket.targetId && <div className="sub">На пользователя: {ticket.targetName || ticket.targetId}</div>}
        <div className="sub">Создан: {new Date(ticket.createdAt).toLocaleString('ru-RU')}</div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        {(!ticket.messages || ticket.messages.length === 0)
          ? <div className="muted">Переписки пока нет.</div>
          : ticket.messages.map((m, i) => (
            <div key={i} className={`msg ${m.author === 'admin' ? 'admin' : 'user'}`}>
              <div className="meta">{m.author === 'admin' ? 'Админ' : 'Пользователь'} · {new Date(m.at).toLocaleString('ru-RU')}{m.viaBot ? ' · DM' : ''}</div>
              <div>{m.body}</div>
            </div>
          ))}
      </div>

      <form className="panel" onSubmit={reply}>
        <label className="field"><span>Ответ</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Текст ответа…" />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, color: 'var(--muted)' }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ width: 'auto' }} />
          Отправить пользователю в личные сообщения (через бота)
        </label>
        <div className="btn-row">
          <button className="primary" type="submit" disabled={busy}>Ответить</button>
          {ticket.status !== 'closed'
            ? <button type="button" className="danger" onClick={() => setStatus('closed')}>Закрыть</button>
            : <button type="button" onClick={() => setStatus('open')}>Переоткрыть</button>}
        </div>
      </form>

      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`}>{toast.msg}</div>}
    </>
  );
}
