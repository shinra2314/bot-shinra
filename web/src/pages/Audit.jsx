import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Человекочитаемые ярлыки типов действий.
const ACTIONS = {
  report_status: { label: 'Жалоба', cls: 'badge open' },
  ticket_status: { label: 'Тикет', cls: 'badge discord' },
  ticket_reply: { label: 'Ответ', cls: 'badge discord' },
  send_as_bot: { label: 'Сообщение', cls: 'badge web' },
  currency_adjust: { label: 'Валюта', cls: 'badge open' },
  settings_update: { label: 'Настройки', cls: 'badge web' },
  admin_grant: { label: 'Выдача', cls: 'badge web' }
};

export default function Audit({ ctx }) {
  const { gid } = ctx;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gid) return;
    setLoading(true);
    api.audit(gid).then((e) => { setEntries(e); setLoading(false); }).catch(() => setLoading(false));
  }, [gid]);

  if (!gid) return <div className="empty">Нет доступных серверов.</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Журнал</div>
          <h1 className="page-title">Аудит действий</h1>
        </div>
      </div>

      {loading ? <div className="empty">Загрузка…</div>
        : entries.length === 0 ? <div className="empty">Записей пока нет.</div>
        : entries.map((e) => {
          const meta = ACTIONS[e.action] || { label: e.action, cls: 'badge closed' };
          return (
            <div className="row" key={e.id}>
              <div className="grow">
                <div className="title">{e.detail || meta.label}</div>
                <div className="sub">
                  {e.actor === 'web' ? 'Дашборд' : e.actor}
                  {e.targetName ? ` · ${e.targetName}` : ''}
                  {' · '}{new Date(e.createdAt).toLocaleString('ru-RU')}
                </div>
              </div>
              <span className={meta.cls}>{meta.label}</span>
            </div>
          );
        })}
    </>
  );
}
