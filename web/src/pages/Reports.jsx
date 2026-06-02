import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Reports({ ctx }) {
  const { gid } = ctx;
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gid) return;
    setLoading(true);
    api.reports(gid).then((r) => { setReports(r); setLoading(false); }).catch(() => setLoading(false));
  }, [gid]);

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
        : reports.map((r) => (
          <div className="row" key={r.id}>
            <div className="grow">
              <div className="title">На {r.targetName || r.targetId}</div>
              <div className="sub">От {r.reporterName || r.reporterId} · {new Date(r.createdAt).toLocaleString('ru-RU')}</div>
              <div className="sub">{r.reason}</div>
            </div>
            <span className="badge open">{r.status}</span>
          </div>
        ))}
    </>
  );
}
