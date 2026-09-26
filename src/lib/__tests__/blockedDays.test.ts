import { blockedDays } from '../blockedDays';

describe('blockedDays', () => {
  it('a single-day block is one day', () => {
    expect(blockedDays('2026-09-30')).toEqual(['2026-09-30']);
    expect(blockedDays('2026-09-30', '2026-09-30')).toEqual(['2026-09-30']);
  });

  // The reported bug: a Mon–Fri window painted the whole week solid because
  // it was drawn as one band from Monday morning to Friday morning.
  it('a Monday-to-Friday block is five separate days', () => {
    expect(blockedDays('2026-11-16', '2026-11-20')).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
    ]);
  });

  it('includes the last day, and does not run past it', () => {
    const days = blockedDays('2026-11-30', '2026-12-04');
    expect(days[0]).toBe('2026-11-30');
    expect(days[days.length - 1]).toBe('2026-12-04');
    expect(days).toHaveLength(5);
  });

  // Parsing 'YYYY-MM-DD' alone lands on UTC midnight, which is the previous
  // evening for a US-East user; walking from there reports the wrong day.
  it('reports the calendar day that was entered, not a UTC-shifted one', () => {
    expect(blockedDays('2026-03-08', '2026-03-10')).toEqual([
      '2026-03-08', '2026-03-09', '2026-03-10',
    ]);
    // Crossing a US daylight-saving change must not drop or repeat a day.
    const march = blockedDays('2026-03-06', '2026-03-12');
    expect(march).toHaveLength(7);
    expect(new Set(march).size).toBe(7);
  });

  it('crosses a month and a year boundary', () => {
    expect(blockedDays('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
    ]);
  });

  // A row like this is in production: end_date 2026-07-25, start_date
  // 2027-01-16. It must still show up somewhere rather than vanish.
  it('shows the first day when end_date precedes start_date', () => {
    expect(blockedDays('2027-01-16', '2026-07-25')).toEqual(['2027-01-16']);
  });

  it('caps a runaway range instead of generating thousands of events', () => {
    expect(blockedDays('2026-01-01', '2036-01-01')).toHaveLength(370);
  });

  it('survives missing or malformed input', () => {
    expect(blockedDays('')).toEqual([]);
    expect(blockedDays('not-a-date')).toEqual([]);
    expect(blockedDays('2026-09-30', null)).toEqual(['2026-09-30']);
  });
});
