import { checkEligibility } from '../utils/eligibility';
import { randomToken, passCode } from '../utils/ids';

/** Bump when the shape of the seed changes so old localStorage data is replaced. */
export const SEED_VERSION = 2;

const MIN = 6e4;
const HOUR = 36e5;
const DAY = 864e5;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FEMALE = ['Gurleen', 'Jaspreet', 'Navjot', 'Tanvi', 'Ishita', 'Riya', 'Pooja', 'Mehak', 'Ekam', 'Muskan', 'Parul', 'Sukhman', 'Vanshika', 'Amrit', 'Bhavya', 'Damanpreet', 'Inderjeet', 'Kirandeep', 'Mansi', 'Nimrat', 'Rupinder', 'Urvashi', 'Harleen', 'Sanya', 'Prabhleen', 'Avneet', 'Khushi', 'Jasleen', 'Aditi', 'Manmeet'];
const MALE = ['Arshdeep', 'Harman', 'Karan', 'Manpreet', 'Prabhjot', 'Rajveer', 'Sahil', 'Kunal', 'Aditya', 'Rohit', 'Ankit', 'Diljot', 'Lovepreet', 'Nikhil', 'Tarun', 'Yuvraj', 'Chetan', 'Gagandeep', 'Hardik', 'Jatin', 'Lakshay', 'Omkar', 'Pranav', 'Shubham', 'Taranjot', 'Gurkirat', 'Ishaan', 'Jaskaran', 'Mohit', 'Varun'];
const SURNAMES = ['Sharma', 'Verma', 'Gupta', 'Arora', 'Bansal', 'Malhotra', 'Mehta', 'Goyal', 'Sood', 'Jindal', 'Garg', 'Sethi', 'Bedi', 'Kapoor', 'Jain', 'Mittal', 'Bhatia', 'Grewal', 'Sandhu', 'Dhillon', 'Sidhu', 'Gill', 'Brar', 'Chawla'];

const DEPT_PLAN = [['CSE', 30], ['IT', 20], ['ECE', 20], ['EE', 16], ['ME', 16], ['CE', 12], ['PE', 6]];
const DEPT_NUM = { CE: '01', CSE: '02', EE: '03', ECE: '04', ME: '05', PE: '06', IT: '15' };

const IDEAS = [
  'Idea: QR-based lab equipment issue tracker',
  'Idea: Crowd-sourced campus lost & found',
  'Idea: Smart energy dashboard for hostels',
  'Idea: Bus-route live tracker for day scholars',
  'Idea: Accessible campus navigation for wheelchair users',
  'Idea: AI timetable clash detector',
  'Idea: Canteen pre-order and pickup slots',
  'Idea: Peer tutoring matchmaking app',
  'Idea: Waste segregation reward system',
  'Idea: Placement prep tracker with mock tests',
];

export function buildSeed(now = Date.now()) {
  const rand = mulberry32(20261002);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  let seq = 0;
  const id = (p) => `${p}_${(++seq).toString(36)}`;
  const at = (dayOffset, h, m = 0) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };

  // Academic calendar: July–December runs odd semesters.
  const today = new Date(now);
  const oddSem = today.getMonth() >= 6;
  const ayStart = oddSem ? today.getFullYear() : today.getFullYear() - 1;
  const semFor = (batch) => (ayStart - batch) * 2 + (oddSem ? 1 : 2);
  const yr = (k) => (oddSem ? 2 * k - 1 : 2 * k); // semester for year-of-study k
  const batches = [ayStart - 3, ayStart - 2, ayStart - 1, ayStart];
  const year = today.getFullYear();

  const departments = [
    { id: 'CSE', name: 'Computer Science & Engineering' },
    { id: 'IT', name: 'Information Technology' },
    { id: 'ECE', name: 'Electronics & Communication Engineering' },
    { id: 'EE', name: 'Electrical Engineering' },
    { id: 'ME', name: 'Mechanical Engineering' },
    { id: 'CE', name: 'Civil Engineering' },
    { id: 'PE', name: 'Production Engineering' },
  ];

  const base = { status: 'ACTIVE', mustChangePassword: false, photo: null, failedLogins: 0, lastLoginAt: null, createdAt: now - 200 * DAY, prefs: { email: true, reminders: true } };
  const phone = () => `+91 99999 ${String(10000 + Math.floor(rand() * 89999)).slice(0, 5)}`;

  const users = [
    { ...base, id: 'u_admin', role: 'ADMIN', name: 'Portal Administrator', email: 'admin@gndec.demo', phone: phone(), unit: 'Student Welfare Office' },
    { ...base, id: 'u_org1', role: 'ORGANIZER', name: 'Prof. Harjit Kaur', email: 'harjit.kaur@gndec.demo', phone: phone(), unit: 'CSE Department' },
    { ...base, id: 'u_org2', role: 'ORGANIZER', name: 'Mr. Rajinder Singh', email: 'rajinder.singh@gndec.demo', phone: phone(), unit: 'Cultural & Sports Committee' },
    { ...base, id: 'u_org3', role: 'ORGANIZER', name: 'Dr. Navneet Sharma', email: 'navneet.sharma@gndec.demo', phone: phone(), unit: 'ECE · Robotics Club' },
    { ...base, id: 'u_sec1', role: 'SECURITY', name: 'Gurmeet Singh', email: 'gurmeet.security@gndec.demo', phone: phone(), unit: 'Campus Security' },
    { ...base, id: 'u_sec2', role: 'SECURITY', name: 'Balwinder Kumar', email: 'balwinder.security@gndec.demo', phone: phone(), unit: 'Campus Security' },
    { ...base, id: 'u_sec3', role: 'SECURITY', name: 'Sukhdev Singh', email: 'sukhdev.security@gndec.demo', phone: phone(), unit: 'Campus Security', createdAt: now - 5 * HOUR },
    { ...base, id: 'u_guest1', role: 'GUEST', name: 'Ananya Verma', email: 'ananya.verma@pau.demo', phone: phone(), organization: 'Punjab Agricultural University', verifiedAt: now - 9 * DAY, createdAt: now - 9 * DAY },
    { ...base, id: 'u_guest2', role: 'GUEST', name: 'Rohan Batra', email: 'rohan.batra@pcte.demo', phone: phone(), organization: 'PCTE Group of Institutes', verifiedAt: now - 6 * DAY, createdAt: now - 6 * DAY },
  ];

  const student = (o) => ({ ...base, role: 'STUDENT', enrolled: true, phone: phone(), ...o });
  const stu1Batch = ayStart - 3;
  const stu2Batch = ayStart - 1;
  users.push(student({
    id: 'u_stu1', name: 'Simran Kaur', urn: `${String(stu1Batch).slice(2)}02511`, email: `simran.kaur@gndec.demo`,
    dept: 'CSE', semester: semFor(stu1Batch), section: 'A', batch: stu1Batch, dob: `${stu1Batch - 18}-03-14`,
  }));
  users.push(student({
    id: 'u_stu2', name: 'Arjun Mehta', urn: `${String(stu2Batch).slice(2)}05318`, email: `arjun.mehta@gndec.demo`,
    dept: 'ME', semester: semFor(stu2Batch), section: 'B', batch: stu2Batch, dob: `${stu2Batch - 18}-11-02`, mustChangePassword: true,
  }));

  const usedNames = new Set(['Simran Kaur', 'Arjun Mehta']);
  let n = 0;
  for (const [dept, count] of DEPT_PLAN) {
    for (let i = 0; i < count; i++) {
      const batch = batches[i % 4];
      const female = rand() < 0.45;
      let name;
      do {
        const first = pick(female ? FEMALE : MALE);
        const sur = rand() < 0.45 ? (female ? 'Kaur' : 'Singh') : pick(SURNAMES);
        name = `${first} ${sur}`;
      } while (usedNames.has(name));
      usedNames.add(name);
      const urn = `${String(batch).slice(2)}${DEPT_NUM[dept]}${String(100 + n * 3 + Math.floor(rand() * 3)).padStart(3, '0')}`;
      n++;
      const month = 1 + Math.floor(rand() * 12);
      const day = 1 + Math.floor(rand() * 27);
      users.push(student({
        id: id('u'), name, urn, email: `${name.split(' ')[0].toLowerCase()}.${urn}@gndec.demo`,
        dept, semester: semFor(batch), section: ['A', 'B', 'C'][i % 3], batch,
        dob: `${batch - 18}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        createdAt: now - 30 * DAY,
      }));
    }
  }
  const students = users.filter((u) => u.role === 'STUDENT');
  const U = Object.fromEntries(users.map((u) => [u.id, u]));
  // One student whose enrollment was suspended — useful for the "account inactive" scan state.
  const suspended = students.find((u) => u.dept === 'CE' && u.semester === yr(4));
  if (suspended) suspended.enrolled = false;

  // ---------------------------------------------------------------- campus
  // Coordinates are taken from OpenStreetMap features inside the GNDEC campus (© OpenStreetMap contributors).
  const L = (id, name, type, building, floor, lat, lng, description, canHostEvents, capacity) =>
    ({ id, name, type, building, floor, lat, lng, description, canHostEvents, capacity });
  const locations = [
    L('l_gate', 'Main Gate (Gill Road)', 'OTHER', 'Security check post', '—', 30.86072, 75.8595, 'Main entrance with the security check post and visitor desk.', false, null),
    L('l_admin', 'Admin Block', 'ADMIN', 'Admin Block', 'G–2', 30.85884, 75.86033, "Principal's office, accounts and the Student Welfare office.", false, null),
    L('l_lib', 'Central Library', 'LIBRARY', 'Library Building', 'G–1', 30.85832, 75.86034, 'Reading halls, e-library and digital resource centre.', true, 60),
    L('l_audi', 'Main Auditorium', 'AUDITORIUM', 'Auditorium', 'G', 30.85888, 75.86074, 'Auditorium with stage, projection and sound system.', true, 650),
    L('l_cse', 'CSE Department', 'ACADEMIC', 'Dept. of Computer Sc. & Engg.', 'G–3', 30.85989, 75.86009, 'Department of Computer Science & Engineering — classrooms and labs.', true, 120),
    L('l_sem', 'Seminar Hall (CSE Dept.)', 'SEMINAR_HALL', 'Dept. of Computer Sc. & Engg.', '1st floor', 30.86008, 75.86024, 'Seminar hall with 150 seats, projector and podium.', true, 150),
    L('l_it', 'IT Department', 'ACADEMIC', 'Dept. of Information Technology', 'G–2', 30.86041, 75.86029, 'Department of Information Technology.', true, 100),
    L('l_ee', 'ECE Department', 'LAB', 'Electronics & Communication Engg.', 'G–2', 30.8581, 75.8612, 'ECE department with robotics and embedded systems labs.', true, 60),
    L('l_appsci', 'Applied Science Block', 'ACADEMIC', 'Dept. of Applied Science', 'G–2', 30.85869, 75.8617, 'Physics, chemistry and English labs.', true, 80),
    L('l_mech', 'Central Workshop', 'LAB', 'Workshop', 'G', 30.85898, 75.86201, 'Machine shop, welding and fitting sections.', true, 40),
    L('l_oat', 'Open Air Theatre', 'AUDITORIUM', 'OAT', '—', 30.8607, 75.86214, 'Open-air stage for cultural evenings and fests.', true, 1200),
    L('l_ground', 'Running / Cricket Ground', 'SPORTS', 'Athletics ground', '—', 30.85889, 75.86359, 'Running track and cricket ground.', true, 3000),
    L('l_indoor', 'Sports Complex', 'SPORTS', 'Sports Complex', 'G', 30.85817, 75.86348, 'Indoor courts and sports office.', true, 300),
    L('l_football', 'Football Ground', 'SPORTS', 'Football ground', '—', 30.8606, 75.86155, 'Main football ground.', true, 1500),
    L('l_canteen', 'Day Scholar Canteen', 'CAFETERIA', 'Canteen', 'G', 30.8611, 75.86271, 'Main canteen for day scholars.', false, null),
    L('l_disp', 'College Dispensary', 'OTHER', 'Dispensary', 'G', 30.86146, 75.86115, 'First aid and the campus doctor.', false, null),
    L('l_park', 'Main Parking', 'PARKING', 'GNE Boys Parking', '—', 30.85989, 75.85983, 'Parking for students and visitors, next to the main gate.', false, null),
    L('l_tcc', 'Testing & Consultancy Cell', 'ADMIN', 'TCC', 'G', 30.85815, 75.86035, 'Industry consultancy and testing office; meeting room.', true, 40),
  ];
  const gates = [
    { id: 'g_audi_a', locationId: 'l_audi', name: 'Gate A (Front)' },
    { id: 'g_audi_b', locationId: 'l_audi', name: 'Gate B (Side)' },
    { id: 'g_sem', locationId: 'l_sem', name: 'Main Door' },
    { id: 'g_cse', locationId: 'l_cse', name: 'Ground Floor Entrance' },
    { id: 'g_it', locationId: 'l_it', name: 'Main Entrance' },
    { id: 'g_ee', locationId: 'l_ee', name: 'Lab Entrance' },
    { id: 'g_mech', locationId: 'l_mech', name: 'Workshop Gate' },
    { id: 'g_appsci', locationId: 'l_appsci', name: 'Main Entrance' },
    { id: 'g_oat_1', locationId: 'l_oat', name: 'Gate 1' },
    { id: 'g_oat_2', locationId: 'l_oat', name: 'Gate 2' },
    { id: 'g_ground_n', locationId: 'l_ground', name: 'North Gate' },
    { id: 'g_ground_s', locationId: 'l_ground', name: 'South Gate' },
    { id: 'g_indoor', locationId: 'l_indoor', name: 'Main Door' },
    { id: 'g_tcc', locationId: 'l_tcc', name: 'Reception' },
    { id: 'g_football', locationId: 'l_football', name: 'Pavilion Gate' },
    { id: 'g_lib', locationId: 'l_lib', name: 'Library Foyer' },
  ];

  // ---------------------------------------------------------------- events
  const liveStart = (() => {
    const t = now - 30 * MIN;
    return t - (t % (15 * MIN));
  })();
  const all = { departments: [], semesters: [], sections: [] };
  const ev = (o) => ({ description: '', allowOutsiders: false, eligibility: all, gateIds: [], status: 'PUBLISHED', createdAt: now - 20 * DAY, createdBy: o.organizerIds[0], ...o });
  const events = [
    ev({
      id: 'e1', title: 'AI in Industry — Guest Lecture', category: 'TECHNICAL', venueId: 'l_audi',
      startsAt: liveStart, endsAt: liveStart + 3 * HOUR, regOpensAt: liveStart - 10 * DAY, regClosesAt: liveStart,
      capacity: 300, mode: 'OPEN', allowOutsiders: true, eligibility: { ...all, semesters: [yr(3), yr(4)] },
      organizerIds: ['u_org1'], gateIds: ['g_audi_a', 'g_audi_b'], createdAt: now - 12 * DAY,
      description: 'An industry expert session on how AI is used in manufacturing, healthcare and finance, followed by an open Q&A.\n\nOpen to 3rd and 4th year students and to registered external participants. Keep your digital pass ready at the auditorium gates.',
    }),
    ev({
      id: 'e2', title: 'Robotics Workshop — Build a Line Follower', category: 'WORKSHOP', venueId: 'l_ee',
      startsAt: at(5, 10), endsAt: at(5, 16), regOpensAt: now - 6 * DAY, regClosesAt: at(4, 18),
      capacity: 30, mode: 'OPEN', eligibility: { ...all, departments: ['ECE', 'EE', 'ME'], semesters: [yr(2), yr(3), yr(4)] },
      organizerIds: ['u_org3'], gateIds: ['g_ee'],
      description: 'Hands-on workshop by the Robotics Club. Teams of two build and program a line-following robot.\n\nKits are provided. Bring a laptop with the Arduino IDE installed.',
    }),
    ev({
      id: 'e3', title: `CodeSprint Hackathon ${year}`, category: 'TECHNICAL', venueId: 'l_cse',
      startsAt: at(12, 9), endsAt: at(13, 17), regOpensAt: now - 3 * DAY, regClosesAt: at(8, 23, 59),
      capacity: 120, mode: 'APPROVAL', eligibility: { ...all, departments: ['CSE', 'IT'], semesters: [yr(3), yr(4)] },
      organizerIds: ['u_org1'], gateIds: ['g_cse', 'g_sem'],
      description: 'A 32-hour hackathon on real campus problems: attendance, energy, safety and accessibility. Teams of 2–4.\n\nSelection is based on the idea summary you submit with your request. Meals and overnight lab access are provided.',
    }),
    ev({
      id: 'e4', title: `Annual Athletics Meet ${year}`, category: 'SPORTS', venueId: 'l_ground',
      startsAt: at(20, 8), endsAt: at(20, 17), regOpensAt: now - 2 * DAY, regClosesAt: at(19, 18),
      capacity: 2000, mode: 'AUTO_ASSIGN', organizerIds: ['u_org2'], gateIds: ['g_ground_n', 'g_ground_s'],
      description: 'Track and field events, the inter-department relay and tug of war.\n\nEvery enrolled student receives a spectator pass automatically. Athletes register through their department sports coordinator.',
    }),
    ev({
      id: 'e5', title: 'Resume Building & Placement Talk', category: 'ACADEMIC', venueId: 'l_sem',
      startsAt: at(-7, 11), endsAt: at(-7, 13), regOpensAt: at(-17, 10), regClosesAt: at(-8, 18),
      capacity: 80, mode: 'OPEN', eligibility: { ...all, semesters: [yr(3), yr(4)] }, status: 'COMPLETED',
      organizerIds: ['u_org1'], gateIds: ['g_sem'], createdAt: now - 25 * DAY,
      description: 'The Training & Placement Cell explains what recruiters look for and reviews sample resumes live.',
    }),
    ev({
      id: 'e6', title: 'Inter-College Debate: Technology & Society', category: 'CULTURAL', venueId: 'l_audi',
      startsAt: at(9, 14), endsAt: at(9, 17), regOpensAt: now - 4 * DAY, regClosesAt: at(7, 18),
      capacity: 150, mode: 'APPROVAL', allowOutsiders: true, organizerIds: ['u_org2'], gateIds: ['g_audi_a'],
      description: 'Teams from colleges across Ludhiana debate the motion "Technology does more to divide society than unite it".\n\nSpeakers are shortlisted by the organizing committee; audience requests are approved in order.',
    }),
    ev({
      id: 'e7', title: 'Blood Donation Camp', category: 'SOCIAL', venueId: 'l_indoor',
      startsAt: at(3, 9), endsAt: at(3, 15), regOpensAt: now - 8 * DAY, regClosesAt: at(2, 18),
      capacity: 200, mode: 'OPEN', status: 'CANCELLED', cancelReason: 'Postponed — the blood bank team is unavailable. A new date will be announced.',
      organizerIds: ['u_org2'], gateIds: ['g_indoor'],
      description: 'Voluntary blood donation camp with the district blood bank. Donors receive a certificate and refreshments.',
    }),
    ev({
      id: 'e8', title: 'Campus Photography Walk', category: 'CULTURAL', venueId: 'l_lib',
      startsAt: at(25, 7), endsAt: at(25, 10), regOpensAt: at(10, 10), regClosesAt: at(23, 18),
      capacity: 40, mode: 'APPROVAL', status: 'DRAFT', organizerIds: ['u_org2'], gateIds: [], createdAt: now - 1 * DAY,
      description: 'An early-morning photo walk around campus with the Photography Club. Bring your own camera or phone.',
    }),
    ev({
      id: 'e9', title: 'Rang Punjab Da — Cultural Night', category: 'CULTURAL', venueId: 'l_oat',
      startsAt: at(15, 18), endsAt: at(15, 22), regOpensAt: now - 5 * DAY, regClosesAt: at(14, 20),
      capacity: 600, mode: 'OPEN', allowOutsiders: true, organizerIds: ['u_org2'], gateIds: ['g_oat_1', 'g_oat_2'],
      description: 'Bhangra, giddha, folk music and a food court run by student clubs.\n\nExternal guests are welcome with a registered pass.',
    }),
    ev({
      id: 'e10', title: 'Brainwave Tech Quiz', category: 'TECHNICAL', venueId: 'l_it',
      startsAt: at(-14, 14), endsAt: at(-14, 16), regOpensAt: at(-24, 10), regClosesAt: at(-15, 20),
      capacity: 100, mode: 'OPEN', eligibility: { ...all, departments: ['CSE', 'IT', 'ECE'] }, status: 'COMPLETED',
      organizerIds: ['u_org1'], gateIds: ['g_it'], createdAt: now - 30 * DAY,
      description: 'Three rounds of rapid-fire questions on computing, electronics and current tech.',
    }),
  ];
  const E = Object.fromEntries(events.map((e) => [e.id, e]));

  // ---------------------------------------------------------------- registrations
  const registrations = [];
  const passes = [];
  const attendance = [];
  const scanLogs = [];

  const regTime = (e) => e.regOpensAt + rand() * (Math.min(now, e.regClosesAt) - e.regOpensAt);
  function addReg(e, u, status, o = {}) {
    const registeredAt = Math.floor(o.at ?? regTime(e));
    const decidedAt = status === 'PENDING' ? null : Math.min(now - MIN, registeredAt + (e.mode === 'APPROVAL' ? (2 + rand() * 30) * HOUR : 0));
    const r = {
      id: id('r'), eventId: e.id, userId: u.id, status, registeredAt, decidedAt,
      decidedBy: decidedAt ? (e.mode === 'OPEN' && status !== 'CANCELLED' ? 'system' : e.organizerIds[0]) : null,
      reason: o.reason || null, note: o.note || null,
    };
    registrations.push(r);
    if (status === 'APPROVED' || o.passStatus) {
      passes.push({
        id: id('p'), registrationId: r.id, eventId: e.id, userId: u.id, token: randomToken(rand), code: passCode(rand),
        status: o.passStatus || 'ACTIVE', issuedAt: decidedAt || registeredAt, usedAt: null,
        revokedReason: o.passStatus === 'REVOKED' ? o.reason || 'Registration cancelled' : null,
      });
    }
    return r;
  }
  function checkIn(e, r, gateId, t, by) {
    const p = passes.find((x) => x.registrationId === r.id && x.status === 'ACTIVE');
    if (!p) return;
    p.status = 'USED';
    p.usedAt = t;
    attendance.push({ id: id('at'), registrationId: r.id, passId: p.id, eventId: e.id, userId: r.userId, gateId, at: t, by, method: 'QR' });
    scanLogs.push({ id: id('s'), eventId: e.id, gateId, passId: p.id, participantId: r.userId, by, result: 'SUCCESS', at: t, method: 'QR', deviceId: `dev_${by}` });
  }
  const failLog = (e, gateId, by, result, t, passId = null, participantId = null) =>
    scanLogs.push({ id: id('s'), eventId: e.id, gateId, passId, participantId, by, result, at: t, method: 'QR', deviceId: `dev_${by}` });
  const eligibleFor = (e) => students.filter((u) => checkEligibility(u, e).eligible);
  const expireRest = (e) => passes.forEach((p) => { if (p.eventId === e.id && p.status === 'ACTIVE') p.status = 'EXPIRED'; });

  // e1 — live now
  {
    const e = E.e1;
    const pool = shuffle(eligibleFor(e).filter((u) => u.id !== 'u_stu1'));
    addReg(e, U.u_stu1, 'APPROVED', { at: e.regOpensAt + 2 * HOUR });
    const approved = pool.slice(0, pool.length - 4).map((u) => addReg(e, u, 'APPROVED'));
    addReg(e, pool[pool.length - 1], 'CANCELLED', { passStatus: 'REVOKED', reason: 'Cancelled by participant' });
    addReg(e, U.u_guest1, 'APPROVED');
    addReg(e, U.u_guest2, 'APPROVED');
    if (suspended && !registrations.some((r) => r.eventId === 'e1' && r.userId === suspended.id)) addReg(e, suspended, 'APPROVED');
    const first = e.startsAt - 25 * MIN;
    const span = Math.max(now - 2 * MIN - first, 10 * MIN);
    const checkers = approved.slice(0, 27);
    checkers.forEach((r, i) => {
      const gate = i % 3 === 0 ? 'g_audi_b' : 'g_audi_a';
      checkIn(e, r, gate, Math.floor(first + (span * (i + 1)) / (checkers.length + 1)), gate === 'g_audi_b' ? 'u_sec2' : 'u_sec1');
    });
    const dup = passes.find((p) => p.registrationId === checkers[3]?.id);
    if (dup) failLog(e, 'g_audi_a', 'u_sec1', 'ALREADY_USED', now - 9 * MIN, dup.id, dup.userId);
    failLog(e, 'g_audi_a', 'u_sec1', 'INVALID_TOKEN', now - 14 * MIN);
    failLog(e, 'g_audi_b', 'u_sec2', 'INVALID_FORMAT', now - 6 * MIN);
  }
  // e2 — full, with waitlist
  {
    const e = E.e2;
    const pool = shuffle(eligibleFor(e).filter((u) => u.id !== 'u_stu2'));
    pool.slice(0, e.capacity).forEach((u) => addReg(e, u, 'APPROVED'));
    pool.slice(e.capacity, e.capacity + 4).forEach((u, i) => addReg(e, u, 'WAITLISTED', { at: now - (20 - i) * HOUR }));
  }
  // e3 — approval-based, many pending
  {
    const e = E.e3;
    const pool = shuffle(eligibleFor(e).filter((u) => u.id !== 'u_stu1'));
    pool.slice(0, 11).forEach((u) => addReg(e, u, 'APPROVED', { note: pick(IDEAS) }));
    pool.slice(11, 13).forEach((u, i) => addReg(e, u, 'REJECTED', { note: pick(IDEAS), reason: i ? 'Idea summary missing' : 'Team size above the limit of 4' }));
    pool.slice(13, 22).forEach((u) => addReg(e, u, 'PENDING', { note: pick(IDEAS) }));
  }
  // e4 — auto-assigned passes to everyone
  {
    const e = E.e4;
    students.filter((u) => u.enrolled).forEach((u, i) => addReg(e, u, 'APPROVED', { at: now - 2 * DAY + i * 2000 }));
  }
  // e5 — completed, with attendance
  {
    const e = E.e5;
    const pool = shuffle(eligibleFor(e).filter((u) => u.id !== 'u_stu1'));
    const simran = addReg(e, U.u_stu1, 'APPROVED');
    const approved = pool.slice(0, 44).map((u) => addReg(e, u, 'APPROVED'));
    pool.slice(44, 48).forEach((u) => addReg(e, u, 'CANCELLED', { passStatus: 'REVOKED', reason: 'Cancelled by participant' }));
    const start = e.startsAt - 25 * MIN;
    [simran, ...approved.slice(0, 34)].forEach((r, i) => checkIn(e, r, 'g_sem', start + i * 70 * 1000 + Math.floor(rand() * 40000), 'u_sec2'));
    const dup = passes.find((p) => p.registrationId === approved[5]?.id);
    if (dup) failLog(e, 'g_sem', 'u_sec2', 'ALREADY_USED', e.startsAt + 12 * MIN, dup.id, dup.userId);
    failLog(e, 'g_sem', 'u_sec2', 'WRONG_EVENT', e.startsAt - 5 * MIN);
    expireRest(e);
  }
  // e6 — approval-based, guests allowed
  {
    const e = E.e6;
    const pool = shuffle(students.filter((u) => u.enrolled && u.id !== 'u_stu1'));
    pool.slice(0, 14).forEach((u) => addReg(e, u, 'APPROVED'));
    pool.slice(14, 21).forEach((u) => addReg(e, u, 'PENDING', { note: 'Audience seat' }));
    addReg(e, pool[21], 'REJECTED', { reason: 'Duplicate request', note: 'Speaker slot' });
    addReg(e, U.u_guest1, 'PENDING', { note: 'Speaker — PAU debating society', at: now - 20 * HOUR });
    addReg(e, U.u_guest2, 'APPROVED', { note: 'Audience seat' });
  }
  // e7 — cancelled event
  {
    const e = E.e7;
    const reason = 'Event cancelled by organizer';
    addReg(e, U.u_stu1, 'CANCELLED', { passStatus: 'REVOKED', reason });
    shuffle(students.filter((u) => u.id !== 'u_stu1')).slice(0, 17).forEach((u) => addReg(e, u, 'CANCELLED', { passStatus: 'REVOKED', reason }));
  }
  // e9 — upcoming cultural night
  {
    const e = E.e9;
    addReg(e, U.u_stu1, 'APPROVED');
    shuffle(students.filter((u) => u.enrolled && u.id !== 'u_stu1')).slice(0, 69).forEach((u) => addReg(e, u, 'APPROVED'));
    addReg(e, U.u_guest2, 'APPROVED');
  }
  // e10 — completed quiz
  {
    const e = E.e10;
    const approved = shuffle(eligibleFor(e)).slice(0, 40).map((u) => addReg(e, u, 'APPROVED'));
    approved.slice(0, 31).forEach((r, i) => checkIn(e, r, 'g_it', e.startsAt - 30 * MIN + i * 55 * 1000, 'u_sec3'));
    expireRest(e);
  }

  // ---------------------------------------------------------------- security duty
  const A = (eventId, gateId, userId) => ({ id: id('as'), eventId, gateId, userId });
  const assignments = [
    A('e1', 'g_audi_a', 'u_sec1'), A('e1', 'g_audi_b', 'u_sec2'),
    A('e2', 'g_ee', 'u_sec3'),
    A('e3', 'g_cse', 'u_sec1'),
    A('e4', 'g_ground_n', 'u_sec1'), A('e4', 'g_ground_s', 'u_sec3'),
    A('e5', 'g_sem', 'u_sec2'),
    A('e6', 'g_audi_a', 'u_sec2'),
    A('e9', 'g_oat_1', 'u_sec1'), A('e9', 'g_oat_2', 'u_sec3'),
    A('e10', 'g_it', 'u_sec3'),
  ];

  // ---------------------------------------------------------------- notifications
  const N = (userId, type, title, message, link, t, read = false) => ({ id: id('n'), userId, type, title, message, link, at: t, read });
  const liveTime = new Date(E.e1.startsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const notifications = [
    N('u_stu1', 'REMINDER', 'Today: AI in Industry — Guest Lecture', `Starts at ${liveTime} in the Main Auditorium. Keep your pass ready at Gate A or B.`, '/my/passes', now - 3 * HOUR),
    N('u_stu1', 'CANCELLED', 'Event cancelled: Blood Donation Camp', 'Postponed — the blood bank team is unavailable. Your pass has been revoked.', '/events/e7', now - 1 * DAY),
    N('u_stu1', 'PASS', `Pass issued: Annual Athletics Meet ${year}`, 'Your spectator pass is ready in My Passes.', '/my/passes', now - 2 * DAY, true),
    N('u_stu1', 'APPROVED', 'Registration confirmed: Rang Punjab Da', 'Your seat is confirmed and your QR pass is ready.', '/my/passes', now - 4 * DAY, true),
    N('u_stu1', 'ATTENDED', 'Attendance recorded: Resume Building & Placement Talk', 'You were checked in at the Seminar Hall main door.', '/my/registrations', E.e5.startsAt, true),
    N('u_stu2', 'WELCOME', 'Welcome to Smart Campus Events', 'Set a new password, then explore events open to Mechanical Engineering students.', '/events', now - 1 * DAY),
    N('u_stu2', 'NEW_EVENT', 'New event for you: Robotics Workshop', 'Open to ME, EE and ECE students. Seats are limited.', '/events/e2', now - 5 * DAY),
    N('u_guest1', 'PENDING', 'Request received: Inter-College Debate', 'The organizing committee will review your request.', '/my/registrations', now - 20 * HOUR),
    N('u_guest1', 'APPROVED', 'Registration confirmed: AI in Industry', 'Your pass is ready. Show it at the auditorium gate.', '/my/passes', now - 7 * DAY, true),
    N('u_org1', 'REQUESTS', '9 requests waiting: CodeSprint Hackathon', 'Review team requests before registration closes.', '/manage/events/e3?tab=registrations', now - 2 * HOUR),
    N('u_org1', 'LIVE', 'AI in Industry is live', 'Gates are open. Follow check-ins on the live attendance screen.', '/manage/events/e1?tab=live', E.e1.startsAt - 60 * MIN),
    N('u_org2', 'REQUESTS', '8 requests waiting: Inter-College Debate', 'Includes 1 external participant.', '/manage/events/e6?tab=registrations', now - 5 * HOUR),
    N('u_org2', 'DRAFT', 'Draft not published: Campus Photography Walk', 'Add gates and security staff, then publish.', '/manage/events/e8', now - 1 * DAY, true),
    N('u_sec1', 'DUTY', 'Duty today: Main Auditorium · Gate A', `AI in Industry — gates open at ${new Date(E.e1.startsAt - 60 * MIN).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.`, '/scan', now - 4 * HOUR),
    N('u_admin', 'IMPORT', `${students.length} students imported`, 'Bulk import completed with 0 rows skipped.', '/admin/users', now - 30 * DAY, true),
    N('u_admin', 'SECURITY', '1 account locked overnight', 'Too many failed logins. Review in Users.', '/admin/audit', now - 9 * HOUR),
  ];

  // ---------------------------------------------------------------- audit
  const AU = (actorId, action, entity, entityId, details, t) => ({ id: id('a'), actorId, action, entity, entityId, details, at: t, ip: `10.10.${(t % 7) + 1}.${(t % 200) + 20}` });
  const audit = [
    AU('u_admin', 'STUDENT_IMPORT', 'User', null, `Imported ${students.length - 2} students from students_batch.csv (0 skipped)`, now - 30 * DAY),
    AU('u_org1', 'EVENT_CREATED', 'Event', 'e10', 'Brainwave Tech Quiz', now - 30 * DAY + HOUR),
    AU('u_org1', 'EVENT_CREATED', 'Event', 'e5', 'Resume Building & Placement Talk', now - 25 * DAY),
    AU('u_org1', 'EVENT_PUBLISHED', 'Event', 'e1', 'AI in Industry — Guest Lecture', now - 12 * DAY),
    AU('u_org3', 'EVENT_PUBLISHED', 'Event', 'e2', 'Robotics Workshop — Build a Line Follower', now - 6 * DAY),
    AU('u_org2', 'EVENT_PUBLISHED', 'Event', 'e9', 'Rang Punjab Da — Cultural Night', now - 5 * DAY),
    AU('u_org1', 'EVENT_PUBLISHED', 'Event', 'e3', `CodeSprint Hackathon ${year}`, now - 3 * DAY),
    AU('u_org2', 'PASSES_BULK_ASSIGNED', 'Event', 'e4', `${students.length - 1} passes issued to eligible students`, now - 2 * DAY),
    AU('u_org2', 'EVENT_CANCELLED', 'Event', 'e7', 'Postponed — blood bank team unavailable', now - 1 * DAY),
    AU('u_org1', 'REGISTRATION_REJECTED', 'Registration', null, 'CodeSprint Hackathon — team size above limit', now - 1 * DAY + HOUR),
    AU('u_org2', 'EVENT_CREATED', 'Event', 'e8', 'Campus Photography Walk (draft)', now - 1 * DAY),
    AU(null, 'LOGIN_FAILED', 'User', 'u_stu2', 'Attempt 5 — account locked for 15 minutes', now - 9 * HOUR),
    AU('u_admin', 'USER_CREATED', 'User', 'u_sec3', 'Security staff: Sukhdev Singh', now - 5 * HOUR),
    AU('u_sec1', 'LOGIN', 'User', 'u_sec1', 'Signed in from scanner device', now - 70 * MIN),
    AU('u_org1', 'SECURITY_ASSIGNED', 'Event', 'e1', 'Gurmeet Singh → Gate A (Front), Balwinder Kumar → Gate B (Side)', now - 65 * MIN),
  ].sort((a, b) => b.at - a.at);

  return {
    version: SEED_VERSION, seededAt: now,
    departments, users, locations, gates, events, assignments,
    registrations, passes, attendance, scanLogs, notifications, audit,
  };
}
