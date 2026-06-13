import { randomInt } from "crypto";

// Readable codes (no ambiguous chars like O/0, I/1).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export type EventInput = {
  title?: string;
  event_date?: string;
  start_time?: string;
  end_time?: string;
  person?: string;
  color?: string;
  notes?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function validateEvent(
  data: EventInput
): { ok: true } | { ok: false; error: string } {
  for (const field of ["title", "event_date", "start_time", "end_time"] as const) {
    if (!data[field]) return { ok: false, error: `Missing field: ${field}` };
  }
  if (!DATE_RE.test(data.event_date!)) {
    return { ok: false, error: "Invalid date format." };
  }
  if (!TIME_RE.test(data.start_time!) || !TIME_RE.test(data.end_time!)) {
    return { ok: false, error: "Invalid time format." };
  }
  if (Number.isNaN(Date.parse(`${data.event_date}T00:00:00`))) {
    return { ok: false, error: "Invalid date." };
  }
  if (toMinutes(data.end_time!) <= toMinutes(data.start_time!)) {
    return { ok: false, error: "End time must be after start time." };
  }
  return { ok: true };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
