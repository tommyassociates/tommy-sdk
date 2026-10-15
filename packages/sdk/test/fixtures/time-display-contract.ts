import type { TommySdk, TimeDisplay, TimeRangeDisplay, ViewerTimezone, ResolvedWallTime, CalendarDayBounds } from '../../src/types';

declare const sdk: TommySdk;
const display: TimeDisplay = sdk.time.formatInstant('2026-10-15T00:00:00Z', { timezone: 'Australia/Brisbane', kind: 'time' });
const range: TimeRangeDisplay = sdk.time.formatRange(display.datetime, display.datetime, { timezone: display.timezone });
const viewer: ViewerTimezone = sdk.time.viewer();
const wall: ResolvedWallTime = sdk.time.resolveWallTime({ date: '2026-11-01', time: '01:30', timezone: 'America/New_York', disambiguation: 'later' });
const date: string = sdk.time.formatDateOnly('2026-10-15', { locale: 'th-TH' });
const weekday: number = sdk.time.calendarParts(wall.instant, { timezone: wall.timezone }).weekday;
const enabled: boolean = sdk.time.context().enabled;
const zones: readonly string[] = sdk.time.zones();
const bounds: CalendarDayBounds = sdk.time.dayBounds('2026-09-06', { timezone: 'America/Santiago' });
const duration: number = bounds.durationMinutes;
void [range, viewer, date, weekday, enabled, zones, duration];
// @ts-expect-error Civil-day boundaries require an explicit business timezone.
sdk.time.dayBounds('2026-09-06', {});
// @ts-expect-error An offset-free instant must still name its business timezone.
sdk.time.formatInstant('2026-10-15T00:00:00Z', {});
// @ts-expect-error Private preferences cannot be overridden by an MP formatter call.
sdk.time.formatInstant('2026-10-15T00:00:00Z', { timezone: 'UTC', preferences: { timezone_mode: 'manual' } });
// @ts-expect-error Silent ambiguity resolution is not a supported operation.
sdk.time.resolveWallTime({ date: '2026-11-01', time: '01:30', timezone: 'America/New_York', disambiguation: 'compatible' });
