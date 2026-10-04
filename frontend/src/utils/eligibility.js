import { fmtDateTime } from './format';

/**
 * Evaluates event eligibility for a user. Fails closed: missing rules mean "not eligible".
 * Empty arrays inside the rules mean "no restriction on that field".
 */
export function checkEligibility(user, event) {
  if (!user || !event) return { eligible: false, reasons: [] };
  if (user.role === 'GUEST') {
    const ok = !!event.allowOutsiders;
    return { eligible: ok, reasons: [{ label: ok ? 'Open to external participants' : 'GNDEC students only', ok }] };
  }
  if (user.role !== 'STUDENT') {
    return { eligible: false, reasons: [{ label: 'Only students and guests register for events', ok: false }] };
  }
  const rules = event.eligibility;
  if (!rules) return { eligible: false, reasons: [{ label: 'Eligibility rules not configured', ok: false }] };

  const reasons = [];
  reasons.push({ label: 'Currently enrolled', ok: !!user.enrolled, detail: user.enrolled ? null : 'Your enrollment is inactive' });
  const d = rules.departments || [];
  const se = rules.semesters || [];
  const sc = rules.sections || [];
  reasons.push(d.length ? { label: `Department: ${d.join(', ')}`, ok: d.includes(user.dept), detail: `You: ${user.dept}` } : { label: 'All departments', ok: true });
  reasons.push(se.length ? { label: `Semester: ${se.join(', ')}`, ok: se.includes(user.semester), detail: `You: Sem ${user.semester}` } : { label: 'All semesters', ok: true });
  if (sc.length) reasons.push({ label: `Section: ${sc.join(', ')}`, ok: sc.includes(user.section), detail: `You: ${user.section}` });
  return { eligible: reasons.every((r) => r.ok), reasons };
}

export function eligibilitySummary(event) {
  const r = event.eligibility || {};
  const parts = [];
  parts.push(r.departments?.length ? r.departments.join(', ') : 'All departments');
  parts.push(r.semesters?.length ? `Sem ${r.semesters.join(', ')}` : 'All semesters');
  if (r.sections?.length) parts.push(`Sec ${r.sections.join(', ')}`);
  if (event.allowOutsiders) parts.push('Guests allowed');
  return parts.join(' · ');
}

export function registrationWindow(event, now = Date.now()) {
  if (event.status === 'DRAFT') return { open: false, reason: 'Not published yet' };
  if (event.status === 'CANCELLED') return { open: false, reason: 'Event cancelled' };
  if (event.status === 'COMPLETED' || now > event.endsAt) return { open: false, reason: 'Event has ended' };
  if (event.status === 'CLOSED') return { open: false, reason: 'Registrations closed by the organizer' };
  if (now < event.regOpensAt) return { open: false, upcoming: true, reason: `Registration opens ${fmtDateTime(event.regOpensAt)}` };
  if (now > event.regClosesAt) return { open: false, reason: 'Registration deadline has passed' };
  return { open: true, closesAt: event.regClosesAt };
}

export function eventPhase(event, now = Date.now()) {
  if (event.status === 'CANCELLED') return 'CANCELLED';
  if (event.status === 'DRAFT') return 'DRAFT';
  if (now > event.endsAt || event.status === 'COMPLETED') return 'ENDED';
  if (now >= event.startsAt) return 'LIVE';
  return 'UPCOMING';
}

export function countEligibleStudents(users, eligibility) {
  const fake = { eligibility };
  return users.filter((u) => u.role === 'STUDENT' && u.status === 'ACTIVE' && checkEligibility(u, fake).eligible).length;
}
