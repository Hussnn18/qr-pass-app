/**
 * Mock API. Each function mirrors an endpoint from plan.md §8 and applies the same rules the
 * Spring Boot service will enforce (eligibility, capacity, waitlist, pass lifecycle, scan checks).
 */
import { store } from './store';
import { session } from './session';
import { byId, gatesForEvent, userSubtitle } from './selectors';
import { checkEligibility, registrationWindow } from '../utils/eligibility';
import { uid, randomToken, passCode, tempPassword } from '../utils/ids';
import { fmtTime, fromNow } from '../utils/format';
import { DEMO_OTP, DEMO_PASSWORD, ENTRY_WINDOW_MIN, SCAN_RESULTS } from '../data/constants';

const now = () => Date.now();
const ok = (message, extra = {}) => ({ ok: true, message, ...extra });
const fail = (message, extra = {}) => ({ ok: false, message, ...extra });
const me = (s) => byId(s.users, session.get());
const randomOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

function audit(s, action, entity, entityId, details = '', actorId = session.get()) {
  s.audit.unshift({ id: uid('a'), actorId: actorId || null, action, entity, entityId, details, at: now(), ip: '192.168.1.24' });
  if (s.audit.length > 600) s.audit.length = 600;
}
function notify(s, userId, type, title, message, link = null) {
  s.notifications.unshift({ id: uid('n'), userId, type, title, message, link, at: now(), read: false });
}
const approvedCount = (s, eventId) => s.registrations.filter((r) => r.eventId === eventId && r.status === 'APPROVED').length;

function revokeActive(s, regId, reason) {
  s.passes.forEach((p) => {
    if (p.registrationId === regId && p.status === 'ACTIVE') {
      p.status = 'REVOKED';
      p.revokedAt = now();
      p.revokedReason = reason;
    }
  });
}
function issuePass(s, reg) {
  revokeActive(s, reg.id, 'Replaced by a new pass');
  const p = { id: uid('p'), registrationId: reg.id, eventId: reg.eventId, userId: reg.userId, token: randomToken(), code: passCode(), status: 'ACTIVE', issuedAt: now(), usedAt: null };
  s.passes.push(p);
  return p;
}
function promoteWaitlisted(s, ev) {
  let promoted = 0;
  while (approvedCount(s, ev.id) < ev.capacity) {
    const next = s.registrations
      .filter((r) => r.eventId === ev.id && r.status === 'WAITLISTED')
      .sort((a, b) => a.registeredAt - b.registeredAt)[0];
    if (!next) break;
    next.status = 'APPROVED';
    next.decidedAt = now();
    next.decidedBy = 'system';
    issuePass(s, next);
    notify(s, next.userId, 'PROMOTED', `You're in: ${ev.title}`, 'A seat opened up, so your waitlisted registration is now confirmed. Your pass is ready.', '/my/passes');
    promoted++;
  }
  return promoted;
}

// ------------------------------------------------------------------ auth
export function login(identifier, password) {
  return store.mutate((s) => {
    const idf = identifier.trim().toLowerCase();
    const u = s.users.find((x) => x.urn?.toLowerCase() === idf || x.email?.toLowerCase() === idf);
    if (!u) return fail('No account found with that URN or email.');
    if (u.status === 'LOCKED' && u.lockedUntil > now()) {
      return fail(`This account is locked after too many failed attempts. Try again ${fromNow(u.lockedUntil)}, or ask the admin to unlock it.`);
    }
    if (u.status === 'INACTIVE') return fail('This account has been deactivated. Contact the Student Welfare office.');
    if (u.status === 'PENDING_VERIFICATION') return fail('Please verify your email address before signing in.');
    if (password !== (u.password || DEMO_PASSWORD)) {
      u.failedLogins = (u.failedLogins || 0) + 1;
      audit(s, 'LOGIN_FAILED', 'User', u.id, `Attempt ${u.failedLogins}`, null);
      if (u.failedLogins >= 5) {
        u.status = 'LOCKED';
        u.lockedUntil = now() + 15 * 6e4;
        return fail('Too many failed attempts. The account is locked for 15 minutes.');
      }
      return fail(`Incorrect password. ${5 - u.failedLogins} attempt(s) left before the account is locked.`);
    }
    u.failedLogins = 0;
    if (u.status === 'LOCKED') u.status = 'ACTIVE';
    u.lastLoginAt = now();
    audit(s, 'LOGIN', 'User', u.id, 'Password sign-in', u.id);
    return ok('Signed in', { userId: u.id, mustChangePassword: !!u.mustChangePassword });
  });
}

export function quickLogin(userId) {
  store.mutate((s) => {
    const u = byId(s.users, userId);
    if (!u) return;
    u.lastLoginAt = now();
    u.failedLogins = 0;
    if (u.status === 'LOCKED') u.status = 'ACTIVE';
    audit(s, 'LOGIN', 'User', userId, 'Demo quick sign-in', userId);
  });
  session.set(userId);
}

export function logout() {
  const id = session.get();
  if (id) store.mutate((s) => audit(s, 'LOGOUT', 'User', id));
  session.set(null);
}

export function changePassword(current, next) {
  return store.mutate((s) => {
    const u = me(s);
    if (!u) return fail('Not signed in.');
    if (!u.mustChangePassword && current !== (u.password || DEMO_PASSWORD)) return fail('Your current password is incorrect.');
    u.password = next;
    u.mustChangePassword = false;
    audit(s, 'PASSWORD_CHANGED', 'User', u.id);
    return ok('Password updated.');
  });
}

export function signupGuest(data) {
  return store.mutate((s) => {
    if (s.users.some((u) => u.email?.toLowerCase() === data.email.trim().toLowerCase())) return fail('An account with this email already exists.');
    const u = {
      id: uid('u'), role: 'GUEST', status: 'PENDING_VERIFICATION', name: data.name.trim(), email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(), organization: data.organization.trim(), password: data.password, mustChangePassword: false,
      photo: null, failedLogins: 0, createdAt: now(), prefs: { email: true, reminders: true },
    };
    s.users.push(u);
    audit(s, 'GUEST_SIGNUP', 'User', u.id, u.email, u.id);
    return ok('Account created', { userId: u.id });
  });
}

export function verifyGuest(userId, code) {
  return store.mutate((s) => {
    const u = byId(s.users, userId);
    if (!u) return fail('Sign-up not found. Please start again.');
    if (code.trim() !== DEMO_OTP) return fail('That code is incorrect. Check the email and try again.');
    u.status = 'ACTIVE';
    u.verifiedAt = now();
    audit(s, 'EMAIL_VERIFIED', 'User', u.id, u.email, u.id);
    notify(s, u.id, 'WELCOME', 'Welcome to Smart Campus Events', 'Your email is verified. Browse events that welcome external participants.', '/events');
    return ok('Email verified');
  });
}

export function findAccount(identifier) {
  const idf = identifier.trim().toLowerCase();
  const u = store.get().users.find((x) => x.urn?.toLowerCase() === idf || x.email?.toLowerCase() === idf);
  return u ? ok('Code sent', { userId: u.id, email: u.email }) : fail('No account found with that URN or email.');
}

export function resetPassword(userId, code, next) {
  return store.mutate((s) => {
    const u = byId(s.users, userId);
    if (!u) return fail('Account not found.');
    if (code.trim() !== DEMO_OTP) return fail('That code is incorrect or has expired.');
    u.password = next;
    u.failedLogins = 0;
    if (u.status === 'LOCKED') u.status = 'ACTIVE';
    audit(s, 'PASSWORD_RESET', 'User', u.id, 'Reset via emailed code', u.id);
    return ok('Password reset. You can sign in now.');
  });
}

// ------------------------------------------------------------------ profile
export function updateProfile(patch) {
  return store.mutate((s) => {
    const u = me(s);
    Object.assign(u, patch);
    audit(s, 'PROFILE_UPDATED', 'User', u.id, Object.keys(patch).join(', '));
    return ok('Profile saved.');
  });
}

export function setPhoto(dataUrl) {
  return store.mutate((s) => {
    const u = me(s);
    u.photo = dataUrl;
    audit(s, dataUrl ? 'PHOTO_UPLOADED' : 'PHOTO_REMOVED', 'User', u.id);
    return ok(dataUrl ? 'Photo updated.' : 'Photo removed.');
  });
}

// ------------------------------------------------------------------ registrations
export function register(eventId, note = '') {
  return store.mutate((s) => {
    const user = me(s);
    const ev = byId(s.events, eventId);
    if (!user || !ev) return fail('Event not found.');
    if (ev.mode === 'AUTO_ASSIGN') return fail('Passes for this event are issued by the organizer.');
    if (!checkEligibility(user, ev).eligible) return fail('You are not eligible for this event.');
    const win = registrationWindow(ev);
    if (!win.open) return fail(win.reason);
    let reg = s.registrations.find((r) => r.eventId === eventId && r.userId === user.id);
    if (reg && reg.status !== 'CANCELLED') return fail('You have already registered for this event.');
    if (!reg) {
      reg = { id: uid('r'), eventId, userId: user.id };
      s.registrations.push(reg);
    }
    Object.assign(reg, { registeredAt: now(), decidedAt: null, decidedBy: null, reason: null, note: note || null });

    if (ev.mode === 'APPROVAL') {
      reg.status = 'PENDING';
      notify(s, user.id, 'PENDING', `Request sent: ${ev.title}`, 'The organizer will review your request. You will be notified here.', `/events/${ev.id}`);
      ev.organizerIds.forEach((o) => notify(s, o, 'REQUESTS', `New request: ${ev.title}`, `${user.name} asked to join.`, `/manage/events/${ev.id}?tab=registrations`));
      audit(s, 'REGISTRATION_REQUESTED', 'Event', ev.id, ev.title);
      return ok('Request sent. You will be notified when the organizer decides.', { status: 'PENDING' });
    }
    if (approvedCount(s, ev.id) < ev.capacity) {
      reg.status = 'APPROVED';
      reg.decidedAt = now();
      reg.decidedBy = 'system';
      issuePass(s, reg);
      notify(s, user.id, 'APPROVED', `Registration confirmed: ${ev.title}`, 'Your seat is confirmed and your QR pass is ready.', '/my/passes');
      audit(s, 'REGISTERED', 'Event', ev.id, ev.title);
      return ok('You are registered. Your pass is ready in My Passes.', { status: 'APPROVED' });
    }
    reg.status = 'WAITLISTED';
    notify(s, user.id, 'WAITLISTED', `Waitlisted: ${ev.title}`, 'The event is full. You will get a pass automatically if a seat opens up.', `/events/${ev.id}`);
    audit(s, 'WAITLISTED', 'Event', ev.id, ev.title);
    return ok('The event is full, so you have been added to the waitlist.', { status: 'WAITLISTED' });
  });
}

export function cancelMyRegistration(regId) {
  return store.mutate((s) => {
    const user = me(s);
    const reg = byId(s.registrations, regId);
    if (!reg || reg.userId !== user.id) return fail('Registration not found.');
    const ev = byId(s.events, reg.eventId);
    if (now() >= ev.startsAt) return fail('You cannot cancel after the event has started.');
    const wasApproved = reg.status === 'APPROVED';
    reg.status = 'CANCELLED';
    reg.decidedAt = now();
    reg.reason = 'Cancelled by participant';
    revokeActive(s, reg.id, 'Cancelled by participant');
    audit(s, 'REGISTRATION_CANCELLED', 'Event', ev.id, ev.title);
    const promoted = wasApproved && ev.mode === 'OPEN' ? promoteWaitlisted(s, ev) : 0;
    return ok(promoted ? 'Registration cancelled. Your seat went to the next person on the waitlist.' : 'Registration cancelled.');
  });
}

export function approveRegistrations(regIds) {
  return store.mutate((s) => {
    let approved = 0;
    let full = 0;
    regIds.forEach((id) => {
      const reg = byId(s.registrations, id);
      if (!reg || !['PENDING', 'WAITLISTED'].includes(reg.status)) return;
      const ev = byId(s.events, reg.eventId);
      if (approvedCount(s, ev.id) >= ev.capacity) { full++; return; }
      reg.status = 'APPROVED';
      reg.decidedAt = now();
      reg.decidedBy = session.get();
      issuePass(s, reg);
      notify(s, reg.userId, 'APPROVED', `Approved: ${ev.title}`, 'Your request was approved. Your QR pass is ready.', '/my/passes');
      audit(s, 'REGISTRATION_APPROVED', 'Registration', reg.id, `${byId(s.users, reg.userId)?.name} · ${ev.title}`);
      approved++;
    });
    if (!approved && full) return fail('The event is full. Increase capacity or remove someone first.');
    return ok(`${approved} approved${full ? `, ${full} not approved because the event is full` : ''}.`, { approved, full });
  });
}

export function rejectRegistrations(regIds, reason) {
  return store.mutate((s) => {
    let n = 0;
    regIds.forEach((id) => {
      const reg = byId(s.registrations, id);
      if (!reg || !['PENDING', 'WAITLISTED', 'APPROVED'].includes(reg.status)) return;
      const ev = byId(s.events, reg.eventId);
      reg.status = 'REJECTED';
      reg.reason = reason;
      reg.decidedAt = now();
      reg.decidedBy = session.get();
      revokeActive(s, reg.id, 'Registration rejected');
      notify(s, reg.userId, 'REJECTED', `Not approved: ${ev.title}`, reason, `/events/${ev.id}`);
      audit(s, 'REGISTRATION_REJECTED', 'Registration', reg.id, `${byId(s.users, reg.userId)?.name} · ${reason}`);
      n++;
    });
    return ok(`${n} request(s) rejected.`);
  });
}

export function removeRegistration(regId, reason = 'Removed by organizer') {
  return store.mutate((s) => {
    const reg = byId(s.registrations, regId);
    if (!reg) return fail('Registration not found.');
    const ev = byId(s.events, reg.eventId);
    const wasApproved = reg.status === 'APPROVED';
    reg.status = 'CANCELLED';
    reg.reason = reason;
    reg.decidedAt = now();
    revokeActive(s, reg.id, reason);
    notify(s, reg.userId, 'CANCELLED', `Registration removed: ${ev.title}`, reason, `/events/${ev.id}`);
    audit(s, 'REGISTRATION_REMOVED', 'Registration', reg.id, `${byId(s.users, reg.userId)?.name} · ${reason}`);
    const promoted = wasApproved && ev.mode === 'OPEN' ? promoteWaitlisted(s, ev) : 0;
    return ok(promoted ? `Removed. ${promoted} waitlisted participant promoted.` : 'Participant removed.');
  });
}

export function bulkAssign(eventId, urns = null) {
  return store.mutate((s) => {
    const ev = byId(s.events, eventId);
    let candidates = s.users.filter((u) => u.role === 'STUDENT' && u.status === 'ACTIVE');
    let unknown = 0;
    if (urns?.length) {
      const set = new Set(urns);
      unknown = urns.filter((x) => !candidates.some((u) => u.urn === x)).length;
      candidates = candidates.filter((u) => set.has(u.urn));
    }
    let assigned = 0, skippedIneligible = 0, skippedExisting = 0, skippedFull = 0;
    candidates.forEach((u) => {
      if (!checkEligibility(u, ev).eligible) { skippedIneligible++; return; }
      let reg = s.registrations.find((r) => r.eventId === ev.id && r.userId === u.id);
      if (reg && reg.status !== 'CANCELLED' && reg.status !== 'REJECTED') { skippedExisting++; return; }
      if (approvedCount(s, ev.id) >= ev.capacity) { skippedFull++; return; }
      if (!reg) { reg = { id: uid('r'), eventId: ev.id, userId: u.id }; s.registrations.push(reg); }
      Object.assign(reg, { status: 'APPROVED', registeredAt: now(), decidedAt: now(), decidedBy: session.get(), reason: null });
      issuePass(s, reg);
      notify(s, u.id, 'PASS', `Pass issued: ${ev.title}`, 'The organizer issued you a pass. Find it in My Passes.', '/my/passes');
      assigned++;
    });
    audit(s, 'PASSES_BULK_ASSIGNED', 'Event', ev.id, `${assigned} issued · ${skippedExisting} already had one · ${skippedIneligible} not eligible · ${skippedFull} over capacity`);
    return ok(`${assigned} pass(es) issued.`, { assigned, skippedIneligible, skippedExisting, skippedFull, unknown });
  });
}

export function revokePass(passId, reason) {
  return store.mutate((s) => {
    const p = byId(s.passes, passId);
    if (!p || p.status !== 'ACTIVE') return fail('Only valid passes can be revoked.');
    p.status = 'REVOKED';
    p.revokedAt = now();
    p.revokedReason = reason;
    const ev = byId(s.events, p.eventId);
    notify(s, p.userId, 'REVOKED', `Pass revoked: ${ev.title}`, reason, `/events/${ev.id}`);
    audit(s, 'PASS_REVOKED', 'Pass', p.id, `${byId(s.users, p.userId)?.name} · ${reason}`);
    return ok('Pass revoked. The old QR code no longer works.');
  });
}

export function reissuePass(regId) {
  return store.mutate((s) => {
    const reg = byId(s.registrations, regId);
    if (!reg || reg.status !== 'APPROVED') return fail('Only confirmed registrations can get a new pass.');
    if (s.passes.some((p) => p.registrationId === regId && p.status === 'USED')) return fail('This participant has already checked in.');
    const p = issuePass(s, reg);
    const ev = byId(s.events, reg.eventId);
    notify(s, reg.userId, 'PASS', `New pass issued: ${ev.title}`, 'Your previous QR code was replaced. Use the new one.', '/my/passes');
    audit(s, 'PASS_REISSUED', 'Pass', p.id, byId(s.users, reg.userId)?.name);
    return ok('New pass issued. The previous QR code is now invalid.');
  });
}

// ------------------------------------------------------------------ events
export function saveEvent(data, { id = null, publish = false } = {}) {
  return store.mutate((s) => {
    const user = me(s);
    const { assignments, ...fields } = data;
    let ev;
    if (id) {
      ev = byId(s.events, id);
      const scheduleChanged = ev.startsAt !== fields.startsAt || ev.venueId !== fields.venueId;
      Object.assign(ev, fields);
      if (publish && ev.status === 'DRAFT') ev.status = 'PUBLISHED';
      audit(s, publish ? 'EVENT_PUBLISHED' : 'EVENT_UPDATED', 'Event', ev.id, ev.title);
      if (scheduleChanged) {
        s.registrations
          .filter((r) => r.eventId === ev.id && ['APPROVED', 'PENDING', 'WAITLISTED'].includes(r.status))
          .forEach((r) => notify(s, r.userId, 'UPDATED', `Event updated: ${ev.title}`, 'The date, time or venue changed. Check the event page.', `/events/${ev.id}`));
      }
    } else {
      ev = { ...fields, id: uid('e'), status: publish ? 'PUBLISHED' : 'DRAFT', organizerIds: fields.organizerIds?.length ? fields.organizerIds : [user.id], createdBy: user.id, createdAt: now() };
      s.events.push(ev);
      audit(s, 'EVENT_CREATED', 'Event', ev.id, ev.title);
      if (publish) audit(s, 'EVENT_PUBLISHED', 'Event', ev.id, ev.title);
    }
    if (assignments) {
      s.assignments = s.assignments.filter((a) => a.eventId !== ev.id);
      Object.entries(assignments).forEach(([gateId, userIds]) => {
        if (!ev.gateIds.includes(gateId)) return;
        userIds.forEach((userId) => s.assignments.push({ id: uid('as'), eventId: ev.id, gateId, userId }));
      });
    }
    return ok(publish ? 'Event published.' : 'Saved as draft.', { id: ev.id });
  });
}

export function setEventStatus(eventId, status, reason = '') {
  return store.mutate((s) => {
    const ev = byId(s.events, eventId);
    ev.status = status;
    if (status === 'CANCELLED') {
      ev.cancelReason = reason;
      s.registrations
        .filter((r) => r.eventId === ev.id && ['APPROVED', 'PENDING', 'WAITLISTED'].includes(r.status))
        .forEach((r) => {
          r.status = 'CANCELLED';
          r.reason = 'Event cancelled by organizer';
          revokeActive(s, r.id, 'Event cancelled');
          notify(s, r.userId, 'CANCELLED', `Event cancelled: ${ev.title}`, reason || 'The organizer cancelled this event.', `/events/${ev.id}`);
        });
    }
    if (status === 'COMPLETED') s.passes.forEach((p) => { if (p.eventId === ev.id && p.status === 'ACTIVE') p.status = 'EXPIRED'; });
    audit(s, `EVENT_${status}`, 'Event', ev.id, reason || ev.title);
    return ok(`Event ${status === 'PUBLISHED' ? 'published' : status === 'CLOSED' ? 'closed for registration' : status.toLowerCase()}.`);
  });
}

export function deleteEvent(eventId) {
  return store.mutate((s) => {
    const ev = byId(s.events, eventId);
    if (ev.status !== 'DRAFT') return fail('Only drafts can be deleted. Cancel published events instead.');
    s.events = s.events.filter((e) => e.id !== eventId);
    s.assignments = s.assignments.filter((a) => a.eventId !== eventId);
    audit(s, 'EVENT_DELETED', 'Event', eventId, ev.title);
    return ok('Draft deleted.');
  });
}

export function setAssignments(eventId, gateId, userIds) {
  return store.mutate((s) => {
    s.assignments = s.assignments.filter((a) => !(a.eventId === eventId && a.gateId === gateId));
    userIds.forEach((userId) => s.assignments.push({ id: uid('as'), eventId, gateId, userId }));
    const names = userIds.map((u) => byId(s.users, u)?.name).join(', ') || 'nobody';
    audit(s, 'SECURITY_ASSIGNED', 'Event', eventId, `${byId(s.gates, gateId)?.name}: ${names}`);
    userIds.forEach((u) => notify(s, u, 'DUTY', `Gate duty: ${byId(s.events, eventId)?.title}`, `${byId(s.gates, gateId)?.name}`, '/scan/assignments'));
    return ok('Gate staff updated.');
  });
}

// ------------------------------------------------------------------ scanning
/** POST /scan/verify — same check order as plan.md §10. */
export function verifyScan({ code, eventId, gateId, method = 'QR', deviceId = 'web', actorId = null }) {
  return store.mutate((s) => {
    const by = actorId || session.get();
    const scanner = byId(s.users, by);
    const ev = byId(s.events, eventId);
    const gate = byId(s.gates, gateId);
    const t = now();
    const out = (result, extra = {}) => {
      const pass = extra.pass || null;
      s.scanLogs.push({ id: uid('s'), eventId, gateId, passId: pass?.id || null, participantId: pass?.userId || null, by, result, at: t, method, deviceId });
      const holder = pass ? byId(s.users, pass.userId) : null;
      return {
        result, ...SCAN_RESULTS[result], message: extra.message || SCAN_RESULTS[result].message, at: t,
        participant: holder ? { id: holder.id, name: holder.name, role: holder.role, idLabel: holder.urn || holder.email, sub: userSubtitle(holder), photo: holder.photo } : null,
        passEvent: pass ? byId(s.events, pass.eventId)?.title : null, passCode: pass?.code || null, gateName: gate?.name,
      };
    };

    if (!scanner || !['SECURITY', 'ORGANIZER', 'ADMIN'].includes(scanner.role)) return out('NOT_ASSIGNED', { message: 'Only security staff, organizers and admins can verify passes.' });
    if (!actorId && scanner.role === 'SECURITY' && !s.assignments.some((a) => a.userId === by && a.eventId === eventId && a.gateId === gateId)) return out('NOT_ASSIGNED');
    if (!actorId && scanner.role === 'ORGANIZER' && !ev.organizerIds.includes(by)) return out('NOT_ASSIGNED', { message: 'You can only scan for events you organise.' });

    const raw = String(code || '').trim();
    let pass = null;
    if (raw.startsWith('EQR1:')) {
      pass = s.passes.find((p) => p.token === raw.slice(5)) || null;
      if (!pass) return out('INVALID_TOKEN');
    } else if (method === 'MANUAL') {
      pass = s.passes.find((p) => p.code === raw.toUpperCase()) || null;
      if (!pass) {
        const holder = s.users.find((u) => u.urn === raw);
        if (holder) {
          const mine = s.passes.filter((p) => p.userId === holder.id);
          const here = mine.filter((p) => p.eventId === eventId);
          pass = here.find((p) => p.status === 'ACTIVE') || here.find((p) => p.status === 'USED') || here[here.length - 1] || mine.find((p) => p.status === 'ACTIVE') || null;
        }
      }
      if (!pass) return out('INVALID_TOKEN', { message: 'No pass found for that pass code or URN.' });
    } else {
      return out('INVALID_FORMAT');
    }

    const reg = byId(s.registrations, pass.registrationId);
    const holder = byId(s.users, pass.userId);
    if (pass.status === 'REVOKED') return out('REVOKED', { pass, message: pass.revokedReason ? `Revoked: ${pass.revokedReason}.` : undefined });
    if (pass.status === 'EXPIRED') return out('EXPIRED', { pass });
    if (!reg || reg.status !== 'APPROVED') return out('NOT_APPROVED', { pass });
    if (pass.eventId !== eventId) return out('WRONG_EVENT', { pass, message: `This pass is for “${byId(s.events, pass.eventId)?.title}”.` });
    const opensAt = ev.startsAt - ENTRY_WINDOW_MIN * 6e4;
    if (t < opensAt) return out('OUTSIDE_WINDOW', { pass, message: `Entry opens at ${fmtTime(opensAt)}.` });
    if (t > ev.endsAt) return out('OUTSIDE_WINDOW', { pass, message: 'This event has already ended.' });
    if (!holder || holder.status !== 'ACTIVE' || (holder.role === 'STUDENT' && !holder.enrolled)) return out('ACCOUNT_INACTIVE', { pass });
    if (pass.status === 'USED') {
      const first = s.attendance.find((a) => a.passId === pass.id);
      const g = first && byId(s.gates, first.gateId);
      return out('ALREADY_USED', { pass, message: first ? `First entry at ${fmtTime(first.at)} via ${g?.name || 'another gate'}.` : undefined });
    }

    // Atomic claim: in the real system this is UPDATE ... WHERE status='ACTIVE' + a unique constraint.
    pass.status = 'USED';
    pass.usedAt = t;
    s.attendance.push({ id: uid('at'), registrationId: reg.id, passId: pass.id, eventId, userId: pass.userId, gateId, at: t, by, method });
    if (method === 'MANUAL') audit(s, 'MANUAL_CHECK_IN', 'Pass', pass.id, `${holder.name} at ${gate?.name}`);
    return out('SUCCESS', { pass });
  });
}

/** Demo helper: picks a pass that produces the requested scanner outcome. */
export function demoCode(eventId, kind) {
  const s = store.get();
  const reg = (p) => byId(s.registrations, p.registrationId);
  const forEvent = s.passes.filter((p) => p.eventId === eventId);
  const make = (p) => (p ? ok('', { code: `EQR1:${p.token}` }) : null);
  switch (kind) {
    case 'valid': {
      const list = forEvent.filter((p) => p.status === 'ACTIVE' && reg(p)?.status === 'APPROVED' && byId(s.users, p.userId)?.enrolled !== false);
      return make(randomOf(list)) || fail('Everyone with a valid pass has already checked in.');
    }
    case 'used':
      return make(randomOf(forEvent.filter((p) => p.status === 'USED'))) || fail('Nobody has checked in yet. Scan a valid pass first.');
    case 'wrong':
      return make(randomOf(s.passes.filter((p) => p.eventId !== eventId && p.status === 'ACTIVE'))) || fail('No passes for other events.');
    case 'revoked':
      return make(randomOf(forEvent.filter((p) => p.status === 'REVOKED')) || randomOf(s.passes.filter((p) => p.status === 'REVOKED'))) || fail('No revoked passes exist yet.');
    case 'invalid':
      return ok('', { code: `EQR1:${randomToken()}` });
    default:
      return ok('', { code: 'https://example.com/menu?table=12' });
  }
}

/** Demo helper for the live attendance screen: one random scan at a random gate. */
export function simulateGateTraffic(eventId) {
  const s = store.get();
  const ev = byId(s.events, eventId);
  const gates = gatesForEvent(s, ev);
  if (!gates.length) return fail('This event has no gates yet.');
  const gate = randomOf(gates);
  const actorId = s.assignments.find((a) => a.eventId === eventId && a.gateId === gate.id)?.userId || session.get();
  const roll = Math.random();
  let res = null;
  if (roll < 0.07) res = demoCode(eventId, 'invalid');
  else if (roll < 0.17) res = demoCode(eventId, 'used');
  if (!res?.ok) res = demoCode(eventId, 'valid');
  if (!res.ok) return res;
  return ok('', verifyScan({ code: res.code, eventId, gateId: gate.id, deviceId: 'simulator', actorId }));
}

export function overrideCheckIn(regId, gateId, reason) {
  return store.mutate((s) => {
    const reg = byId(s.registrations, regId);
    if (!reg || reg.status !== 'APPROVED') return fail('Only confirmed participants can be checked in.');
    if (s.attendance.some((a) => a.registrationId === regId)) return fail('Already checked in.');
    const pass = s.passes.find((p) => p.registrationId === regId && p.status === 'ACTIVE');
    if (pass) { pass.status = 'USED'; pass.usedAt = now(); }
    s.attendance.push({ id: uid('at'), registrationId: regId, passId: pass?.id || null, eventId: reg.eventId, userId: reg.userId, gateId, at: now(), by: session.get(), method: 'OVERRIDE', note: reason });
    s.scanLogs.push({ id: uid('s'), eventId: reg.eventId, gateId, passId: pass?.id || null, participantId: reg.userId, by: session.get(), result: 'SUCCESS', at: now(), method: 'OVERRIDE', deviceId: 'web' });
    audit(s, 'ATTENDANCE_OVERRIDE', 'Registration', regId, `${byId(s.users, reg.userId)?.name} · ${reason}`);
    return ok('Checked in manually. This is recorded in the audit log.');
  });
}

// ------------------------------------------------------------------ admin: users
export function addUser(data) {
  return store.mutate((s) => {
    if (data.email && s.users.some((u) => u.email?.toLowerCase() === data.email.toLowerCase())) return fail('That email is already in use.');
    if (data.urn && s.users.some((u) => u.urn === data.urn)) return fail('That URN already exists.');
    const temp = tempPassword();
    const u = { status: 'ACTIVE', photo: null, failedLogins: 0, createdAt: now(), prefs: { email: true, reminders: true }, ...data, id: uid('u'), password: temp, mustChangePassword: true };
    if (u.role === 'STUDENT') u.enrolled = true;
    s.users.push(u);
    audit(s, 'USER_CREATED', 'User', u.id, `${u.role}: ${u.name}`);
    return ok('User created.', { tempPassword: temp, id: u.id });
  });
}

export function updateUser(id, patch) {
  return store.mutate((s) => {
    const u = byId(s.users, id);
    Object.assign(u, patch);
    audit(s, 'USER_UPDATED', 'User', id, `${u.name}: ${Object.keys(patch).join(', ')}`);
    return ok('User updated.');
  });
}

export function setUserStatus(id, status) {
  return store.mutate((s) => {
    const u = byId(s.users, id);
    u.status = status;
    u.failedLogins = 0;
    audit(s, status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'User', id, u.name);
    return ok(`${u.name} is now ${status === 'ACTIVE' ? 'active' : 'inactive'}.`);
  });
}

export function toggleEnrollment(id) {
  return store.mutate((s) => {
    const u = byId(s.users, id);
    u.enrolled = !u.enrolled;
    audit(s, u.enrolled ? 'ENROLLMENT_RESTORED' : 'ENROLLMENT_SUSPENDED', 'User', id, u.name);
    return ok(`${u.name} is ${u.enrolled ? 'enrolled again' : 'no longer enrolled'}. Passes ${u.enrolled ? 'work again' : 'are blocked at the gate'}.`);
  });
}

export function resetUserPassword(id) {
  return store.mutate((s) => {
    const u = byId(s.users, id);
    const temp = tempPassword();
    u.password = temp;
    u.mustChangePassword = true;
    u.failedLogins = 0;
    if (u.status === 'LOCKED') u.status = 'ACTIVE';
    audit(s, 'PASSWORD_RESET_BY_ADMIN', 'User', id, u.name);
    return ok('Temporary password generated.', { tempPassword: temp });
  });
}

export function importStudents(rows) {
  return store.mutate((s) => {
    let added = 0;
    rows.forEach((r) => {
      if (s.users.some((u) => u.urn === r.urn)) return;
      s.users.push({
        id: uid('u'), role: 'STUDENT', status: 'ACTIVE', enrolled: true, photo: null, failedLogins: 0, createdAt: now(),
        mustChangePassword: true, prefs: { email: true, reminders: true }, ...r,
      });
      added++;
    });
    audit(s, 'STUDENT_IMPORT', 'User', null, `Imported ${added} students (${rows.length - added} skipped)`);
    return ok(`${added} students imported.`, { added });
  });
}

// ------------------------------------------------------------------ admin: departments & campus
export function saveDepartment(dep, isNew) {
  return store.mutate((s) => {
    if (isNew) {
      if (byId(s.departments, dep.id)) return fail('A department with that code already exists.');
      s.departments.push(dep);
    } else Object.assign(byId(s.departments, dep.id), dep);
    audit(s, isNew ? 'DEPARTMENT_CREATED' : 'DEPARTMENT_UPDATED', 'Department', dep.id, dep.name);
    return ok('Department saved.');
  });
}

export function deleteDepartment(code) {
  return store.mutate((s) => {
    if (s.users.some((u) => u.dept === code)) return fail('Students still belong to this department.');
    s.departments = s.departments.filter((d) => d.id !== code);
    audit(s, 'DEPARTMENT_DELETED', 'Department', code);
    return ok('Department deleted.');
  });
}

export function saveLocation(loc) {
  return store.mutate((s) => {
    const existing = byId(s.locations, loc.id);
    if (existing) Object.assign(existing, loc);
    else s.locations.push({ ...loc, id: loc.id || uid('l') });
    audit(s, existing ? 'LOCATION_UPDATED' : 'LOCATION_CREATED', 'Location', loc.id, loc.name);
    return ok('Location saved.');
  });
}

export function deleteLocation(id) {
  return store.mutate((s) => {
    if (s.events.some((e) => e.venueId === id && e.status !== 'CANCELLED')) return fail('Events are using this venue.');
    const gateIds = s.gates.filter((g) => g.locationId === id).map((g) => g.id);
    s.gates = s.gates.filter((g) => g.locationId !== id);
    s.events.forEach((e) => { e.gateIds = e.gateIds.filter((g) => !gateIds.includes(g)); });
    s.locations = s.locations.filter((l) => l.id !== id);
    audit(s, 'LOCATION_DELETED', 'Location', id);
    return ok('Location deleted.');
  });
}

export function addGate(locationId, name) {
  return store.mutate((s) => {
    s.gates.push({ id: uid('g'), locationId, name });
    audit(s, 'GATE_CREATED', 'Location', locationId, name);
    return ok('Gate added.');
  });
}

export function deleteGate(gateId) {
  return store.mutate((s) => {
    if (s.events.some((e) => e.gateIds.includes(gateId) && ['PUBLISHED', 'CLOSED'].includes(e.status))) return fail('An upcoming event uses this gate.');
    s.gates = s.gates.filter((g) => g.id !== gateId);
    audit(s, 'GATE_DELETED', 'Gate', gateId);
    return ok('Gate removed.');
  });
}

// ------------------------------------------------------------------ notifications
export function markRead(id) {
  store.mutate((s) => { const n = byId(s.notifications, id); if (n) n.read = true; });
}
export function markAllRead() {
  store.mutate((s) => { const uidNow = session.get(); s.notifications.forEach((n) => { if (n.userId === uidNow) n.read = true; }); });
}

export function logExport(what) {
  store.mutate((s) => audit(s, 'REPORT_EXPORTED', 'Report', null, what));
}
