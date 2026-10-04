import { byId, gatesForEvent } from '../store/selectors';
import { pct } from './format';

const live = (r) => r.status !== 'CANCELLED' && r.status !== 'REJECTED';

function userMap(s) {
  return new Map(s.users.map((u) => [u.id, u]));
}

/** Registrations vs attendance grouped by department; guests grouped together. */
export function deptBreakdown(s, eventIds) {
  const ids = new Set(eventIds);
  const users = userMap(s);
  const rows = new Map();
  const key = (u) => (u?.role === 'GUEST' ? 'Guests' : u?.dept || '—');
  const row = (k) => rows.get(k) || rows.set(k, { name: k, registered: 0, attended: 0 }).get(k);
  s.registrations.filter((r) => ids.has(r.eventId) && live(r)).forEach((r) => { row(key(users.get(r.userId))).registered++; });
  s.attendance.filter((a) => ids.has(a.eventId)).forEach((a) => { row(key(users.get(a.userId))).attended++; });
  return [...rows.values()].sort((a, b) => b.registered - a.registered);
}

export function semesterBreakdown(s, eventIds) {
  const ids = new Set(eventIds);
  const users = userMap(s);
  const rows = new Map();
  const row = (sem) => rows.get(sem) || rows.set(sem, { name: `Sem ${sem}`, sem, registered: 0, attended: 0 }).get(sem);
  s.registrations.filter((r) => ids.has(r.eventId) && live(r)).forEach((r) => {
    const u = users.get(r.userId);
    if (u?.role === 'STUDENT') row(u.semester).registered++;
  });
  s.attendance.filter((a) => ids.has(a.eventId)).forEach((a) => {
    const u = users.get(a.userId);
    if (u?.role === 'STUDENT') row(u.semester).attended++;
  });
  return [...rows.values()].sort((a, b) => a.sem - b.sem);
}

export function userTypeSplit(s, eventIds) {
  const ids = new Set(eventIds);
  const users = userMap(s);
  let students = 0;
  let guests = 0;
  s.registrations.filter((r) => ids.has(r.eventId) && live(r)).forEach((r) => {
    if (users.get(r.userId)?.role === 'GUEST') guests++;
    else students++;
  });
  return [{ name: 'Students', value: students }, { name: 'Guests', value: guests }];
}

export function statusBreakdown(s, eventIds) {
  const ids = new Set(eventIds);
  const regs = s.registrations.filter((r) => ids.has(r.eventId));
  const attended = s.attendance.filter((a) => ids.has(a.eventId)).length;
  const count = (st) => regs.filter((r) => r.status === st).length;
  return [
    { name: 'Checked in', value: attended },
    { name: 'Confirmed, not yet in', value: Math.max(count('APPROVED') - attended, 0) },
    { name: 'Pending', value: count('PENDING') },
    { name: 'Waitlisted', value: count('WAITLISTED') },
    { name: 'Rejected', value: count('REJECTED') },
    { name: 'Cancelled', value: count('CANCELLED') },
  ].filter((x) => x.value > 0);
}

export function popularity(s, events) {
  return events
    .filter((e) => e.status !== 'DRAFT')
    .map((e) => {
      const regs = s.registrations.filter((r) => r.eventId === e.id);
      const approved = regs.filter((r) => r.status === 'APPROVED').length;
      const attended = s.attendance.filter((a) => a.eventId === e.id).length;
      return {
        id: e.id, name: e.title, status: e.status, startsAt: e.startsAt, capacity: e.capacity,
        registrations: regs.filter(live).length, approved, attended,
        fill: pct(approved, e.capacity), attendanceRate: pct(attended, approved),
      };
    })
    .sort((a, b) => b.registrations - a.registrations);
}

export function gateBreakdown(s, eventId) {
  const ev = byId(s.events, eventId);
  return gatesForEvent(s, ev).map((g) => ({
    name: g.name,
    entries: s.attendance.filter((a) => a.eventId === eventId && a.gateId === g.id).length,
    rejected: s.scanLogs.filter((l) => l.eventId === eventId && l.gateId === g.id && l.result !== 'SUCCESS').length,
  }));
}

/** Entries per time bucket around the event start, plus a running total. */
export function entryTimeline(s, eventId, bucketMin = 10) {
  const list = s.attendance.filter((a) => a.eventId === eventId).sort((a, b) => a.at - b.at);
  if (!list.length) return [];
  const size = bucketMin * 6e4;
  const start = Math.floor(list[0].at / size) * size;
  const end = Math.floor(list[list.length - 1].at / size) * size;
  const rows = [];
  let total = 0;
  for (let t = start; t <= end; t += size) {
    const entries = list.filter((a) => a.at >= t && a.at < t + size).length;
    total += entries;
    rows.push({ name: new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }), entries, total });
  }
  return rows;
}

export function checkinsByDay(s, eventIds, days = 14) {
  const ids = eventIds ? new Set(eventIds) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const from = today.getTime() - i * 864e5;
    const to = from + 864e5;
    rows.push({
      name: new Date(from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      checkins: s.attendance.filter((a) => (!ids || ids.has(a.eventId)) && a.at >= from && a.at < to).length,
      registrations: s.registrations.filter((r) => (!ids || ids.has(r.eventId)) && r.registeredAt >= from && r.registeredAt < to).length,
    });
  }
  return rows;
}
