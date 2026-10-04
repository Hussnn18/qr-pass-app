const LOCALE = 'en-IN';

export const fmtDate = (ts, opts = {}) =>
  new Date(ts).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...opts });
export const fmtDateShort = (ts) => new Date(ts).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit', hour12: true });
export const fmtDateTime = (ts) => `${fmtDate(ts, { weekday: undefined })}, ${fmtTime(ts)}`;

export function fmtRange(a, b) {
  const sameDay = new Date(a).toDateString() === new Date(b).toDateString();
  return sameDay ? `${fmtDate(a)} · ${fmtTime(a)} – ${fmtTime(b)}` : `${fmtDateTime(a)} – ${fmtDateTime(b)}`;
}

export function fromNow(ts, now = Date.now()) {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 6e4);
  const h = Math.round(abs / 36e5);
  const d = Math.round(abs / 864e5);
  if (m < 1) return 'just now';
  const s = m < 60 ? `${m} min` : h < 24 ? `${h} hr` : `${d} day${d > 1 ? 's' : ''}`;
  return diff > 0 ? `in ${s}` : `${s} ago`;
}

export function countdown(ts, now = Date.now()) {
  let diff = Math.max(0, ts - now);
  const d = Math.floor(diff / 864e5); diff -= d * 864e5;
  const h = Math.floor(diff / 36e5); diff -= h * 36e5;
  const m = Math.floor(diff / 6e4);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const pad = (n) => String(n).padStart(2, '0');
export function toInputDT(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromInputDT = (v) => (v ? new Date(v).getTime() : null);

export const pct = (a, b) => (b ? Math.round((a * 100) / b) : 0);

export function initials(name = '') {
  return name
    .replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = ['#262a7a', '#8f1d1d', '#1f7a4d', '#0f6f86', '#5b3f99', '#b45309', '#334155', '#9d174d'];
export function hashColor(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export const titleCase = (s = '') => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
