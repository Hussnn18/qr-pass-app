import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store/store';
import { attendanceForPass, byId, userSubtitle } from '../store/selectors';
import { fmtDate, fmtTime } from '../utils/format';
import { Avatar, StatusBadge } from './ui';

export const qrValue = (pass) => `EQR1:${pass.token}`;

export default function PassCard({ pass, actions, qrSize = 148 }) {
  const s = useStore();
  const ev = byId(s.events, pass.eventId);
  const holder = byId(s.users, pass.userId);
  const venue = ev && byId(s.locations, ev.venueId);
  const att = attendanceForPass(s, pass.id);
  const gate = att && byId(s.gates, att.gateId);
  if (!ev || !holder) return null;

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
            <div className="pass-id">{holder.urn || 'Guest pass'}</div>
            <div className="pass-sub">{userSubtitle(holder)}</div>
          </div>
        </div>
        <div>
          <div className="pass-event-title">{ev.title}</div>
          <dl className="pass-facts">
            <dt>Date</dt><dd>{fmtDate(ev.startsAt)}</dd>
            <dt>Time</dt><dd>{fmtTime(ev.startsAt)} – {fmtTime(ev.endsAt)}</dd>
            <dt>Venue</dt><dd>{venue?.name}</dd>
            {att && <><dt>Entry</dt><dd>{fmtTime(att.at)} · {gate?.name}</dd></>}
          </dl>
        </div>
      </div>
      <div className="pass-qr">
        <QRCodeSVG value={qrValue(pass)} size={qrSize} level="M" marginSize={1} title={`QR code for pass ${pass.code}`} />
        <div className="pass-code">{pass.code}</div>
        {pass.status !== 'ACTIVE' && (
          <div className="pass-qr-overlay">
            {pass.status === 'USED' && <div className="text-primary"><i className="bi bi-door-open" />Checked in<br /><span className="fw-normal small">{att ? `${fmtTime(att.at)} · ${gate?.name}` : ''}</span></div>}
            {pass.status === 'REVOKED' && <div className="text-danger"><i className="bi bi-slash-circle" />Revoked<br /><span className="fw-normal small">{pass.revokedReason}</span></div>}
            {pass.status === 'EXPIRED' && <div className="text-secondary"><i className="bi bi-hourglass-bottom" />Expired</div>}
          </div>
        )}
      </div>
      {actions && <footer className="pass-actions">{actions}</footer>}
    </article>
  );
}
