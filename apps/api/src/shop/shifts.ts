// AUTH-15: work shifts per staff member. Times are local to the shop's time zone; a shift ends after it starts on the
// same day (a night shift past midnight is entered as two shifts).
import { z } from 'zod';

export interface Shift {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // "08:00"
  endTime: string; // "17:30", or "24:00" for end of day
}

const time = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (t: string) => (t === '24:00' ? 1440 : Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));

export const shiftsSchema = z.strictObject({
  shifts: z
    .array(
      z
        .strictObject({
          dayOfWeek: z.number().int().min(0).max(6),
          startTime: z.string().regex(time, 'Giờ dạng HH:MM'),
          endTime: z.string().refine((t) => t === '24:00' || time.test(t), 'Giờ dạng HH:MM'),
        })
        .refine((s) => toMinutes(s.endTime) > toMinutes(s.startTime), { message: 'Giờ kết thúc phải sau giờ bắt đầu', path: ['endTime'] }),
    )
    .max(28),
});

/** Day of week and minutes since midnight in the given IANA time zone. */
export function localTime(timeZone: string, at: Date): { day: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  } catch {
    return localTime('Asia/Ho_Chi_Minh', at); // unknown zone stored on an old shop
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** A member with no shifts set is always on shift; otherwise only inside one of them. */
export function onShift(shifts: Shift[], timeZone: string, at: Date): boolean {
  if (!shifts.length) return true;
  const now = localTime(timeZone, at);
  return shifts.some((s) => s.dayOfWeek === now.day && now.minutes >= toMinutes(s.startTime) && now.minutes < toMinutes(s.endTime));
}
