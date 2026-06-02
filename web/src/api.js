// Тонкая обёртка над fetch для /api. Если задан VITE_DASHBOARD_TOKEN (build-time),
// добавляем Bearer-заголовок — для случая, когда на бэке включён DASHBOARD_TOKEN.

const TOKEN = import.meta.env.VITE_DASHBOARD_TOKEN || null;

async function request(method, path, body) {
  const headers = {};
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  overview: () => request('GET', '/overview'),
  guilds: () => request('GET', '/guilds'),
  channels: (gid) => request('GET', `/guilds/${gid}/channels`),
  tickets: (gid, status) => request('GET', `/guilds/${gid}/tickets${status ? `?status=${status}` : ''}`),
  ticket: (gid, id) => request('GET', `/guilds/${gid}/tickets/${id}`),
  patchTicket: (gid, id, payload) => request('PATCH', `/guilds/${gid}/tickets/${id}`, payload),
  replyTicket: (gid, id, payload) => request('POST', `/guilds/${gid}/tickets/${id}/reply`, payload),
  reports: (gid) => request('GET', `/guilds/${gid}/reports`),
  send: (payload) => request('POST', '/send', payload)
};
