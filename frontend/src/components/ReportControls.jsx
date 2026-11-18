import { useMemo, useState } from 'react';
import { Dropdown, Form } from 'react-bootstrap';
import { download, qs } from '../api/client';
import { attempt } from './feedback';

/** Date-range picker and summary-report download shared by the Analytics and Reports pages (objective 5). */
const DAY = 864e5;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Academic year starts in July. */
const academicYearStart = () => { const d = new Date(); const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return new Date(y, 6, 1).getTime(); };

export const RANGES = {
  all: { label: 'All time', range: () => ({}) },
  year: { label: 'This academic year', range: () => ({ from: academicYearStart() }) },
  d90: { label: 'Last 90 days', range: () => ({ from: startOfDay(Date.now() - 90 * DAY), to: Date.now() }) },
  d30: { label: 'Last 30 days', range: () => ({ from: startOfDay(Date.now() - 30 * DAY), to: Date.now() }) },
  upcoming: { label: 'Upcoming events', range: () => ({ from: Date.now() }) },
  custom: { label: 'Custom dates…', range: null },
};

export function useRange() {
  const [key, setKey] = useState('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const range = useMemo(() => (key === 'custom'
    ? { from: custom.from ? new Date(`${custom.from}T00:00`).getTime() : undefined, to: custom.to ? new Date(`${custom.to}T23:59:59`).getTime() : undefined }
    : RANGES[key].range()), [key, custom]);
  const picker = (
    <div className="d-flex flex-wrap gap-2 align-items-center">
      <Form.Select size="sm" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Date range" style={{ width: 'auto' }}>
        {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </Form.Select>
      {key === 'custom' && (
        <>
          <Form.Control size="sm" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" style={{ width: 'auto' }} />
          <span className="small text-muted-2">to</span>
          <Form.Control size="sm" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" style={{ width: 'auto' }} />
        </>
      )}
    </div>
  );
  return { range, picker, label: key === 'custom' ? 'Custom range' : RANGES[key].label };
}

export function SummaryDownload({ range, size = 'sm', variant = 'outline-primary' }) {
  const get = (format) => attempt(() => download(`/manage/reports/summary${qs({ format, ...range })}`, `events-summary.${format}`));
  return (
    <Dropdown align="end">
      <Dropdown.Toggle size={size} variant={variant}><i className="bi bi-download me-1" />Summary report</Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.Item onClick={() => get('xlsx')}><i className="bi bi-file-earmark-spreadsheet me-2" />Excel (one sheet per breakdown)</Dropdown.Item>
        <Dropdown.Item onClick={() => get('pdf')}><i className="bi bi-file-earmark-pdf me-2" />PDF</Dropdown.Item>
        <Dropdown.Item onClick={() => get('csv')}><i className="bi bi-filetype-csv me-2" />CSV</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
