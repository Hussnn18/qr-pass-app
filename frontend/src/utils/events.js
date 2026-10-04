/** Where an event is in its life, for badges. Server status plus the clock. */
export function eventPhase(event, now = Date.now()) {
  if (event.status === 'CANCELLED') return 'CANCELLED';
  if (event.status === 'DRAFT') return 'DRAFT';
  if (now > event.endsAt || event.status === 'COMPLETED') return 'ENDED';
  if (now >= event.startsAt) return 'LIVE';
  return 'UPCOMING';
}

export function eligibilitySummary(eligibility, allowOutsiders) {
  const r = eligibility || {};
  const parts = [];
  parts.push(r.departments?.length ? r.departments.join(', ') : 'All departments');
  parts.push(r.semesters?.length ? `Sem ${r.semesters.join(', ')}` : 'All semesters');
  if (r.sections?.length) parts.push(`Sec ${r.sections.join(', ')}`);
  if (allowOutsiders) parts.push('Guests allowed');
  return parts.join(' · ');
}
