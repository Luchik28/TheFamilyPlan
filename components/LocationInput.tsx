"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = {
  label: string;
  lat: number;
  lng: number;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: string, lat: number, lng: number) => void;
};

export default function LocationInput({ value, onChange, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userTypedRef = useRef(false);

  useEffect(() => {
    if (!userTypedRef.current || value.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=5`,
          { signal: ctrl.signal }
        );
        const json = await res.json();
        const results: Suggestion[] = (json.features ?? []).map((f: any) => {
          const p = f.properties;
          const street =
            p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street || p.name;
          const label = [street, p.city, p.state].filter(Boolean).join(", ");
          return { label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
        });
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        // aborted or network error
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <div className="location-input" ref={containerRef}>
      <input
        type="text"
        maxLength={120}
        placeholder="e.g. Soccer field or 123 Main St"
        value={value}
        autoComplete="off"
        onChange={(e) => {
          userTypedRef.current = true;
          onChange(e.target.value);
          if (!e.target.value) setSuggestions([]);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
      />
      {open && (
        <ul className="location-suggestions">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={(e) => {
                // preventDefault stops the input from blurring before we handle the click
                e.preventDefault();
                onSelect(s.label, s.lat, s.lng);
                setSuggestions([]);
                setOpen(false);
              }}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}