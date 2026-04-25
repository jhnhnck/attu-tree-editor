/*
 * FamilyTreeEditor - Haracalnde calendar value class (PC/TT eras, 12x30 = 360 days)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { err, ok, type Result } from "$lib/utils/result";

export type Era = "PC" | "TT";

export interface HaracalndeDateData {
    era: Era;
    year: number;
    month?: number;
    day?: number;
    approximate?: boolean;
}

export const DateParseErrors = {
    BadShape: "BadShape",
    YearZero: "YearZero",
    MonthOutOfRange: "MonthOutOfRange",
    DayOutOfRange: "DayOutOfRange",
    UnknownPrefix: "UnknownPrefix",
    UnknownMonthName: "UnknownMonthName",
} as const;

export type DateParseError = (typeof DateParseErrors)[keyof typeof DateParseErrors];

const MONTHS_PER_YEAR = 12;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = MONTHS_PER_YEAR * DAYS_PER_MONTH;

const GEDCOM_MONTH_NAMES = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
] as const;

const GEDCOM_PREFIXES = new Set(["ABT", "BEF", "AFT", "EST", "CAL"]);

export class HaracalndeDate {
    readonly era: Era;
    readonly year: number;
    readonly month: number | undefined;
    readonly day: number | undefined;
    readonly approximate: boolean;

    constructor(data: HaracalndeDateData) {
        if (!Number.isInteger(data.year) || data.year < 1) {
            throw new Error(
                `HaracalndeDate: year must be a positive integer, got ${String(data.year)}`,
            );
        }
        if (
            data.month !== undefined &&
            (!Number.isInteger(data.month) || data.month < 1 || data.month > MONTHS_PER_YEAR)
        ) {
            throw new Error(`HaracalndeDate: month must be 1..12, got ${String(data.month)}`);
        }
        if (
            data.day !== undefined &&
            (!Number.isInteger(data.day) || data.day < 1 || data.day > DAYS_PER_MONTH)
        ) {
            throw new Error(`HaracalndeDate: day must be 1..30, got ${String(data.day)}`);
        }
        this.era = data.era;
        this.year = data.year;
        this.month = data.month;
        this.day = data.day;
        this.approximate = data.approximate ?? false;
    }

    static of(data: HaracalndeDateData): HaracalndeDate {
        return new HaracalndeDate(data);
    }

    /**
     * Parses the FamilyScript date *value* (the part after the leading b/d/m tag byte).
     * Shape: [B?]YYYYMMDD[~?]. B prefix = TT era, no prefix = PC era.
     * `'00000000'` returns ok(null) to signal "unknown" without distinguishing from absent.
     */
    static parseFamilyScript(raw: string): Result<HaracalndeDate | null, DateParseError> {
        const match = /^(B?)(\d{4})(\d{2})(\d{2})(~?)$/.exec(raw);
        if (!match) {
            return err(DateParseErrors.BadShape);
        }
        const eraFlag = match[1];
        const yearStr = match[2];
        const monthStr = match[3];
        const dayStr = match[4];
        const approxFlag = match[5];

        // typescript can't see that a successful regex match guarantees these
        if (yearStr === undefined || monthStr === undefined || dayStr === undefined) {
            return err(DateParseErrors.BadShape);
        }

        const year = Number(yearStr);
        const month = Number(monthStr);
        const day = Number(dayStr);

        // wholly unknown date: caller treats this as "no date set"
        if (year === 0 && month === 0 && day === 0) {
            return ok(null);
        }
        if (year === 0) {
            return err(DateParseErrors.YearZero);
        }
        if (month > MONTHS_PER_YEAR) {
            return err(DateParseErrors.MonthOutOfRange);
        }
        if (day > DAYS_PER_MONTH) {
            return err(DateParseErrors.DayOutOfRange);
        }

        const data: HaracalndeDateData = {
            era: eraFlag === "B" ? "TT" : "PC",
            year,
            approximate: approxFlag === "~",
        };
        if (month !== 0) data.month = month;
        if (day !== 0) data.day = day;
        return ok(new HaracalndeDate(data));
    }

    /**
     * Parses GEDCOM 5.5.1 DATE values: optional ABT/BEF/AFT/EST/CAL, then
     * `D MMM YYYY` | `MMM YYYY` | `YYYY`, optional trailing BC for TT era.
     */
    static parseGedcom(raw: string): Result<HaracalndeDate, DateParseError> {
        const tokens = raw.trim().split(/\s+/);
        if (tokens.length === 0) return err(DateParseErrors.BadShape);

        let approximate = false;
        let i = 0;
        const first = tokens[i];
        if (first !== undefined && GEDCOM_PREFIXES.has(first.toUpperCase())) {
            // we treat all prefixes as approximate for now; richer modeling can land in phase 2
            approximate = true;
            i += 1;
        }

        let era: Era = "PC";
        const last = tokens[tokens.length - 1];
        if (last !== undefined && last.toUpperCase() === "BC") {
            era = "TT";
            tokens.pop();
        }

        const body = tokens.slice(i);
        if (body.length === 0 || body.length > 3) {
            return err(DateParseErrors.BadShape);
        }

        let day: number | undefined;
        let month: number | undefined;
        let yearStr: string;

        if (body.length === 3) {
            const [dayStr, monthStr, yStr] = body;
            if (dayStr === undefined || monthStr === undefined || yStr === undefined) {
                return err(DateParseErrors.BadShape);
            }
            if (!/^\d+$/.test(dayStr)) return err(DateParseErrors.BadShape);
            day = Number(dayStr);
            const monthIdx = GEDCOM_MONTH_NAMES.indexOf(
                monthStr.toUpperCase() as (typeof GEDCOM_MONTH_NAMES)[number],
            );
            if (monthIdx < 0) return err(DateParseErrors.UnknownMonthName);
            month = monthIdx + 1;
            yearStr = yStr;
        } else if (body.length === 2) {
            const [monthStr, yStr] = body;
            if (monthStr === undefined || yStr === undefined) {
                return err(DateParseErrors.BadShape);
            }
            const monthIdx = GEDCOM_MONTH_NAMES.indexOf(
                monthStr.toUpperCase() as (typeof GEDCOM_MONTH_NAMES)[number],
            );
            if (monthIdx < 0) return err(DateParseErrors.UnknownMonthName);
            month = monthIdx + 1;
            yearStr = yStr;
        } else {
            const [yStr] = body;
            if (yStr === undefined) return err(DateParseErrors.BadShape);
            yearStr = yStr;
        }

        if (!/^\d+$/.test(yearStr)) return err(DateParseErrors.BadShape);
        const year = Number(yearStr);
        if (year < 1) return err(DateParseErrors.YearZero);
        if (day !== undefined && (day < 1 || day > DAYS_PER_MONTH)) {
            return err(DateParseErrors.DayOutOfRange);
        }

        const data: HaracalndeDateData = { era, year, approximate };
        if (month !== undefined) data.month = month;
        if (day !== undefined) data.day = day;
        return ok(new HaracalndeDate(data));
    }

    /**
     * Parses the inline narrative form found in FamilyScript `j` / `T` fields,
     * e.g. `24-7 1787 TT`, `15-3 5 PC`, `21 PC`, `ABT 12-11 1822 TT`.
     */
    static parseNarrative(raw: string): Result<HaracalndeDate, DateParseError> {
        const tokens = raw.trim().split(/\s+/);
        if (tokens.length === 0) return err(DateParseErrors.BadShape);

        let approximate = false;
        let i = 0;
        const first = tokens[i];
        if (first !== undefined && first.toUpperCase() === "ABT") {
            approximate = true;
            i += 1;
        }

        const remaining = tokens.slice(i);
        if (remaining.length < 2 || remaining.length > 3) {
            return err(DateParseErrors.BadShape);
        }

        const eraToken = remaining[remaining.length - 1];
        if (eraToken !== "PC" && eraToken !== "TT") {
            return err(DateParseErrors.BadShape);
        }
        const era: Era = eraToken;

        let day: number | undefined;
        let month: number | undefined;
        let yearStr: string;

        if (remaining.length === 3) {
            const [dayMonth, yStr] = remaining;
            if (dayMonth === undefined || yStr === undefined) {
                return err(DateParseErrors.BadShape);
            }
            const dmMatch = /^(\d+)-(\d+)$/.exec(dayMonth);
            if (!dmMatch || dmMatch[1] === undefined || dmMatch[2] === undefined) {
                return err(DateParseErrors.BadShape);
            }
            day = Number(dmMatch[1]);
            month = Number(dmMatch[2]);
            yearStr = yStr;
        } else {
            const yStr = remaining[0];
            if (yStr === undefined) return err(DateParseErrors.BadShape);
            yearStr = yStr;
        }

        if (!/^\d+$/.test(yearStr)) return err(DateParseErrors.BadShape);
        const year = Number(yearStr);
        if (year < 1) return err(DateParseErrors.YearZero);
        if (month !== undefined && (month < 1 || month > MONTHS_PER_YEAR)) {
            return err(DateParseErrors.MonthOutOfRange);
        }
        if (day !== undefined && (day < 1 || day > DAYS_PER_MONTH)) {
            return err(DateParseErrors.DayOutOfRange);
        }

        const data: HaracalndeDateData = { era, year, approximate };
        if (month !== undefined) data.month = month;
        if (day !== undefined) data.day = day;
        return ok(new HaracalndeDate(data));
    }

    toFamilyScript(): string {
        const eraFlag = this.era === "TT" ? "B" : "";
        const yyyy = String(this.year).padStart(4, "0");
        const mm = String(this.month ?? 0).padStart(2, "0");
        const dd = String(this.day ?? 0).padStart(2, "0");
        const approxFlag = this.approximate ? "~" : "";
        return `${eraFlag}${yyyy}${mm}${dd}${approxFlag}`;
    }

    toGedcom(): string {
        const parts: string[] = [];
        if (this.approximate) parts.push("ABT");
        if (this.day !== undefined && this.month !== undefined) {
            const monthName = GEDCOM_MONTH_NAMES[this.month - 1];
            parts.push(String(this.day), monthName ?? "JAN", this.formatGedcomYear());
        } else if (this.month !== undefined) {
            const monthName = GEDCOM_MONTH_NAMES[this.month - 1];
            parts.push(monthName ?? "JAN", this.formatGedcomYear());
        } else {
            parts.push(this.formatGedcomYear());
        }
        if (this.era === "TT") parts.push("BC");
        return parts.join(" ");
    }

    private formatGedcomYear(): string {
        // mirrors the example file: short years zero-padded to 4 (e.g. "0017"),
        // longer years emitted as-is
        return this.year < 1000 ? String(this.year).padStart(4, "0") : String(this.year);
    }

    toNarrative(): string {
        const parts: string[] = [];
        if (this.approximate) parts.push("ABT");
        if (this.day !== undefined && this.month !== undefined) {
            parts.push(`${String(this.day)}-${String(this.month)}`, String(this.year), this.era);
        } else {
            parts.push(String(this.year), this.era);
        }
        return parts.join(" ");
    }

    toString(): string {
        return this.toNarrative();
    }

    toJSON(): HaracalndeDateData {
        const out: HaracalndeDateData = { era: this.era, year: this.year };
        if (this.month !== undefined) out.month = this.month;
        if (this.day !== undefined) out.day = this.day;
        if (this.approximate) out.approximate = true;
        return out;
    }

    /**
     * Canonical day index used for ordering and arithmetic. PC 1 day 1 month 1 -> 0.
     * Within a TT year, days/months still progress forward (Jan -> Dec); only the
     * year number counts backward, so TT 1 12-30 sits at index -1, immediately
     * preceding PC 1 1-1.
     * Missing month/day are treated as 1 for ordering only.
     */
    private dayIndex(): number {
        const m = this.month ?? 1;
        const d = this.day ?? 1;
        const within = (m - 1) * DAYS_PER_MONTH + (d - 1);
        const yearOffset =
            this.era === "PC" ? (this.year - 1) * DAYS_PER_YEAR : -this.year * DAYS_PER_YEAR;
        return yearOffset + within;
    }

    compare(other: HaracalndeDate): -1 | 0 | 1 {
        const a = this.dayIndex();
        const b = other.dayIndex();
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    }

    equals(other: HaracalndeDate): boolean {
        return (
            this.era === other.era &&
            this.year === other.year &&
            this.month === other.month &&
            this.day === other.day &&
            this.approximate === other.approximate
        );
    }

    isBefore(other: HaracalndeDate): boolean {
        return this.compare(other) < 0;
    }

    isAfter(other: HaracalndeDate): boolean {
        return this.compare(other) > 0;
    }

    plusDays(days: number): HaracalndeDate {
        return HaracalndeDate.fromDayIndex(
            this.dayIndex() + days,
            this.month,
            this.day,
            this.approximate,
        );
    }

    minusDays(days: number): HaracalndeDate {
        return this.plusDays(-days);
    }

    daysSince(other: HaracalndeDate): number {
        return this.dayIndex() - other.dayIndex();
    }

    /**
     * Adds N years preserving month/day. Crosses the TT/PC boundary cleanly:
     * adding to a TT date may produce a PC date and vice versa.
     */
    plusYears(years: number): HaracalndeDate {
        return this.plusDays(years * DAYS_PER_YEAR);
    }

    toApproxGregorianYear(): number {
        const v = this.era === "PC" ? this.year : -(this.year - 1);
        return v === 0 ? 0 : v;
    }

    /**
     * Reconstructs a date from a canonical day index. If the original carried
     * an undefined month or day, the reconstructed value also drops the
     * corresponding field when the index lands exactly on its default position
     * (avoids round-trip drift like "5 PC" -> "1-1 5 PC" -> "5 PC").
     */
    private static fromDayIndex(
        index: number,
        originalMonth: number | undefined,
        originalDay: number | undefined,
        approximate: boolean,
    ): HaracalndeDate {
        let era: Era;
        let year: number;
        let within: number;
        if (index >= 0) {
            era = "PC";
            year = Math.floor(index / DAYS_PER_YEAR) + 1;
            within = index - (year - 1) * DAYS_PER_YEAR;
        } else {
            era = "TT";
            year = Math.ceil(-index / DAYS_PER_YEAR);
            within = index + year * DAYS_PER_YEAR;
        }
        const month = Math.floor(within / DAYS_PER_MONTH) + 1;
        const day = (within % DAYS_PER_MONTH) + 1;

        const data: HaracalndeDateData = { era, year, approximate };
        // preserve original "unknown sub-component" iff we landed on the default position
        if (!(originalMonth === undefined && month === 1)) data.month = month;
        if (!(originalDay === undefined && day === 1)) data.day = day;
        return new HaracalndeDate(data);
    }
}
