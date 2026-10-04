import { Button, Card, Pagination, ProgressBar, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { CATEGORIES, EVENT_STATUS, MODES, PASS_STATUS, REG_STATUS, ROLES, USER_STATUS } from '../data/constants';
import { countdown, hashColor, initials } from '../utils/format';
import { useNow } from '../utils/hooks';

export function PageHeader({ title, subtitle, crumbs = [], actions }) {
  return (
    <div className="page-header">
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link to="/">Home</Link></li>
          {crumbs.map((c) => (
            <li key={c.label} className="breadcrumb-item">{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</li>
          ))}
          <li className="breadcrumb-item active" aria-current="page">{title}</li>
        </ol>
      </nav>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-2">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="d-flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Panel({ title, icon, actions, children, className = '', bodyClass = '', flush = false, as = 'h2' }) {
  const Title = as;
  return (
    <Card className={`panel ${className}`}>
      {title && (
        <Card.Header className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
          <Title className="panel-title">{icon && <i className={`bi bi-${icon} me-2`} aria-hidden="true" />}{title}</Title>
          {actions}
        </Card.Header>
      )}
      {flush ? children : <Card.Body className={bodyClass}>{children}</Card.Body>}
    </Card>
  );
}

export function StatTile({ icon, label, value, hint, tone = 'primary', to }) {
  const tile = (
    <div className={`stat-tile tone-${tone}`}>
      <div className="stat-icon" aria-hidden="true"><i className={`bi bi-${icon}`} /></div>
      <div className="min-w-0">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="stat-link">{tile}</Link> : tile;
}

export function EmptyState({ icon = 'inbox', title, children, action }) {
  return (
    <div className="empty-state">
      <i className={`bi bi-${icon}`} aria-hidden="true" />
      <h3>{title}</h3>
      {children && <p className="mb-3">{children}</p>}
      {action}
    </div>
  );
}

const MAPS = { reg: REG_STATUS, pass: PASS_STATUS, event: EVENT_STATUS, user: USER_STATUS };
export function StatusBadge({ kind, status, label }) {
  const m = MAPS[kind]?.[status] || { label: status, tone: 'secondary', icon: 'dot' };
  return (
    <span className={`badge-soft tone-${m.tone}`}>
      <i className={`bi bi-${m.icon}`} aria-hidden="true" />
      {label || m.label}
    </span>
  );
}

export function Tag({ tone = 'secondary', icon, children, title }) {
  return (
    <span className={`badge-soft tone-${tone}`} title={title}>
      {icon && <i className={`bi bi-${icon}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

export const RoleBadge = ({ role }) => <Tag tone={ROLES[role].tone} icon={ROLES[role].icon}>{ROLES[role].label}</Tag>;
export const ModeBadge = ({ mode }) => <Tag tone="primary" icon={MODES[mode].icon} title={MODES[mode].desc}>{MODES[mode].short}</Tag>;

export function CategoryChip({ category }) {
  const c = CATEGORIES[category] || CATEGORIES.TECHNICAL;
  return <span className="cat-chip"><i className={`bi bi-${c.icon} me-1`} aria-hidden="true" />{c.label}</span>;
}

export function Avatar({ user, size = 40, className = '' }) {
  const photo = user?.photoUrl || user?.photo;
  if (photo) {
    return <img src={photo} alt="" className={`avatar ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    <span className={`avatar ${className}`} aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.38, background: hashColor(user?.name || '?') }}>
      {initials(user?.name || '?')}
    </span>
  );
}

export function SeatsBar({ approved, capacity, waitlisted = 0 }) {
  const left = Math.max(capacity - approved, 0);
  const pctFull = capacity ? Math.min(100, (approved * 100) / capacity) : 0;
  const variant = pctFull >= 100 ? 'danger' : pctFull >= 85 ? 'warning' : undefined;
  return (
    <div>
      <div className="seats-label">
        <span>{left > 0 ? <><strong className="text-body">{left}</strong> of {capacity} seats left</> : <strong className="text-danger">Full{waitlisted ? ` · ${waitlisted} waitlisted` : ''}</strong>}</span>
        <span>{Math.round(pctFull)}%</span>
      </div>
      <ProgressBar now={pctFull} variant={variant} className="seats-bar" aria-label={`${Math.round(pctFull)}% of seats taken`} />
    </div>
  );
}

export function Countdown({ to, prefix = 'Starts in' }) {
  const now = useNow(30000);
  if (to <= now) return null;
  return <span>{prefix} <strong>{countdown(to, now)}</strong></span>;
}

export function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const items = [];
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const to = Math.min(pages, from + 4);
  for (let p = from; p <= to; p++) {
    items.push(<Pagination.Item key={p} active={p === page} onClick={() => onChange(p)}>{p}</Pagination.Item>);
  }
  return (
    <Pagination size="sm" className="mb-0 justify-content-center flex-wrap" aria-label="Pages">
      <Pagination.Prev disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Previous page" />
      {items}
      <Pagination.Next disabled={page === pages} onClick={() => onChange(page + 1)} aria-label="Next page" />
    </Pagination>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="text-center py-5 text-muted-2" role="status">
      <Spinner animation="border" size="sm" className="me-2" />{label}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <EmptyState icon="exclamation-octagon" title="Couldn't load this" action={onRetry && <Button variant="outline-primary" onClick={onRetry}>Try again</Button>}>
      {error?.message || 'Something went wrong.'}
    </EmptyState>
  );
}

/** Renders loading / error / content for a useApi() result. */
export function Async({ state, children, label }) {
  if (state.error && state.data === undefined) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.data === undefined) return <Loading label={label} />;
  return children(state.data);
}

export function paginate(list, page, size) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(page, pages);
  return { rows: list.slice((p - 1) * size, p * size), pages, page: p };
}
