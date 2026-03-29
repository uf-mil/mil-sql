/** US Eastern — EST in winter, EDT in summer (IANA). */
export const APP_TIME_ZONE = 'America/New_York';

const locale = 'en-US';

/**
 * @param {string|number|Date} isoOrDate
 * @returns {boolean}
 */
function isValidDate(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return !Number.isNaN(d.getTime());
}

/**
 * Calendar day in Eastern as YYYY-MM-DD (for same-day checks).
 * @param {string|number|Date} isoOrDate
 */
export function easternCalendarDayKey(isoOrDate) {
  if (!isValidDate(isoOrDate)) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return d.toLocaleDateString('en-CA', { timeZone: APP_TIME_ZONE });
}

/**
 * @param {string|number|Date} isoOrDate
 */
export function formatEasternTimeShort(isoOrDate) {
  if (!isValidDate(isoOrDate)) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return d.toLocaleTimeString(locale, {
    timeZone: APP_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * @param {string|number|Date} isoOrDate
 */
export function formatEasternDateShort(isoOrDate) {
  if (!isValidDate(isoOrDate)) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return d.toLocaleDateString(locale, {
    timeZone: APP_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  });
}

/**
 * @param {string|number|Date} isoOrDate
 */
export function formatEasternDateTime(isoOrDate) {
  if (!isValidDate(isoOrDate)) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return d.toLocaleString(locale, {
    timeZone: APP_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/**
 * Date only (custom field values, etc.).
 * @param {string|number|Date} isoOrDate
 */
export function formatEasternDateOnly(isoOrDate) {
  if (!isValidDate(isoOrDate)) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return d.toLocaleDateString(locale, { timeZone: APP_TIME_ZONE });
}
