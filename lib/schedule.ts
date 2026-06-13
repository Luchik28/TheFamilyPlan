import { randomInt } from "crypto";
import type { Role } from "@/lib/db";

// Readable codes (no ambiguous chars like O/0, I/1).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Sunday..Saturday (inclusive) of the week containing `weekParam` (or today),
// as YYYY-MM-DD strings. UTC math keeps the range stable across timezones.
export function weekRange(weekParam: string | null): {
  start: string;
  end: string;
} {
  const ref =
    weekParam && DATE_RE.test(weekParam)
      ? new Date(`${weekParam}T00:00:00Z`)
      : new Date();
  const d = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate())
  );
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // back up to Sunday (0)
  const start = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const end = d.toISOString().slice(0, 10);
  return { start, end };
}

export type PersonInput = { name?: string; role?: string; color?: string };

export function validatePerson(
  data: PersonInput
): { ok: true } | { ok: false; error: string } {
  if (!data.name || !data.name.trim()) {
    return { ok: false, error: "Name is required." };
  }
  if (data.role !== "driver" && data.role !== "kid") {
    return { ok: false, error: "Role must be 'driver' or 'kid'." };
  }
  return { ok: true };
}

export type ItemInput = {
  event_date?: string;
  start_time?: string;
  end_time?: string | null;
  location?: string;
  notes?: string;
};

// Validation depends on the owning person's role:
//  - kid   -> a "need": a single point in time (start_time), no end required.
//  - driver-> an "availability": a block (start_time < end_time).
export function validateItem(
  role: Role,
  data: ItemInput
): { ok: true } | { ok: false; error: string } {
  if (!data.event_date || !DATE_RE.test(data.event_date)) {
    return { ok: false, error: "A valid day is required." };
  }
  if (!data.start_time || !TIME_RE.test(data.start_time)) {
    return { ok: false, error: "A valid time is required." };
  }
  if (role === "driver") {
    if (!data.end_time || !TIME_RE.test(data.end_time)) {
      return { ok: false, error: "Availability needs an end time." };
    }
    if (toMinutes(data.end_time) <= toMinutes(data.start_time)) {
      return { ok: false, error: "End time must be after start time." };
    }
  }
  return { ok: true };
}
