import { useEffect, useState } from 'react';
import { api } from '../api.js';

const PENDING = 'ожидает проверки';

export default function Reports({ ctx }) {
  const { gid } = ctx;
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  function load() {
    if (!gid) return;
    setLoading(true);
    api.reports(gid).then((r) => { setReports(r); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(load, [gid]);

  function flash(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 2600); }

  async function resolve(id, status, label) {
    setBusyId(id);
    try {
      await api.resolveReport(gid, id, status);
      flash(`Жалоба: ${label}`);
      load();
    } catch (err) { flash(err.message, false); }
    setBusyId(null);
  }

  if (!gid) return <div className="empty">Нет доступных серверов.</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Модерация</div>
          <h1 className="page-title">Жалобы</h1>
        </div>
      </div>

      {loading ? <div className="empty">Загрузка…</div>
        : reports.length === 0 ? <div className="empty">Жалоб нет.</div>
        : reports.map((r) => {
          const pending = r.status === PENDING;
          return (
            <div className="row" key={r.id}>
              <div className="grow">
                <div className="title">На {r.targetName || r.targetId}</div>
                <div className="sub">От {r.reporterName || r.reporterId} · {new Date(r.createdAt).toLocaleString('ru-RU')}</div>
                <div className="sub">{r.reason}</div>
                {pending ? (
                  <div className="btn-row">
                    <button className="success" disabled={busyId === r.id} onClick={() => resolve(r.id, 'принят', 'принята')}>Принять</button>
                    <button className="danger" disabled={busyId === r.id} onClick={() => resolve(r.id, 'отклонён', 'отклонена')}>Отклонить</button>
                  </div>
                ) : null}
              </div>
              <span className={`badge ${pending ? 'open' : 'closed'}`}>{r.status}</span>
            </div>
          );
        })}

      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`}>{toast.msg}</div>}
    </>
  );
}
