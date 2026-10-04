import { useEffect, useState } from 'react';
import { Button, Dropdown, Navbar } from 'react-bootstrap';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ROLES } from '../../data/constants';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { logout, markAllRead, markRead } from '../../store/actions';
import { fromNow } from '../../utils/format';
import { Avatar } from '../ui';

const PARTICIPANT = {
  groups: [
    { label: 'Events', items: [
      { to: '/events', label: 'Browse Events', icon: 'calendar-event' },
      { to: '/my/registrations', label: 'My Registrations', icon: 'card-checklist' },
      { to: '/my/passes', label: 'My Passes', icon: 'qr-code' },
    ] },
    { label: 'Campus', items: [{ to: '/campus', label: 'Campus Map', icon: 'map' }] },
  ],
  action: (s, u) => {
    const n = s.passes.filter((p) => p.userId === u.id && p.status === 'ACTIVE').length;
    return { to: '/my/passes', label: `My Passes (${n} active)`, icon: 'qr-code' };
  },
};

const MENUS = {
  STUDENT: PARTICIPANT,
  GUEST: PARTICIPANT,
  ORGANIZER: {
    groups: [
      { label: 'Events', items: [
        { to: '/manage/events', label: 'My Events', icon: 'calendar3' },
        { to: '/manage/events/new', label: 'Create Event', icon: 'calendar-plus' },
        { to: '/events', label: 'Public Event List', icon: 'calendar-event' },
      ] },
      { label: 'Attendance', items: [
        { to: '/manage/live', label: 'Live Attendance', icon: 'broadcast' },
        { to: '/scan', label: 'Open Scanner', icon: 'upc-scan' },
        { to: '/scan/history', label: 'Scan History', icon: 'clock-history' },
      ] },
      { label: 'Reports', items: [
        { to: '/analytics', label: 'Analytics', icon: 'bar-chart-line' },
        { to: '/reports', label: 'Export Reports', icon: 'download' },
      ] },
      { label: 'Campus', items: [{ to: '/campus', label: 'Campus Map', icon: 'map' }] },
    ],
    action: (s, u) => {
      const ids = new Set(s.events.filter((e) => e.organizerIds.includes(u.id)).map((e) => e.id));
      const n = s.registrations.filter((r) => ids.has(r.eventId) && r.status === 'PENDING').length;
      return n ? { to: '/manage/events?filter=pending', label: `Pending Approvals (${n})`, icon: 'person-check' } : { to: '/manage/events/new', label: 'Create Event', icon: 'calendar-plus' };
    },
  },
  SECURITY: {
    groups: [
      { label: 'Gate Duty', items: [
        { to: '/scan', label: 'Start Scanning', icon: 'upc-scan' },
        { to: '/scan/assignments', label: 'My Assignments', icon: 'shield-check' },
        { to: '/scan/history', label: 'Scan History', icon: 'clock-history' },
      ] },
      { label: 'Campus', items: [{ to: '/campus', label: 'Campus Map', icon: 'map' }] },
    ],
    action: () => ({ to: '/scan', label: 'Open Scanner', icon: 'upc-scan' }),
  },
  ADMIN: {
    groups: [
      { label: 'Control Panel', items: [
        { to: '/admin/users', label: 'Users & Roles', icon: 'people' },
        { to: '/admin/import', label: 'Student Import', icon: 'file-earmark-arrow-up' },
        { to: '/admin/departments', label: 'Departments', icon: 'diagram-3' },
        { to: '/admin/audit', label: 'Audit Log', icon: 'journal-text' },
      ] },
      { label: 'Events', items: [
        { to: '/manage/events', label: 'All Events', icon: 'calendar3' },
        { to: '/manage/events/new', label: 'Create Event', icon: 'calendar-plus' },
        { to: '/manage/live', label: 'Live Attendance', icon: 'broadcast' },
        { to: '/scan', label: 'Open Scanner', icon: 'upc-scan' },
      ] },
      { label: 'Campus', items: [
        { to: '/admin/campus', label: 'Locations & Gates', icon: 'pin-map' },
        { to: '/campus', label: 'Campus Map', icon: 'map' },
      ] },
      { label: 'Reports', items: [
        { to: '/analytics', label: 'Analytics', icon: 'bar-chart-line' },
        { to: '/reports', label: 'Export Reports', icon: 'download' },
      ] },
    ],
    action: (s) => {
      const locked = s.users.filter((u) => u.status === 'LOCKED').length;
      return locked ? { to: '/admin/users?status=LOCKED', label: `Locked Accounts (${locked})`, icon: 'lock' } : { to: '/analytics', label: 'Analytics Dashboard', icon: 'bar-chart-line' };
    },
  },
};

const matches = (pathname, to) => {
  const path = to.split('?')[0];
  return pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));
};

export default function PortalNav() {
  const user = useCurrentUser();
  const s = useStore();
  const loc = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [loc.pathname, loc.search]);

  const menu = MENUS[user.role];
  const action = menu.action(s, user);
  const notes = s.notifications.filter((n) => n.userId === user.id);
  const unread = notes.filter((n) => !n.read).length;
  const idText = user.urn || user.email.split('@')[0];

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Navbar expand="lg" className="portal-nav" expanded={expanded} onToggle={setExpanded} aria-label="Main menu">
      <Navbar.Brand as={Link} to="/" className="portal-brand">Home</Navbar.Brand>
      <Navbar.Toggle aria-controls="portal-menu" aria-label="Toggle menu" />
      <Navbar.Collapse id="portal-menu">
        <div className="portal-menu-row">
          <div className="portal-group">
            {menu.groups.map((g) => (
              <Dropdown key={g.label}>
                <Dropdown.Toggle variant="light" className={`portal-btn ${g.items.some((i) => matches(loc.pathname, i.to)) ? 'active-group' : ''}`}>
                  <i className="bi bi-folder-fill" aria-hidden="true" /> {g.label}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {g.items.map((i) => (
                    <Dropdown.Item key={i.to} as={Link} to={i.to} active={matches(loc.pathname, i.to) && loc.pathname === i.to.split('?')[0]}>
                      <i className={`bi bi-${i.icon} me-2`} aria-hidden="true" />{i.label}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            ))}
          </div>

          <span className="portal-divider" aria-hidden="true" />
          <Button as={Link} to={action.to} variant="light" className="portal-action">
            <i className={`bi bi-${action.icon}`} aria-hidden="true" /> {action.label}
          </Button>
          <span className="portal-divider" aria-hidden="true" />

          <div className="portal-group portal-right">
            <Dropdown align="end">
              <Dropdown.Toggle variant="light" className="portal-btn" aria-label={`Notifications, ${unread} unread`}>
                <i className="bi bi-bell-fill" aria-hidden="true" />
                <span className="d-lg-none">Alerts</span>
                {unread > 0 && <span className="notif-count">{unread}</span>}
              </Dropdown.Toggle>
              <Dropdown.Menu className="notif-menu">
                <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                  <strong className="small">Notifications</strong>
                  {unread > 0 && <Button size="sm" variant="link" className="p-0" onClick={markAllRead}>Mark all read</Button>}
                </div>
                {notes.slice(0, 6).map((n) => (
                  <Dropdown.Item key={n.id} as={Link} to={n.link || '/notifications'} className={n.read ? '' : 'unread'} onClick={() => markRead(n.id)}>
                    <div className="fw-600 small">{!n.read && <span className="text-danger me-1">●</span>}{n.title}</div>
                    <div className="small-2 text-muted-2">{n.message}</div>
                    <div className="small-2 text-muted-2 mt-1">{fromNow(n.at)}</div>
                  </Dropdown.Item>
                ))}
                {!notes.length && <div className="px-3 py-4 text-center text-muted-2 small">You're all caught up.</div>}
                <Dropdown.Item as={Link} to="/notifications" className="text-center small fw-600 border-0">View all notifications</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>

            <Dropdown align="end">
              <Dropdown.Toggle variant="light" className="portal-btn" aria-label={`Account menu for ${user.name}`}>
                <i className="bi bi-person-fill" aria-hidden="true" /> <span className="mono">{idText}</span>
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <div className="user-menu-head d-flex gap-2 align-items-center">
                  <Avatar user={user} size={38} />
                  <div className="min-w-0">
                    <div className="fw-600 text-truncate">{user.name}</div>
                    <div className="small-2 text-muted-2">{ROLES[user.role].label}</div>
                  </div>
                </div>
                <Dropdown.Divider />
                <Dropdown.Item as={Link} to="/profile"><i className="bi bi-person-gear me-2" />My Profile</Dropdown.Item>
                <Dropdown.Item as={Link} to="/change-password"><i className="bi bi-key me-2" />Change Password</Dropdown.Item>
                <Dropdown.Item as={Link} to="/notifications"><i className="bi bi-bell me-2" />Notifications</Dropdown.Item>
                <Dropdown.Item onClick={() => window.dispatchEvent(new Event('open-demo-panel'))}><i className="bi bi-people me-2" />Switch demo account</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item onClick={doLogout} className="text-danger"><i className="bi bi-box-arrow-right me-2" />Sign out</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>
      </Navbar.Collapse>
    </Navbar>
  );
}
