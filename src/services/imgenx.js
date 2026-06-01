const DEFAULT_BASE = 'https://imgenx.vercel.app';

function encodeText(value) {
  return encodeURIComponent(String(value ?? '').replace(/'/g, ''));
}

function encodeUrl(value) {
  return String(value ?? '').replace(/[&?# ]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function attrString(attrs) {
  const parts = [];
  for (const key of ['x', 'y', 'w', 'h', 'rd', 'c', 's', 'o', 'f', 'a', 'r']) {
    if (attrs[key] === undefined || attrs[key] === null) continue;
    parts.push(`${key}:${attrs[key]}`);
  }
  return parts.join(',');
}

function imgLayer(src, attrs = {}) {
  if (!src) return null;
  const head = `img:${encodeUrl(src)}`;
  const tail = attrString(attrs);
  return tail ? `${head};${tail}` : head;
}

function txtLayer(text, attrs = {}) {
  if (text === undefined || text === null || text === '') return null;
  const head = `txt:'${encodeText(text)}'`;
  const tail = attrString(attrs);
  return tail ? `${head};${tail}` : head;
}

function buildImageUrl({ width, height, fill = '0x101019', layers = [], base } = {}) {
  const cleaned = layers.filter(Boolean);
  const root = base || process.env.IMGENX_BASE_URL || DEFAULT_BASE;
  const params = [
    `s=${width}x${height}`,
    `fill=${fill}`,
    `l=${cleaned.join('|')}`
  ];
  return `${root}/img?${params.join('&')}`;
}

module.exports = {
  buildImageUrl,
  imgLayer,
  txtLayer
};
