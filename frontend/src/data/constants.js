export const ENTRY_WINDOW_MIN = 60; // gates open this many minutes before an event starts

export const ROLES = {
  ADMIN: { label: 'Administrator', icon: 'shield-lock', tone: 'danger' },
  ORGANIZER: { label: 'Organizer', icon: 'easel2', tone: 'primary' },
  STUDENT: { label: 'Student', icon: 'mortarboard', tone: 'success' },
  SECURITY: { label: 'Security', icon: 'shield-check', tone: 'warning' },
  GUEST: { label: 'Guest', icon: 'person-badge', tone: 'info' },
};

export const CATEGORIES = {
  TECHNICAL: { label: 'Technical', icon: 'cpu', color: '#262a7a' },
  WORKSHOP: { label: 'Workshop', icon: 'tools', color: '#5b3f99' },
  CULTURAL: { label: 'Cultural', icon: 'music-note-beamed', color: '#9b1c1c' },
  SPORTS: { label: 'Sports', icon: 'trophy', color: '#1f7a4d' },
  ACADEMIC: { label: 'Academic', icon: 'book', color: '#0f6f86' },
  SOCIAL: { label: 'Social', icon: 'heart-pulse', color: '#b45309' },
};

export const MODES = {
  OPEN: {
    label: 'Open registration', short: 'Open', icon: 'lightning-charge',
    desc: 'First come, first served. Seats are confirmed instantly until capacity is reached, then a waitlist opens.',
  },
  APPROVAL: {
    label: 'Approval required', short: 'Approval', icon: 'person-check',
    desc: 'Students request a seat; organizers approve or reject each request.',
  },
  AUTO_ASSIGN: {
    label: 'Auto-assigned', short: 'Auto-assigned', icon: 'magic',
    desc: 'No sign-up. Organizers issue passes to every eligible student in one step.',
  },
};

export const VENUE_TYPES = {
  ACADEMIC: { label: 'Academic block', icon: 'building', color: '#262a7a' },
  ADMIN: { label: 'Administrative', icon: 'bank', color: '#5f6672' },
  LAB: { label: 'Lab / Workshop', icon: 'gear', color: '#5b3f99' },
  AUDITORIUM: { label: 'Auditorium', icon: 'easel', color: '#9b1c1c' },
  SEMINAR_HALL: { label: 'Seminar hall', icon: 'mic', color: '#b45309' },
  LIBRARY: { label: 'Library', icon: 'book', color: '#0f6f86' },
  SPORTS: { label: 'Sports', icon: 'trophy', color: '#1f7a4d' },
  CAFETERIA: { label: 'Cafeteria', icon: 'cup-hot', color: '#a16207' },
  PARKING: { label: 'Parking', icon: 'p-square', color: '#475569' },
  OTHER: { label: 'Other', icon: 'geo-alt', color: '#7b8190' },
};

export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
export const SECTIONS = ['A', 'B', 'C', 'D'];

export const REG_STATUS = {
  CONFIRMED: { label: 'Confirmed', tone: 'success', icon: 'check-circle' },
  PENDING: { label: 'Pending approval', tone: 'warning', icon: 'hourglass-split' },
  WAITLISTED: { label: 'Waitlisted', tone: 'info', icon: 'list-ol' },
  REJECTED: { label: 'Not approved', tone: 'danger', icon: 'x-circle' },
  CANCELLED: { label: 'Cancelled', tone: 'secondary', icon: 'slash-circle' },
};

export const PASS_STATUS = {
  ACTIVE: { label: 'Valid', tone: 'success', icon: 'qr-code' },
  USED: { label: 'Checked in', tone: 'primary', icon: 'door-open' },
  REVOKED: { label: 'Revoked', tone: 'danger', icon: 'slash-circle' },
  EXPIRED: { label: 'Expired', tone: 'secondary', icon: 'hourglass-bottom' },
};

export const EVENT_STATUS = {
  DRAFT: { label: 'Draft', tone: 'secondary', icon: 'pencil' },
  PUBLISHED: { label: 'Published', tone: 'success', icon: 'broadcast' },
  CLOSED: { label: 'Registration closed', tone: 'warning', icon: 'lock' },
  COMPLETED: { label: 'Completed', tone: 'primary', icon: 'flag' },
  CANCELLED: { label: 'Cancelled', tone: 'danger', icon: 'x-octagon' },
};

export const USER_STATUS = {
  ACTIVE: { label: 'Active', tone: 'success', icon: 'check-circle' },
  INACTIVE: { label: 'Inactive', tone: 'secondary', icon: 'pause-circle' },
  LOCKED: { label: 'Locked', tone: 'danger', icon: 'lock' },
};

/** Titles and colours for the result codes returned by POST /scan/verify. */
export const SCAN_RESULTS = {
  SUCCESS: { tone: 'success', icon: 'check-circle-fill', title: 'Entry allowed' },
  ALREADY_USED: { tone: 'warning', icon: 'exclamation-triangle-fill', title: 'Already checked in' },
  OUTSIDE_WINDOW: { tone: 'warning', icon: 'clock-fill', title: 'Outside entry time' },
  WRONG_EVENT: { tone: 'danger', icon: 'x-octagon-fill', title: 'Wrong event' },
  REVOKED: { tone: 'danger', icon: 'slash-circle-fill', title: 'Pass revoked' },
  EXPIRED: { tone: 'danger', icon: 'hourglass-bottom', title: 'Pass expired' },
  NOT_APPROVED: { tone: 'danger', icon: 'hourglass-split', title: 'Not confirmed' },
  ACCOUNT_INACTIVE: { tone: 'danger', icon: 'person-x-fill', title: 'Account inactive' },
  INVALID_TOKEN: { tone: 'danger', icon: 'question-octagon-fill', title: 'Pass not found' },
  INVALID_FORMAT: { tone: 'danger', icon: 'qr-code', title: 'Not an event pass' },
  NOT_ASSIGNED: { tone: 'danger', icon: 'shield-x', title: 'Not assigned here' },
  // Not a scan result: an organizer removed a wrongly recorded entry (live attendance feed).
  REMOVED: { tone: 'secondary', icon: 'person-dash-fill', title: 'Marked absent' },
};

/** How an entry was recorded. */
export const ENTRY_METHODS = {
  QR: { label: 'QR scan', icon: 'qr-code-scan' },
  MANUAL: { label: 'Code typed', icon: 'keyboard' },
  OVERRIDE: { label: 'Marked by organizer', icon: 'person-check' },
};

/** Development only: seeded accounts (password "demo") shown on the login page. */
export const DEMO_ACCOUNTS = [
  { email: 'simran.kaur@gndec.demo', name: 'Simran Kaur', role: 'STUDENT', blurb: 'CSE · Sem 7 — has passes; an event is live today' },
  { email: 'arjun.mehta@gndec.demo', name: 'Arjun Mehta', role: 'STUDENT', blurb: 'ME · Sem 3 — first sign-in, must set a new password' },
  { email: 'harjit.kaur@gndec.demo', name: 'Prof. Harjit Kaur', role: 'ORGANIZER', blurb: "CSE Dept — runs today's lecture and the hackathon" },
  { email: 'rajinder.singh@gndec.demo', name: 'Mr. Rajinder Singh', role: 'ORGANIZER', blurb: 'Cultural & Sports Committee — approvals pending' },
  { email: 'gurmeet.security@gndec.demo', name: 'Gurmeet Singh', role: 'SECURITY', blurb: 'On duty today at Main Auditorium, Gate A' },
  { email: 'admin@gndec.demo', name: 'Portal Administrator', role: 'ADMIN', blurb: 'Users, student import, departments, venues' },
];
