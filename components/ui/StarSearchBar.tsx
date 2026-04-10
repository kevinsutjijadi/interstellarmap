"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { StarPickInfo } from "@/components/canvas/InterstellarScene";
import type { StarData } from "@/components/canvas/useStarData";
import { starDisplayName } from "@/components/canvas/useStarData";

const MAX_SUGGESTIONS = 48;

type Hit = {
  index: number;
  mag: number;
  label: string;
  con: string;
};

function toPickInfo(data: StarData, index: number): StarPickInfo {
  const i = index * 3;
  const x = data.positions[i] ?? 0;
  const y = data.positions[i + 1] ?? 0;
  const z = data.positions[i + 2] ?? 0;
  return {
    index,
    name: starDisplayName(data.proper[index] ?? "", data.bf[index] ?? ""),
    distanceLy: Math.hypot(x, y, z),
  };
}

function filterStars(data: StarData, rawQuery: string): Hit[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const hits: Hit[] = [];
  for (let i = 0; i < data.count; i++) {
    const proper = data.proper[i] ?? "";
    const bf = data.bf[i] ?? "";
    const con = data.con[i] ?? "";
    const pl = proper.toLowerCase();
    const bl = bf.toLowerCase();
    const cl = con.toLowerCase();
    if (!pl.includes(q) && !bl.includes(q) && !cl.includes(q)) continue;
    hits.push({
      index: i,
      mag: data.mag[i] ?? 99,
      label: starDisplayName(proper, bf),
      con,
    });
  }

  hits.sort((a, b) => a.mag - b.mag || a.label.localeCompare(b.label));
  return hits.slice(0, MAX_SUGGESTIONS);
}

type Props = {
  data: StarData;
  onSelectStar: (info: StarPickInfo) => void;
};

export function StarSearchBar({ data, onSelectStar }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const hits = useMemo(() => filterStars(data, query), [data, query]);
  const showList = open && query.trim().length > 0;

  useLayoutEffect(() => {
    if (activeIdx >= hits.length) setActiveIdx(Math.max(0, hits.length - 1));
  }, [hits.length, activeIdx]);

  useEffect(() => {
    if (!showList) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [showList]);

  const pick = useCallback(
    (index: number) => {
      onSelectStar(toPickInfo(data, index));
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
    },
    [data, onSelectStar],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!showList) {
        if (e.key === "ArrowDown" && query.trim()) {
          setOpen(true);
          setActiveIdx(0);
          e.preventDefault();
        }
        return;
      }

      if (e.key === "Escape") {
        setOpen(false);
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (hits.length === 0) return;
        setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (hits.length === 0) return;
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const h = hits[activeIdx];
        if (h) pick(h.index);
      }
    },
    [showList, query, hits, activeIdx, pick],
  );

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute top-4 left-1/2 z-30 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2"
    >
      <label htmlFor={listId} className="sr-only">
        Search stars by name or constellation
      </label>
      <input
        ref={inputRef}
        id={listId}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? `${listId}-listbox` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search star (name, Bayer–Flamsteed, constellation)…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => query.trim() && setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-zinc-600/80 bg-zinc-950/95 px-3 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur-sm outline-none placeholder:text-zinc-500 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-500"
      />
      {showList && (
        <ul
          id={`${listId}-listbox`}
          role="listbox"
          className="mt-1 max-h-[min(18rem,50vh)] overflow-auto rounded-lg border border-zinc-600/80 bg-zinc-950/98 py-1 shadow-xl backdrop-blur-sm"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-xs text-zinc-500">No matching stars</li>
          ) : (
            hits.map((h, i) => (
              <li key={h.index} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={i === activeIdx}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    i === activeIdx ? "bg-zinc-800 text-zinc-50" : "text-zinc-200 hover:bg-zinc-800/70"
                  }`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(h.index)}
                >
                  <span className="min-w-0 truncate font-medium">{h.label}</span>
                  {h.con ? (
                    <span className="shrink-0 tabular-nums text-zinc-500">{h.con}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
