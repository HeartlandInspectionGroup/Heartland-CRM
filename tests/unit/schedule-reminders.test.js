import { describe, it, expect } from 'vitest';
const { buildReminders } = require('../../functions/schedule-reminders');

describe('buildReminders', () => {

  it('calculates standard dates for a mid-March inspection', () => {
    const result = buildReminders('2026-03-15');
    expect(result).toHaveLength(4);

    const byType = {};
    result.forEach(r => { byType[r.reminder_type] = r.scheduled_date; });

    expect(byType['6month']).toBe('2026-09-15');
    expect(byType['12month']).toBe('2027-03-15');
    // Spring: next Mar 20 at least 30 days out → Mar 20 2027 (Mar 20 2026 is only 5 days away)
    expect(byType['seasonal_spring']).toBe('2027-03-20');
    // Fall: next Sep 22 at least 30 days out → Sep 22 2026
    expect(byType['seasonal_fall']).toBe('2026-09-22');
  });

  it('pushes fall to next year when inspection is late September', () => {
    const result = buildReminders('2026-09-25');
    const byType = {};
    result.forEach(r => { byType[r.reminder_type] = r.scheduled_date; });

    // Sep 25 + 30 days = Oct 25. Sep 22 2026 is before Oct 25 → next year
    expect(byType['seasonal_fall']).toBe('2027-09-22');
    // Spring: Mar 20 2027 is after Oct 25 2026 → good
    expect(byType['seasonal_spring']).toBe('2027-03-20');
  });

  it('pushes spring to next year when inspection is on March 20', () => {
    const result = buildReminders('2026-03-20');
    const byType = {};
    result.forEach(r => { byType[r.reminder_type] = r.scheduled_date; });

    // Mar 20 + 30 days = Apr 19. Mar 20 2026 is before Apr 19 → next year
    expect(byType['seasonal_spring']).toBe('2027-03-20');
    expect(byType['6month']).toBe('2026-09-20');
    expect(byType['12month']).toBe('2027-03-20');
  });

  it('handles January inspection correctly', () => {
    const result = buildReminders('2026-01-10');
    const byType = {};
    result.forEach(r => { byType[r.reminder_type] = r.scheduled_date; });

    expect(byType['6month']).toBe('2026-07-10');
    expect(byType['12month']).toBe('2027-01-10');
    // Jan 10 + 30 = Feb 9. Mar 20 2026 is after Feb 9 → 2026
    expect(byType['seasonal_spring']).toBe('2026-03-20');
    // Jan 10 + 30 = Feb 9. Sep 22 2026 is after Feb 9 → 2026
    expect(byType['seasonal_fall']).toBe('2026-09-22');
  });

  it('always returns 4 reminders', () => {
    const result = buildReminders('2026-06-15');
    expect(result).toHaveLength(4);

    const types = result.map(r => r.reminder_type).sort();
    expect(types).toEqual(['12month', '6month', 'seasonal_fall', 'seasonal_spring']);
  });

});
