import { ROLES } from '../data/constants';
import { pct } from '../utils/format';

export const byId = (arr, id) => arr.find((x) => x.id === id) || null;

export function eventStats(s, eventId) {
  const ev = byId(s.events, eventId);
  const regs = s.registrations.filter((r) => r.eventId === eventId);
  const count = (st) => regs.filter((r) => r.status === st).length;
  const approved = count('APPROVED');
  const attended = s.attendance.filter((a) => a.eventId === eventId).length;
  const capacity = ev?.capacity || 0;
  const ended = ev && (ev.status === 'COMPLETED' || Date.now() > ev.endsAt);
  return {
    total: regs.length,
    active: regs.filter((r) => r.status !== 'CANCELLED' && r.status !== 'REJECTED').length,
    approved,
    pending: count('PENDING'),
    waitlisted: count('WAITLISTED'),
    rejected: count('REJECTED'),
    cancelled: count('CANCELLED'),
    attended,
    noShow: ended ? Math.max(approved - attended, 0) : 0,
    capacity,
    remaining: Math.max(capacity - approved, 0),
    fill: pct(approved, capacity),
    attendanceRate: pct(attended, approved),
  };
}

export function myRegistration(s, eventId, userId) {
  const list = s.registrations.filter((r) => r.eventId === eventId && r.userId === userId);
  return list.sort((a, b) => b.registeredAt - a.registeredAt)[0] || null;
}

export function passForRegistration(s, regId) {
  const list = s.passes.filter((p) => p.registrationId === regId);
  return list.find((p) => p.status === 'ACTIVE') || list.find((p) => p.status === 'USED') || list.sort((a, b) => b.issuedAt - a.issuedAt)[0] || null;
}

export function waitlistPosition(s, reg) {
  const wl = s.registrations
    .filter((r) => r.eventId === reg.eventId && r.status === 'WAITLISTED')
    .sort((a, b) => a.registeredAt - b.registeredAt);
  return wl.findIndex((r) => r.id === reg.id) + 1;
}

export function visibleEvents(s, user) {
  if (!user) return [];
  if (user.role === 'ADMIN') return s.events;
  if (user.role === 'ORGANIZER') return s.events.filter((e) => e.status !== 'DRAFT' || e.organizerIds.includes(user.id));
  if (user.role === 'SECURITY') return s.events.filter((e) => e.status !== 'DRAFT');
  return s.events.filter((e) => e.status !== 'DRAFT' && (user.role !== 'GUEST' || e.allowOutsiders));
}

export function managedEvents(s, user) {
  if (!user) return [];
  if (user.role === 'ADMIN') return s.events;
  if (user.role === 'ORGANIZER') return s.events.filter((e) => e.organizerIds.includes(user.id));
  return [];
}

export const canManage = (user, ev) =>
  !!user && !!ev && (user.role === 'ADMIN' || (user.role === 'ORGANIZER' && ev.organizerIds.includes(user.id)));

export const gatesForEvent = (s, ev) => (ev?.gateIds || []).map((id) => byId(s.gates, id)).filter(Boolean);
export const gatesForLocation = (s, locId) => s.gates.filter((g) => g.locationId === locId);
export const unreadCount = (s, userId) => s.notifications.filter((n) => n.userId === userId && !n.read).length;
export const attendanceForPass = (s, passId) => s.attendance.find((a) => a.passId === passId) || null;

/** Event + gate combinations the user may scan at right now or later today. */
export function scanOptions(s, user) {
  if (!user) return [];
  const now = Date.now();
  const usable = (ev) => ev && ['PUBLISHED', 'CLOSED'].includes(ev.status) && ev.endsAt > now;
  const out = [];
  if (user.role === 'SECURITY') {
    s.assignments
      .filter((a) => a.userId === user.id)
      .forEach((a) => {
        const event = byId(s.events, a.eventId);
        const gate = byId(s.gates, a.gateId);
        if (usable(event) && gate) out.push({ event, gate });
      });
  } else {
    managedEvents(s, user).filter(usable).forEach((event) => gatesForEvent(s, event).forEach((gate) => out.push({ event, gate })));
  }
  return out.sort((a, b) => a.event.startsAt - b.event.startsAt);
}

export const idLabel = (u) => u?.urn || u?.email || '';
export const deptName = (s, code) => byId(s.departments, code)?.name || code;

export function userSubtitle(u) {
  if (!u) return '';
  if (u.role === 'STUDENT') return `${u.dept} · Sem ${u.semester} · Sec ${u.section}`;
  if (u.role === 'GUEST') return u.organization || 'External participant';
  return u.unit || ROLES[u.role]?.label || '';
}
