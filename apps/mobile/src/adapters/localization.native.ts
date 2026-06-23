import * as Localization from 'expo-localization';

/** Device IANA timezone (e.g. "Africa/Lagos"); falls back to UTC. */
export function getDeviceTimeZone(): string {
  return Localization.getCalendars()[0]?.timeZone ?? 'UTC';
}
