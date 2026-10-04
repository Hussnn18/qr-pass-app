import { useEffect } from 'react';
import { Button } from 'react-bootstrap';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useTitle } from '../../utils/hooks';
import { ConfirmHost, ToastHost } from '../feedback';
import { EmptyState, Loading } from '../ui';
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
        <span>Objectives 1–3: events, secure registration, QR entry</span>
      </div>
    </footer>
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
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </Shell>
  );
}

/** Signed-out layout: same banner, slim menu. */
export function PublicLayout() {
  return (
    <Shell>
      <div className="portal-container">
        <nav className="portal-nav navbar px-3" aria-label="Public menu">
          <Link to="/login" className="portal-brand navbar-brand">Home</Link>
          <span className="ms-auto small text-muted-2 d-none d-sm-inline">Smart Campus Events · GNDEC Ludhiana</span>
        </nav>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </Shell>
  );
}

export function RequireAuth() {
  const { ready, user } = useAuth();
  const loc = useLocation();
  if (!ready) return <Shell><div className="portal-container pt-4"><Loading label="Checking your session…" /></div></Shell>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (user.mustChangePassword && loc.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace state={{ next: loc.pathname + loc.search }} />;
  }
  return <Outlet />;
}

function AccessDenied({ roles }) {
  useTitle('No access');
  return (
    <EmptyState icon="shield-lock" title="You don't have access to this page" action={<Button as={Link} to="/">Go to your home page</Button>}>
      This area is for {roles.map((r) => r.toLowerCase()).join(' / ')} accounts.
    </EmptyState>
  );
}

export function RequireRole({ roles }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) return <AccessDenied roles={roles} />;
  return <Outlet />;
}
