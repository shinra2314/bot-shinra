import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Composer({ ctx }) {
  const { gid } = ctx;
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState('');
  const [content, setContent] = useState('');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!gid) return;
    api.channels(gid).then((list) => {
      setChannels(list);
      setChannelId((cur) => (list.some((c) => c.id === cur) ? cur : list.find((c) => c.canSend)?.id || list[0]?.id || ''));
    }).catch(() => setChannels([]));
  }, [gid]);

  function flash(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 2600); }

  async function send(e) {
    e.preventDefault();
    if (!channelId || !content.trim()) return;
    setBusy(true);
    try {
      await api.send({ channelId, content });
      setContent('');
      flash('Отправлено в Discord');
    } catch (err) { flash('Ошибка: ' + err.message, false); }
    setBusy(false);
  }

  if (!gid) return <div className="empty">Нет доступных серверов.</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Send-as-bot</div>
          <h1 className="page-title">Отправить сообщение</h1>
        </div>
      </div>

      <form className="panel" onSubmit={send}>
        <label className="field"><span>Канал</span>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} style={{ width: '100%' }}>
            {channels.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.canSend}>
                #{c.name}{c.parent ? ` (${c.parent})` : ''}{c.canSend ? '' : ' — нет прав'}
              </option>
            ))}
          </select>
        </label>
        <label className="field"><span>Текст ({content.length}/2000)</span>
          <textarea maxLength={2000} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Бот отправит этот текст в выбранный канал…" />
        </label>
        <button className="primary" type="submit" disabled={busy || !channelId}>Отправить от имени бота</button>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Упоминания (@everyone, @роли) отключены автоматически.</p>
      </form>

      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`}>{toast.msg}</div>}
    </>
  );
}
