import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { api } from './api.js';
import Overview from './pages/Overview.jsx';
import Tickets from './pages/Tickets.jsx';
import TicketDetail from './pages/TicketDetail.jsx';
import Reports from './pages/Reports.jsx';
import Composer from './pages/Composer.jsx';
import Contact from './pages/Contact.jsx';

const NAV = [
  { to: '/', label: 'Обзор', icon: '📊', end: true },
  { to: '/tickets', label: 'Тикеты', icon: '🎫' },
  { to: '/reports', label: 'Жалобы', icon: '🛡️' },
  { to: '/compose', label: 'Отправить', icon: '✈️' },
  { to: '/contact', label: 'Обращение', icon: '📬' }
];

export default function App() {
  const [guilds, setGuilds] = useState([]);
  const [gid, setGid] = useState(() => localStorage.getItem('gid') || '');
  const location = useLocation();

  useEffect(() => {
    api.guilds().then((list) => {
      setGuilds(list);
      setGid((cur) => (cur && list.some((g) => g.id === cur) ? cur : list[0]?.id || ''));
    }).catch(() => setGuilds([]));
  }, []);

  useEffect(() => {
    if (gid) localStorage.setItem('gid', gid);
  }, [gid]);

  const ctx = { guilds, gid };
  const showGuildPicker = !location.pathname.startsWith('/contact');

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">ONIX</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span>{n.icon}</span> {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">Дашборд бота · v1</div>
      </aside>

      <main className="main">
        {showGuildPicker && guilds.length > 1 && (
          <div className="page-head" style={{ marginBottom: 12 }}>
            <span className="muted">Сервер</span>
            <select value={gid} onChange={(e) => setGid(e.target.value)}>
              {guilds.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        <Routes>
          <Route path="/" element={<Overview ctx={ctx} />} />
          <Route path="/tickets" element={<Tickets ctx={ctx} />} />
          <Route path="/tickets/:id" element={<TicketDetail ctx={ctx} />} />
          <Route path="/reports" element={<Reports ctx={ctx} />} />
          <Route path="/compose" element={<Composer ctx={ctx} />} />
          <Route path="/contact" element={<Contact />} />
        </Routes>
      </main>
    </div>
  );
}
