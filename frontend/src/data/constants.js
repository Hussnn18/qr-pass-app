export const ENTRY_WINDOW_MIN = 60; // gates open this many minutes before an event starts
export const DEMO_OTP = '482913';
export const DEMO_PASSWORD = 'demo';

export const ROLES = {
  ADMIN: { label: 'Administrator', icon: 'shield-lock', tone: 'danger' },
  ORGANIZER: { label: 'Organizer', icon: 'easel2', tone: 'primary' },
  STUDENT: { label: 'Student', icon: 'mortarboard', tone: 'success' },
  GUEST: { label: 'Guest', icon: 'person-badge', tone: 'info' },
  SECURITY: { label: 'Security', icon: 'shield-check', tone: 'warning' },
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
    desc: 'Participants request a seat; organizers approve or reject each request.',
  },
  AUTO_ASSIGN: {
    label: 'Auto-assigned', short: 'Auto-assigned', icon: 'magic',
    desc: 'No sign-up. Organizers issue passes to every eligible student in one click.',
  },
};

export const LOCATION_TYPES = {
  ACADEMIC: { label: 'Academic block', icon: 'building', color: '#262a7a' },
  ADMIN: { label: 'Administrative', icon: 'bank', color: '#4b5563' },
  LAB: { label: 'Lab / Workshop', icon: 'gear', color: '#5b3f99' },
  AUDITORIUM: { label: 'Auditorium', icon: 'easel', color: '#9b1c1c' },
  SEMINAR_HALL: { label: 'Seminar hall', icon: 'mic', color: '#c2410c' },
  LIBRARY: { label: 'Library', icon: 'book', color: '#0f6f86' },
  SPORTS: { label: 'Sports', icon: 'trophy', color: '#1f7a4d' },
  CAFETERIA: { label: 'Cafeteria', icon: 'cup-hot', color: '#b45309' },
  PARKING: { label: 'Parking', icon: 'p-square', color: '#334155' },
  OTHER: { label: 'Other', icon: 'geo-alt', color: '#6b7280' },
};

export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
export const SECTIONS = ['A', 'B', 'C', 'D'];

export const REG_STATUS = {
  APPROVED: { label: 'Confirmed', tone: 'success', icon: 'check-circle' },
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
  PENDING_VERIFICATION: { label: 'Unverified', tone: 'warning', icon: 'envelope-exclamation' },
};

export const SCAN_RESULTS = {
  SUCCESS: { tone: 'success', icon: 'check-circle-fill', title: 'Entry allowed', message: 'Pass verified. Allow entry.' },
  ALREADY_USED: { tone: 'warning', icon: 'exclamation-triangle-fill', title: 'Already checked in', message: 'This pass has already been used for entry.' },
  WRONG_EVENT: { tone: 'danger', icon: 'x-octagon-fill', title: 'Wrong event', message: 'This pass belongs to a different event.' },
  REVOKED: { tone: 'danger', icon: 'slash-circle-fill', title: 'Pass revoked', message: 'This pass was revoked by the organizer.' },
  EXPIRED: { tone: 'danger', icon: 'hourglass-bottom', title: 'Pass expired', message: 'This pass has expired.' },
  NOT_APPROVED: { tone: 'danger', icon: 'hourglass-split', title: 'Not approved', message: 'The registration for this pass is not approved.' },
  OUTSIDE_WINDOW: { tone: 'warning', icon: 'clock-fill', title: 'Outside entry time', message: 'Entry is not open right now.' },
  ACCOUNT_INACTIVE: { tone: 'danger', icon: 'person-x-fill', title: 'Account inactive', message: "The pass holder's account or enrollment is inactive." },
  INVALID_TOKEN: { tone: 'danger', icon: 'question-octagon-fill', title: 'Pass not found', message: 'This QR code is not a valid pass in the system.' },
  INVALID_FORMAT: { tone: 'danger', icon: 'qr-code', title: 'Not an event pass', message: 'This QR code is not a campus event pass.' },
  NOT_ASSIGNED: { tone: 'danger', icon: 'shield-x', title: 'Not assigned here', message: 'You are not assigned to scan at this gate.' },
};

export const DEMO_ACCOUNTS = [
  { id: 'u_stu1', blurb: 'CSE · Sem 7 — has passes and an event live today' },
  { id: 'u_stu2', blurb: 'ME · Sem 3 — first login, must set a new password' },
  { id: 'u_guest1', blurb: 'External participant — sees outsider-friendly events only' },
  { id: 'u_org1', blurb: "CSE Dept — runs today's live lecture and the hackathon" },
  { id: 'u_org2', blurb: 'Cultural & Sports Committee — approvals pending' },
  { id: 'u_sec1', blurb: 'On duty today at Main Auditorium, Gate A' },
  { id: 'u_admin', blurb: 'Control panel, campus map editor, analytics, audit log' },
];

export const REVIEW_FLOWS = [
  { id: 'f1', title: 'Browse events, filter, and read eligibility reasons', as: 'u_stu1', to: '/events' },
  { id: 'f2', title: 'Request a seat in an approval-based event', as: 'u_stu1', to: '/events/e3' },
  { id: 'f3', title: 'Organizer approves / rejects pending requests', as: 'u_org1', to: '/manage/events/e3?tab=registrations' },
  { id: 'f4', title: 'Open a pass: full-screen QR, PDF, add to calendar', as: 'u_stu1', to: '/my/passes' },
  { id: 'f5', title: 'Gate scan: valid → already used → wrong event', as: 'u_sec1', to: '/scan' },
  { id: 'f6', title: 'Live attendance with simulated gate traffic', as: 'u_org1', to: '/manage/events/e1?tab=live' },
  { id: 'f7', title: 'First login password change, then join a waitlist', as: 'u_stu2', to: '/events/e2' },
  { id: 'f8', title: 'Guest sign-up with email OTP', as: null, to: '/signup' },
  { id: 'f9', title: 'Create an event with the 6-step wizard', as: 'u_org2', to: '/manage/events/new' },
  { id: 'f10', title: 'Bulk-import students from CSV', as: 'u_admin', to: '/admin/import' },
  { id: 'f11', title: 'Place / move a venue on the campus map', as: 'u_admin', to: '/admin/campus' },
  { id: 'f12', title: 'Analytics dashboards and report exports', as: 'u_admin', to: '/analytics' },
  { id: 'f13', title: 'Audit log shows the actions you just took', as: 'u_admin', to: '/admin/audit' },
  { id: 'f14', title: 'Repeat key screens at phone width (375 px)', as: null, to: null },
];
