import { QRCodeSVG } from 'qrcode.react';
import { fmtDate, fmtTime } from '../utils/format';
import { Avatar, StatusBadge } from './ui';

/**
 * One pass from GET /me/passes. The QR shows `pass.qr` ("EQR1:<token>") exactly as the server issued it;
 * the server only sends it for valid passes.
 */
export default function PassCard({ pass, actions, qrSize = 148 }) {
  const ev = pass.event;
  const holder = pass.holder;
  return (
    <article className={`pass-card status-${pass.status.toLowerCase()}`} aria-label={`Entry pass for ${ev.title}`}>
      <header className="pass-strip">
        <span><i className="bi bi-shield-check me-1" aria-hidden="true" />GNDEC · Official entry pass</span>
        <StatusBadge kind="pass" status={pass.status} />
      </header>
      <div className="pass-body">
        <div className="pass-holder">
          <Avatar user={holder} size={64} />
          <div className="min-w-0">
            <div className="pass-name">{holder.name}</div>
            <div className="pass-id">{holder.idLabel}</div>
            <div className="pass-sub">{holder.sub}</div>
          </div>
        </div>
        <div>
          <div className="pass-event-title">{ev.title}</div>
          <dl className="pass-facts">
            <dt>Date</dt><dd>{fmtDate(ev.startsAt)}</dd>
            <dt>Time</dt><dd>{fmtTime(ev.startsAt)} – {fmtTime(ev.endsAt)}</dd>
            <dt>Venue</dt><dd>{ev.venueName}</dd>
            {ev.gates?.length > 0 && <><dt>Entry</dt><dd>{ev.gates.join(', ')}</dd></>}
            {pass.entry && <><dt>Entered</dt><dd>{fmtTime(pass.entry.at)} · {pass.entry.gateName}</dd></>}
          </dl>
        </div>
      </div>
      <div className="pass-qr">
        {pass.qr ? (
          <QRCodeSVG value={pass.qr} size={qrSize} level="M" marginSize={1} title={`QR code for pass ${pass.code}`} />
        ) : (
          <div style={{ width: qrSize, height: qrSize }} className="d-grid border rounded bg-light text-muted-2 small" aria-hidden="true">
            <i className="bi bi-qr-code" style={{ fontSize: qrSize / 2.4, placeSelf: 'center', opacity: 0.25 }} />
          </div>
        )}
        <div className="pass-code">{pass.code}</div>
        {pass.status !== 'ACTIVE' && (
          <div className="pass-qr-overlay">
            {pass.status === 'USED' && <div className="text-primary"><i className="bi bi-door-open" />Checked in<br /><span className="fw-normal small">{pass.entry ? `${fmtTime(pass.entry.at)} · ${pass.entry.gateName}` : ''}</span></div>}
            {pass.status === 'REVOKED' && <div className="text-danger"><i className="bi bi-slash-circle" />Revoked<br /><span className="fw-normal small">{pass.revokedReason}</span></div>}
            {pass.status === 'EXPIRED' && <div className="text-secondary"><i className="bi bi-hourglass-bottom" />Expired</div>}
          </div>
        )}
      </div>
      {actions && <footer className="pass-actions">{actions}</footer>}
    </article>
  );
}
