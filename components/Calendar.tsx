"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DAY_START = 6; // grid starts at 06:00
const DAY_END = 23; // grid ends at 23:00
const HOUR_H = 48; // px per hour — must match .calendar --hour-h
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type CalendarEvent = {
  id: number;
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  person: string;
  color: string;
  notes: string;
};

type FormState = {
  id: number | null;
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  person: string;
  color: string;
  notes: string;
};

// ---- date helpers (local time) ------------------------------------------- //
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function Calendar({ code, name }: { code: string; name: string }) {
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState<Date>(() => new Date());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const loadEvents = useCallback(async () => {
    const res = await fetch(`/api/plan/${code}/events?week=${isoDate(weekStart)}`);
    if (!res.ok) {
      showToast("Failed to load events");
      return;
    }
    const data = await res.json();
    setEvents(data.events);
  }, [code, weekStart, showToast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Keep the "now" line fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const hours = useMemo(
    () => Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i),
    []
  );

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${weekStart.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(
      undefined,
      opts
    )}, ${end.getFullYear()}`;
  }, [weekStart]);

  function openNew(dateStr?: string, hour?: number) {
    const h = hour ?? 9;
    setForm({
      id: null,
      title: "",
      event_date: dateStr ?? isoDate(weekStart),
      start_time: `${String(h).padStart(2, "0")}:00`,
      end_time: `${String(Math.min(h + 1, 23)).padStart(2, "0")}:00`,
      person: "",
      color: "#4f7cff",
      notes: "",
    });
  }

  function openEdit(ev: CalendarEvent) {
    setForm({ ...ev });
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const payload = {
      title: form.title.trim(),
      event_date: form.event_date,
      start_time: form.start_time,
      end_time: form.end_time,
      person: form.person.trim(),
      color: form.color,
      notes: form.notes.trim(),
    };
    const url = form.id
      ? `/api/plan/${code}/events/${form.id}`
      : `/api/plan/${code}/events`;
    const res = await fetch(url, {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "Could not save");
      return;
    }
    showToast(form.id ? "Event updated" : "Event added");
    setForm(null);
    loadEvents();
  }

  async function deleteEvent() {
    if (!form?.id) return;
    if (!confirm("Delete this event?")) return;
    const res = await fetch(`/api/plan/${code}/events/${form.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      showToast("Event deleted");
      setForm(null);
      loadEvents();
    } else {
      showToast("Could not delete");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copied — share it to invite others");
    } catch {
      showToast(`Share this URL: ${window.location.href}`);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <Link href="/" className="home-link">
            📅
          </Link>
          <div>
            <h1>{name}</h1>
            <div className="code-pill" title="Share this code so others can join">
              Code: <strong>{code}</strong>
              <button className="ghost-btn" type="button" onClick={copyLink}>
                Copy link
              </button>
            </div>
          </div>
        </div>
        <div className="week-nav">
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ‹
          </button>
          <button type="button" onClick={() => setWeekStart(mondayOf(new Date()))}>
            Today
          </button>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            ›
          </button>
          <span id="week-label">{weekLabel}</span>
        </div>
        <button className="primary" type="button" onClick={() => openNew()}>
          + Add event
        </button>
      </header>

      {toast && <div className="toast">{toast}</div>}

      <main className="calendar">
        <div className="corner" />
        {days.map((d, i) => (
          <div
            key={`head-${i}`}
            className={"col-head" + (sameDay(d, now) ? " today" : "")}
          >
            <div className="dow">{DOW[i]}</div>
            <div className="dom">{d.getDate()}</div>
          </div>
        ))}

        <div className="time-gutter">
          {hours.map((h) => (
            <div key={`t-${h}`} className="time-label">
              {fmtTime(`${String(h).padStart(2, "0")}:00`)}
            </div>
          ))}
        </div>

        {days.map((d, i) => {
          const dateStr = isoDate(d);
          const dayEvents = events.filter((e) => e.event_date === dateStr);
          const nowMins = now.getHours() * 60 + now.getMinutes();
          const showNow =
            sameDay(d, now) &&
            nowMins >= DAY_START * 60 &&
            nowMins <= (DAY_END + 1) * 60;
          return (
            <div key={`col-${i}`} className="day-col">
              {hours.map((h) => (
                <div
                  key={`c-${i}-${h}`}
                  className="hour-cell"
                  onClick={() => openNew(dateStr, h)}
                />
              ))}
              {showNow && (
                <div
                  className="now-line"
                  style={{ top: `${((nowMins - DAY_START * 60) / 60) * HOUR_H}px` }}
                />
              )}
              {dayEvents.map((ev) => {
                const top = ((minutesOf(ev.start_time) - DAY_START * 60) / 60) * HOUR_H;
                const height = Math.max(
                  ((minutesOf(ev.end_time) - minutesOf(ev.start_time)) / 60) * HOUR_H,
                  18
                );
                return (
                  <div
                    key={ev.id}
                    className="event"
                    style={{ top: `${top}px`, height: `${height}px`, background: ev.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(ev);
                    }}
                  >
                    <div className="ev-title">{ev.title}</div>
                    <div className="ev-time">
                      {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                    </div>
                    {ev.person && <div className="ev-person">{ev.person}</div>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </main>

      {form && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setForm(null);
          }}
        >
          <div className="modal">
            <h2>{form.id ? "Edit event" : "Add event"}</h2>
            <form onSubmit={submitForm}>
              <label>
                Title
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  autoFocus
                />
              </label>
              <label>
                Day
                <select
                  required
                  value={form.event_date}
                  onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                >
                  {days.map((d, i) => (
                    <option key={i} value={isoDate(d)}>
                      {DOW[i]} {d.getMonth() + 1}/{d.getDate()}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row">
                <label>
                  Start
                  <input
                    type="time"
                    required
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  />
                </label>
                <label>
                  End
                  <input
                    type="time"
                    required
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  />
                </label>
              </div>
              <div className="row">
                <label>
                  Who (optional)
                  <input
                    type="text"
                    maxLength={40}
                    value={form.person}
                    onChange={(e) => setForm({ ...form, person: e.target.value })}
                  />
                </label>
                <label>
                  Color
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Notes (optional)
                <textarea
                  rows={2}
                  maxLength={500}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              <div className="modal-actions">
                {form.id && (
                  <button type="button" className="danger" onClick={deleteEvent}>
                    Delete
                  </button>
                )}
                <span className="spacer" />
                <button type="button" className="ghost-btn" onClick={() => setForm(null)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
