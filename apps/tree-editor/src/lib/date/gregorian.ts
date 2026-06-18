/*
 * FamilyTreeEditor - cosmetic Haracalnde -> Gregorian-year approximation for tooltips
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { HaracalndeDate } from "$lib/date/HaracalndeDate";

/*
 * Lossy by design: the in-world calendar is 360 days where Gregorian is ~365.25,
 * and there is no canonical anchor between PC 1 and 1 AD. This mapping exists
 * only to give the editor a familiar year label in tooltips ("approx 1822 BC").
 * It is never round-tripped or persisted.
 */

export function approxGregorianYear(d: HaracalndeDate): number {
    return d.toApproxGregorianYear();
}

export function approxGregorianLabel(d: HaracalndeDate): string {
    const y = approxGregorianYear(d);
    if (y > 0) return `approx AD ${String(y)}`;
    if (y < 0) return `approx ${String(-y)} BC`;
    return "approx AD 0";
}
