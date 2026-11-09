import { describe, expect, it } from 'vitest';
import { localTime, onShift, shiftsSchema } from './shifts.js';

const VN = 'Asia/Ho_Chi_Minh';
// Tuesday 10 November 2026, 08:30 in Vietnam (UTC+7) = 01:30 UTC.
const tuesdayMorning = new Date('2026-11-10T01:30:00Z');

describe('localTime', () => {
  it('uses the shop time zone, not the server one', () => {
    expect(localTime(VN, tuesdayMorning)).toEqual({ day: 2, minutes: 8 * 60 + 30 });
    expect(localTime('UTC', tuesdayMorning)).toEqual({ day: 2, minutes: 90 });
  });
  it('crosses midnight into the next day', () => {
    // 18:00 UTC Monday 9 = 01:00 Tuesday in Vietnam.
    expect(localTime(VN, new Date('2026-11-09T18:00:00Z'))).toEqual({ day: 2, minutes: 60 });
  });
  it('falls back to Vietnam time for an unknown zone', () => {
    expect(localTime('Not/AZone', tuesdayMorning)).toEqual(localTime(VN, tuesdayMorning));
  });
});

describe('onShift', () => {
  const tuesday = { dayOfWeek: 2, startTime: '08:00', endTime: '12:00' };
  it('no shifts set → always on shift', () => {
    expect(onShift([], VN, tuesdayMorning)).toBe(true);
  });
  it('inside a shift on the right day', () => {
    expect(onShift([tuesday], VN, tuesdayMorning)).toBe(true);
  });
  it('start is inclusive, end exclusive', () => {
    expect(onShift([tuesday], VN, new Date('2026-11-10T01:00:00Z'))).toBe(true); // 08:00
    expect(onShift([tuesday], VN, new Date('2026-11-10T05:00:00Z'))).toBe(false); // 12:00
  });
  it('another day or outside hours → off shift', () => {
    expect(onShift([{ ...tuesday, dayOfWeek: 3 }], VN, tuesdayMorning)).toBe(false);
    expect(onShift([{ ...tuesday, startTime: '13:00', endTime: '17:00' }], VN, tuesdayMorning)).toBe(false);
  });
  it('"24:00" ends the day', () => {
    expect(onShift([{ dayOfWeek: 2, startTime: '18:00', endTime: '24:00' }], VN, new Date('2026-11-10T16:59:00Z'))).toBe(true); // 23:59
  });
});

describe('shiftsSchema', () => {
  const ok = (shifts: unknown) => shiftsSchema.safeParse({ shifts }).success;
  it('accepts a normal week', () => {
    expect(
      ok([
        { dayOfWeek: 1, startTime: '08:00', endTime: '17:30' },
        { dayOfWeek: 0, startTime: '18:00', endTime: '24:00' },
      ]),
    ).toBe(true);
  });
  it.each([
    [{ dayOfWeek: 7, startTime: '08:00', endTime: '17:00' }],
    [{ dayOfWeek: 1, startTime: '8:00', endTime: '17:00' }],
    [{ dayOfWeek: 1, startTime: '17:00', endTime: '08:00' }],
    [{ dayOfWeek: 1, startTime: '08:00', endTime: '08:00' }],
    [{ dayOfWeek: 1, startTime: '24:00', endTime: '24:00' }],
    [{ dayOfWeek: 1, startTime: '08:00', endTime: '25:00' }],
    [{ dayOfWeek: 1, startTime: '08:00', endTime: '17:00', memberId: 'x' }],
  ])('rejects %j', (shift) => {
    expect(ok([shift])).toBe(false);
  });
});
