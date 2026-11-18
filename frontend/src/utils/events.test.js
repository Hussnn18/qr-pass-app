import { describe, expect, it } from 'vitest';
import { eligibilitySummary, eventPhase } from './events';
import { pct, titleCase } from './format';
import { RANGES } from '../components/ReportControls';

const H = 36e5;

describe('eventPhase', () => {
  const now = Date.UTC(2026, 10, 18, 12);
  const ev = (status, startsIn, length = 2) => ({ status, startsAt: now + startsIn * H, endsAt: now + (startsIn + length) * H });

  it('follows status first, then the clock', () => {
    expect(eventPhase(ev('DRAFT', 5), now)).toBe('DRAFT');
    expect(eventPhase(ev('CANCELLED', -1), now)).toBe('CANCELLED');
    expect(eventPhase(ev('COMPLETED', 5), now)).toBe('ENDED');
    expect(eventPhase(ev('PUBLISHED', 5), now)).toBe('UPCOMING');
    expect(eventPhase(ev('PUBLISHED', -1), now)).toBe('LIVE');
    expect(eventPhase(ev('CLOSED', -3), now)).toBe('ENDED');
  });
});

describe('eligibilitySummary', () => {
  it('names the restrictions, or says everyone', () => {
    expect(eligibilitySummary({ departments: [], semesters: [], sections: [] })).toContain('All departments');
    expect(eligibilitySummary({ departments: ['CSE'], semesters: [7, 8], sections: [] })).toContain('CSE');
    expect(eligibilitySummary({ departments: ['CSE'], semesters: [7, 8], sections: [] })).toContain('Sem 7, 8');
  });
});

describe('formatting helpers', () => {
  it('rounds percentages and avoids dividing by zero', () => {
    expect(pct(2, 3)).toBe(67);
    expect(pct(5, 0)).toBe(0);
  });

  it('turns audit action codes into words', () => {
    expect(titleCase('ATTENDANCE_MARKED_PRESENT')).toBe('Attendance Marked Present');
  });
});

describe('report date ranges', () => {
  it('builds from/to for the presets', () => {
    expect(RANGES.all.range()).toEqual({});
    const d30 = RANGES.d30.range();
    expect(d30.to - d30.from).toBeGreaterThanOrEqual(30 * 24 * H);
    expect(d30.to - d30.from).toBeLessThan(31 * 24 * H);
    expect(new Date(d30.from).getHours()).toBe(0);
    const year = new Date(RANGES.year.range().from);
    expect(year.getMonth()).toBe(6); // the academic year starts in July
    expect(year.getDate()).toBe(1);
  });
});
