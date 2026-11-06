/** The time zone this browser is in, which the portal offers first. */
export const BROWSER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Every zone the browser knows, with the browser's own and the saved one in
 *  case either is missing from the list. */
export function timeZoneChoices(saved: string | undefined): string[] {
  const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = new Set(supportedValuesOf?.('timeZone') ?? []);
  zones.add(BROWSER_TIME_ZONE);
  if (saved) zones.add(saved);
  return [...zones].sort();
}
