import { useState } from 'react';
import { api } from '../api.js';

// Публичная форма обращения: посетитель пишет — бот ретранслирует в канал
// поддержки (WEB_RELAY_CHANNEL_ID). Без авторизации, с rate-limit на бэке.
export default function Contact() {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  function flash(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3200); }

  async function submit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    try {
      await api.relay({ name, contact, message });
      setMessage('');
      flash('Обращение отправлено. Спасибо!');
    } catch (err) {
      flash(err.status === 429 ? 'Слишком часто. Подождите минуту.' : 'Не удалось отправить: ' + err.message, false);
    }
    setBusy(false);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Onix · поддержка</div>
          <h1 className="page-title">Написать нам</h1>
        </div>
      </div>

      <form className="panel" onSubmit={submit} style={{ maxWidth: 640 }}>
        <label className="field"><span>Имя</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" maxLength={80} style={{ width: '100%' }} />
        </label>
        <label className="field"><span>Контакт (необязательно)</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Discord / email" maxLength={120} style={{ width: '100%' }} />
        </label>
        <label className="field"><span>Сообщение ({message.length}/2000)</span>
          <textarea maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Опишите вопрос или обращение…" />
        </label>
        <button className="primary" type="submit" disabled={busy || !message.trim()}>Отправить обращение</button>
      </form>

      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`}>{toast.msg}</div>}
    </>
  );
}
