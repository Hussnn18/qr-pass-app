import { useEffect, useState } from 'react';
import { Button, Dropdown, Navbar } from 'react-bootstrap';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ROLES } from '../../data/constants';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../ui';

/** Folder-button menu bar in the style of the GNDEC academic portal, one menu per role. */
const MENUS = {
  STUDENT: {
    groups: [
      { label: 'Events', items: [
        { to: '/events', label: 'Browse Events', icon: 'calendar-event' },
        { to: '/my/registrations', label: 'My Registrations', icon: 'card-checklist' },
        { to: '/my/passes', label: 'My Passes', icon: 'qr-code' },
      ] },
    ],
    action: { to: '/my/passes', label: 'My Passes', icon: 'qr-code' },
  },
  ORGANIZER: {
    groups: [
      { label: 'Events', items: [
        { to: '/manage/events', label: 'My Events', icon: 'calendar3' },
        { to: '/manage/events/new', label: 'Create Event', icon: 'calendar-plus' },
        { to: '/events', label: 'Student View of Events', icon: 'calendar-event' },
      ] },
      { label: 'Gate Entry', items: [
        { to: '/scan', label: 'Open Scanner', icon: 'upc-scan' },
        { to: '/scan/history', label: 'Scan History', icon: 'clock-history' },
      ] },
    ],
    action: { to: '/manage/events/new', label: 'Create Event', icon: 'calendar-plus' },
  },
  SECURITY: {
    groups: [
      { label: 'Gate Duty', items: [
        { to: '/scan', label: 'Start Scanning', icon: 'upc-scan' },
        { to: '/scan/assignments', label: 'My Assignments', icon: 'shield-check' },
        { to: '/scan/history', label: 'Scan History', icon: 'clock-history' },
      ] },
    ],
    action: { to: '/scan', label: 'Open Scanner', icon: 'upc-scan' },
  },
  ADMIN: {
    groups: [
      { label: 'Control Panel', items: [
        { to: '/admin/users', label: 'Users & Roles', icon: 'people' },
        { to: '/admin/import', label: 'Student Import', icon: 'file-earmark-arrow-up' },
        { to: '/admin/departments', label: 'Departments', icon: 'diagram-3' },
        { to: '/admin/venues', label: 'Venues & Gates', icon: 'building' },
      ] },
      { label: 'Events', items: [
        { to: '/manage/events', label: 'All Events', icon: 'calendar3' },
        { to: '/manage/events/new', label: 'Create Event', icon: 'calendar-plus' },
        { to: '/scan', label: 'Open Scanner', icon: 'upc-scan' },
        { to: '/scan/history', label: 'Scan History', icon: 'clock-history' },
      ] },
    ],
    action: { to: '/admin/users?status=LOCKED', label: 'Locked Accounts', icon: 'lock' },
  },
};
MENUS.GUEST = MENUS.STUDENT;

const matches = (pathname, to) => {
  const path = to.split('?')[0];
  return pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));
};

export default function PortalNav() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [loc.pathname, loc.search]);

  const menu = MENUS[user.role];
  const idText = user.student?.urn || user.email.split('@')[0];

  const doLogout = async () => {
    await logout();
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
                    <Dropdown.Item key={i.to} as={Link} to={i.to} active={loc.pathname === i.to.split('?')[0]}>
                      <i className={`bi bi-${i.icon} me-2`} aria-hidden="true" />{i.label}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            ))}
          </div>

          <span className="portal-divider" aria-hidden="true" />
          <Button as={Link} to={menu.action.to} variant="light" className="portal-action">
            <i className={`bi bi-${menu.action.icon}`} aria-hidden="true" /> {menu.action.label}
          </Button>
          <span className="portal-divider" aria-hidden="true" />

          <div className="portal-group portal-right">
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
