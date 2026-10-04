import { useEffect } from 'react';
import { Alert, Button, Nav } from 'react-bootstrap';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { store, useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { eventPhase } from '../../utils/eligibility';
import { fromNow } from '../../utils/format';
import { useNow, useTitle } from '../../utils/hooks';
import { ConfirmHost, ToastHost } from '../feedback';
import { EmptyState } from '../ui';
import DemoPanel from './DemoPanel';
import PortalHeader from './PortalHeader';
import PortalNav from './PortalNav';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Footer() {
  return (
    <footer className="portal-footer">
      <div className="portal-container d-flex flex-wrap justify-content-between gap-2">
        <span>Smart Campus Event Management &amp; Secure QR Access System — Major Project, GNDEC Ludhiana</span>
        <span>UI prototype with mock data · no real accounts or payments</span>
      </div>
    </footer>
  );
}

/** Sample dates are generated around "now"; once the live sample event is over, offer to regenerate. */
function StaleDataBanner() {
  useNow(60000);
  const s = useStore();
  const anyLive = s.events.some((e) => eventPhase(e) === 'LIVE');
  if (anyLive || Date.now() - s.seededAt < 2 * 36e5) return null;
  return (
    <Alert variant="warning" className="stale-banner d-flex flex-wrap gap-2 align-items-center justify-content-between py-2">
      <span><i className="bi bi-calendar-x me-2" />The sample data was generated {fromNow(s.seededAt)}, so the demo's "happening now" event has ended.</span>
      <Button size="sm" variant="warning" onClick={() => store.reset()}>Regenerate around now</Button>
    </Alert>
  );
}

export function Shell({ children }) {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <ScrollToTop />
      <PortalHeader />
      {children}
      <Footer />
      <DemoPanel />
      <ToastHost />
      <ConfirmHost />
    </>
  );
}

/** Signed-in layout: banner, portal menu bar, page content. */
export function PortalLayout() {
  return (
    <Shell>
      <div className="portal-container">
        <PortalNav />
        <StaleDataBanner />
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </Shell>
  );
}

/** Signed-out layout: same banner, a slim menu with public links. */
export function PublicLayout() {
  return (
    <Shell>
      <div className="portal-container">
        <nav className="portal-nav navbar px-3" aria-label="Public menu">
          <Link to="/login" className="portal-brand navbar-brand">Home</Link>
          <Nav className="flex-row flex-wrap gap-2 ms-auto">
            <Nav.Link as={NavLink} to="/login" className="portal-btn btn btn-light"><i className="bi bi-box-arrow-in-right" /> Sign in</Nav.Link>
            <Nav.Link as={NavLink} to="/signup" className="portal-btn btn btn-light"><i className="bi bi-person-plus" /> Guest sign-up</Nav.Link>
          </Nav>
        </nav>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </Shell>
  );
}

export function RequireAuth() {
  const user = useCurrentUser();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (user.mustChangePassword && loc.pathname !== '/change-password') return <Navigate to="/change-password" replace state={{ next: loc.pathname + loc.search }} />;
  return <Outlet />;
}

function AccessDenied({ roles }) {
  useTitle('No access');
  return (
    <EmptyState icon="shield-lock" title="You don't have access to this page" action={<Button as={Link} to="/">Go to your home page</Button>}>
      This area is for {roles.map((r) => r.toLowerCase()).join(' / ')} accounts. In the real system the API would also return 403.
    </EmptyState>
  );
}

export function RequireRole({ roles }) {
  const user = useCurrentUser();
  if (!roles.includes(user.role)) return <AccessDenied roles={roles} />;
  return <Outlet />;
}
