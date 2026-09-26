import {
  DEFAULT_OFFICE_HOURS,
  allSlots,
  gridRange,
  isAfterHours,
  regularSlots,
  normalizeOfficeHours,
  slotsForDay,
  to12Hour,
  toBusinessHours,
} from '../officeHours';

describe('normalizeOfficeHours', () => {
  it('falls back to the current hardcoded hours when nothing is saved', () => {
    expect(normalizeOfficeHours(null)).toEqual(DEFAULT_OFFICE_HOURS);
    expect(normalizeOfficeHours(undefined)).toEqual(DEFAULT_OFFICE_HOURS);
    expect(normalizeOfficeHours({})).toEqual(DEFAULT_OFFICE_HOURS);
  });

  it('keeps a saved day and repairs its neighbours', () => {
    const hours = normalizeOfficeHours({ days: [{ open: '08:00', close: '14:00', closed: false }] });
    expect(hours.days[0]).toEqual({ open: '08:00', close: '14:00', closed: false });
    expect(hours.days[1]).toEqual(DEFAULT_OFFICE_HOURS.days[1]);
    expect(hours.days).toHaveLength(7);
  });

  // A hand-edited JSONB row can hold anything. A bad value must not empty the
  // calendar or the booking pickers.
  it('rejects garbage times and step sizes', () => {
    const hours = normalizeOfficeHours({
      days: [{ open: '25:00', close: 'noon', closed: 'yes' }],
      slotMinutes: 7,
    });
    expect(hours.days[0]).toEqual(DEFAULT_OFFICE_HOURS.days[0]);
    expect(hours.slotMinutes).toBe(30);
    expect(normalizeOfficeHours({ days: 'nope' }).days).toHaveLength(7);
  });

  it('accepts the step sizes the settings screen offers', () => {
    for (const slotMinutes of [15, 20, 30, 60]) {
      expect(normalizeOfficeHours({ slotMinutes }).slotMinutes).toBe(slotMinutes);
    }
  });
});

describe('toBusinessHours', () => {
  // This is what the calendar shaded before any of this existed. If it changes,
  // a deploy moves the shading on a live calendar without anyone asking.
  it('reproduces the calendar shading that was hardcoded', () => {
    expect(toBusinessHours(DEFAULT_OFFICE_HOURS)).toEqual([
      { daysOfWeek: [1, 2, 3, 4, 5, 6], startTime: '06:00', endTime: '18:00' },
    ]);
  });

  it('groups days that share a window and splits the ones that do not', () => {
    const hours = normalizeOfficeHours({
      days: [
        { closed: true },
        { open: '06:00', close: '18:00', closed: false },
        { open: '06:00', close: '18:00', closed: false },
        { open: '06:00', close: '18:00', closed: false },
        { open: '06:00', close: '18:00', closed: false },
        { open: '06:00', close: '18:00', closed: false },
        { open: '08:00', close: '12:00', closed: false }, // short Saturday
      ],
    });
    expect(toBusinessHours(hours)).toEqual([
      { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '18:00' },
      { daysOfWeek: [6], startTime: '08:00', endTime: '12:00' },
    ]);
  });

  it('shades nothing when every day is closed', () => {
    const hours = normalizeOfficeHours({ days: Array(7).fill({ closed: true }) });
    expect(toBusinessHours(hours)).toEqual([]);
  });
});

describe('to12Hour', () => {
  it('reads the way the pickers display times', () => {
    expect(to12Hour('06:00')).toBe('6:00 AM');
    expect(to12Hour('09:30')).toBe('9:30 AM');
    expect(to12Hour('12:00')).toBe('12:00 PM');
    expect(to12Hour('12:30')).toBe('12:30 PM');
    expect(to12Hour('13:00')).toBe('1:00 PM');
    expect(to12Hour('17:30')).toBe('5:30 PM');
    expect(to12Hour('00:00')).toBe('12:00 AM');
  });
});

describe('slotsForDay', () => {
  it('runs from opening to the last start before closing', () => {
    const monday = slotsForDay(DEFAULT_OFFICE_HOURS, 1);
    expect(monday[0]).toBe('6:00 AM');
    expect(monday[monday.length - 1]).toBe('5:30 PM');
    // A closing time is when the last visit ends, so 6:00 PM is not offered.
    expect(monday).not.toContain('6:00 PM');
    expect(monday).toHaveLength(24);
  });

  it('offers nothing on a closed day', () => {
    expect(slotsForDay(DEFAULT_OFFICE_HOURS, 0)).toEqual([]);
  });

  it('honours the step size', () => {
    const hourly = normalizeOfficeHours({ ...DEFAULT_OFFICE_HOURS, slotMinutes: 60 });
    expect(slotsForDay(hourly, 1)).toHaveLength(12);
    expect(slotsForDay(hourly, 1)).toContain('5:00 PM');
    expect(slotsForDay(hourly, 1)).not.toContain('5:30 PM');
  });

  // Someone will type a close earlier than the open. Offering no times that day
  // is right; an infinite loop is not.
  it('offers nothing when closing is not after opening', () => {
    const backwards = normalizeOfficeHours({ days: [{ open: '18:00', close: '06:00', closed: false }] });
    expect(slotsForDay(backwards, 0)).toEqual([]);
    const zero = normalizeOfficeHours({ days: [{ open: '09:00', close: '09:00', closed: false }] });
    expect(slotsForDay(zero, 0)).toEqual([]);
  });

  it('survives a day index that is not a day', () => {
    expect(slotsForDay(DEFAULT_OFFICE_HOURS, 7)).toEqual([]);
    expect(slotsForDay(DEFAULT_OFFICE_HOURS, -1)).toEqual([]);
  });
});

describe('allSlots', () => {
  it('is the union of every open day, in clock order, with no repeats', () => {
    const hours = normalizeOfficeHours({
      days: [
        { closed: true },
        { open: '09:00', close: '11:00', closed: false },
        { open: '06:00', close: '07:00', closed: false },
        { closed: true },
        { closed: true },
        { closed: true },
        { closed: true },
      ],
    });
    expect(allSlots(hours)).toEqual(['6:00 AM', '6:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM']);
  });

  it('sorts across noon rather than alphabetically', () => {
    const slots = allSlots(DEFAULT_OFFICE_HOURS);
    expect(slots.indexOf('11:30 AM')).toBeLessThan(slots.indexOf('12:00 PM'));
    expect(slots.indexOf('12:30 PM')).toBeLessThan(slots.indexOf('1:00 PM'));
  });
});

describe('gridRange', () => {
  it('keeps the span the calendar already showed', () => {
    expect(gridRange(DEFAULT_OFFICE_HOURS)).toEqual({ slotMinTime: '06:00:00', slotMaxTime: '21:00:00' });
  });

  // The whole point: editable hours must not be able to hide themselves, or an
  // appointment booked inside them, behind a fixed grid.
  it('widens for hours outside that span', () => {
    const early = normalizeOfficeHours({ days: [{ open: '04:30', close: '22:30', closed: false }] });
    expect(gridRange(early)).toEqual({ slotMinTime: '04:30:00', slotMaxTime: '22:30:00' });
  });

  it('does not shrink for narrow hours', () => {
    const narrow = normalizeOfficeHours({ days: Array(7).fill({ open: '09:00', close: '15:00', closed: false }) });
    expect(gridRange(narrow)).toEqual({ slotMinTime: '06:00:00', slotMaxTime: '21:00:00' });
  });

  it('ignores closed days when finding the extremes', () => {
    const hours = normalizeOfficeHours({
      days: [
        { open: '03:00', close: '23:00', closed: true }, // closed, must not widen
        { open: '09:00', close: '15:00', closed: false },
        ...Array(5).fill({ closed: true }),
      ],
    });
    expect(gridRange(hours)).toEqual({ slotMinTime: '06:00:00', slotMaxTime: '21:00:00' });
  });

  it('survives every day being closed', () => {
    const shut = normalizeOfficeHours({ days: Array(7).fill({ closed: true }) });
    expect(gridRange(shut)).toEqual({ slotMinTime: '06:00:00', slotMaxTime: '21:00:00' });
  });
});

describe('the after-hours boundary', () => {
  it('defaults to where the surcharged slots begin today', () => {
    // RescheduleAppointmentModal lists 5:30 PM onward under "After Hours (+$50)".
    expect(DEFAULT_OFFICE_HOURS.afterHoursFrom).toBe('17:30');
    expect(isAfterHours(DEFAULT_OFFICE_HOURS, '5:00 PM')).toBe(false);
    expect(isAfterHours(DEFAULT_OFFICE_HOURS, '5:30 PM')).toBe(true);
    expect(isAfterHours(DEFAULT_OFFICE_HOURS, '8:00 PM')).toBe(true);
    expect(isAfterHours(DEFAULT_OFFICE_HOURS, '6:00 AM')).toBe(false);
  });

  it('survives a garbage stored value rather than surcharging everything', () => {
    expect(normalizeOfficeHours({ afterHoursFrom: 'evening' }).afterHoursFrom).toBe('17:30');
    expect(normalizeOfficeHours({ afterHoursFrom: '19:00' }).afterHoursFrom).toBe('19:00');
  });

  // The regression this guards: the recurring-series builder bills a flat price
  // with no surcharge, so a 5:30 PM start there loses $50 on every occurrence.
  it('keeps surcharged times out of regularSlots', () => {
    const slots = regularSlots(DEFAULT_OFFICE_HOURS);
    expect(slots[0]).toBe('6:00 AM');
    expect(slots[slots.length - 1]).toBe('5:00 PM');
    expect(slots).not.toContain('5:30 PM');
  });

  it('moves with the boundary', () => {
    const later = normalizeOfficeHours({ ...DEFAULT_OFFICE_HOURS, afterHoursFrom: '19:00' });
    // Regular slots can never exceed the day's closing time either.
    expect(regularSlots(later)).toEqual(allSlots(later));
    const earlier = normalizeOfficeHours({ ...DEFAULT_OFFICE_HOURS, afterHoursFrom: '12:00' });
    expect(regularSlots(earlier)).not.toContain('12:00 PM');
    expect(regularSlots(earlier)).toContain('11:30 AM');
  });
});
