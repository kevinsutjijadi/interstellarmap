"use client";

import { useEffect, useState } from "react";

/** HYG parsecs → light-years */
export const PC_TO_LY = 3.262;

export type StarData = {
  count: number;
  /** Interleaved Three.js positions (x, y, z) = (hyg.x, hyg.z, hyg.y) in ly */
  positions: Float32Array;
  /** Per-star magnitude for sizing */
  mag: Float32Array;
  /** Per-star linear RGB from HYG `spect` (3 floats per star) for instanced coloring */
  spectralRgb: Float32Array;
  /** HYG `proper` name per star (may be empty) */
  proper: string[];
  /** HYG `bf` (Bayer–Flamsteed) per star (may be empty) */
  bf: string[];
  /** HYG `con` (constellation abbreviation, e.g. Ori) per star (may be empty) */
  con: string[];
  /** Max horizontal radius in ly (XZ plane) for grid extent */
  maxRadius: number;
  /** Max |y| (HYG height) in ly */
  maxAbsY: number;
};

/** Display label: proper if non-empty, else bf */
export function starDisplayName(proper: string, bf: string): string {
  const p = proper.trim();
  if (p) return p;
  const b = bf.trim();
  if (b) return b;
  return "Unnamed star";
}

/** Approximate tint from Morgan–Keenan letter (HYG `spect`), linear RGB for three.js */
function spectralTypeToLinearRgb(spect: string, out: { r: number; g: number; b: number }) {
  const raw = spect.trim();
  if (!raw) {
    out.r = 0.91;
    out.g = 0.894;
    out.b = 0.863;
    return;
  }
  const seg = raw.split("/")[0]!.trim();
  const u = seg.toUpperCase();
  if (u.startsWith("D")) {
    out.r = 0.9;
    out.g = 0.92;
    out.b = 1.0;
    return;
  }
  const main = "OBAFGKMLTYW";
  let letter = "";
  for (let i = 0; i < u.length; i++) {
    const c = u[i]!;
    if (main.includes(c)) {
      letter = c;
      break;
    }
    if (c === "C") {
      letter = "C";
      break;
    }
  }
  switch (letter) {
    case "O":
      out.r = 0.55;
      out.g = 0.69;
      out.b = 1.0;
      break;
    case "B":
      out.r = 0.67;
      out.g = 0.75;
      out.b = 1.0;
      break;
    case "A":
      out.r = 0.79;
      out.g = 0.84;
      out.b = 1.0;
      break;
    case "F":
      out.r = 0.97;
      out.g = 0.97;
      out.b = 1.0;
      break;
    case "G":
      out.r = 1.0;
      out.g = 0.96;
      out.b = 0.92;
      break;
    case "K":
      out.r = 1.0;
      out.g = 0.82;
      out.b = 0.63;
      break;
    case "M":
      out.r = 1.0;
      out.g = 0.65;
      out.b = 0.45;
      break;
    case "L":
      out.r = 0.85;
      out.g = 0.35;
      out.b = 0.2;
      break;
    case "T":
      out.r = 0.65;
      out.g = 0.25;
      out.b = 0.15;
      break;
    case "Y":
      out.r = 0.5;
      out.g = 0.2;
      out.b = 0.15;
      break;
    case "W":
      out.r = 0.75;
      out.g = 0.9;
      out.b = 1.0;
      break;
    case "C":
      out.r = 1.0;
      out.g = 0.5;
      out.b = 0.35;
      break;
    default:
      out.r = 0.91;
      out.g = 0.894;
      out.b = 0.863;
  }
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function parseHYGCSV(text: string): StarData {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return {
      count: 0,
      positions: new Float32Array(),
      mag: new Float32Array(),
      spectralRgb: new Float32Array(),
      proper: [],
      bf: [],
      con: [],
      maxRadius: 100,
      maxAbsY: 100,
    };
  }

  const header = parseCSVLine(lines[0]!);
  const idx = (name: string) => header.indexOf(name);
  const ix = idx("x");
  const iy = idx("y");
  const iz = idx("z");
  const idist = idx("dist");
  const imag = idx("mag");
  const ispect = idx("spect");
  const iproper = idx("proper");
  const ibf = idx("bf");
  const icon = idx("con");
  if (ix < 0 || iy < 0 || iz < 0 || idist < 0 || imag < 0) {
    throw new Error("HYG CSV missing required columns (x,y,z,dist,mag)");
  }

  const rows: {
    px: number;
    py: number;
    pz: number;
    mag: number;
    spect: string;
    proper: string;
    bf: string;
    con: string;
  }[] = [];
  const rgbScratch = { r: 0, g: 0, b: 0 };
  let maxRadius = 0;
  let maxAbsY = 0;

  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line?.trim()) continue;
    const cols = parseCSVLine(line);
    const dist = parseFloat(cols[idist] ?? "");
    if (!Number.isFinite(dist) || dist >= 100_000) continue;

    const x = parseFloat(cols[ix] ?? "");
    const y = parseFloat(cols[iy] ?? "");
    const z = parseFloat(cols[iz] ?? "");
    const mag = parseFloat(cols[imag] ?? "99");
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

    const xl = x * PC_TO_LY;
    const yl = y * PC_TO_LY;
    const zl = z * PC_TO_LY;
    // Three.js Y-up: equatorial plane XZ matches HYG drop to z_hyg=0 → three y=0
    const px = xl;
    const py = zl;
    const pz = yl;
    const spect = ispect >= 0 ? (cols[ispect] ?? "").trim() : "";
    const proper = iproper >= 0 ? (cols[iproper] ?? "").trim() : "";
    const bf = ibf >= 0 ? (cols[ibf] ?? "").trim() : "";
    const con = icon >= 0 ? (cols[icon] ?? "").trim() : "";
    rows.push({ px, py, pz, mag: Number.isFinite(mag) ? mag : 99, spect, proper, bf, con });
    const r = Math.hypot(px, pz);
    if (r > maxRadius) maxRadius = r;
    if (Math.abs(py) > maxAbsY) maxAbsY = Math.abs(py);
  }

  const count = rows.length;
  const positions = new Float32Array(count * 3);
  const magArr = new Float32Array(count);
  const spectralRgb = new Float32Array(count * 3);
  const properArr: string[] = new Array(count);
  const bfArr: string[] = new Array(count);
  const conArr: string[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const r = rows[i]!;
    positions[i * 3] = r.px;
    positions[i * 3 + 1] = r.py;
    positions[i * 3 + 2] = r.pz;
    magArr[i] = r.mag;
    properArr[i] = r.proper;
    bfArr[i] = r.bf;
    conArr[i] = r.con;
    spectralTypeToLinearRgb(r.spect, rgbScratch);
    spectralRgb[i * 3] = rgbScratch.r;
    spectralRgb[i * 3 + 1] = rgbScratch.g;
    spectralRgb[i * 3 + 2] = rgbScratch.b;
  }

  return {
    count,
    positions,
    mag: magArr,
    spectralRgb,
    proper: properArr,
    bf: bfArr,
    con: conArr,
    maxRadius: Math.max(maxRadius, 50),
    maxAbsY: Math.max(maxAbsY, 50),
  };
}

export function useStarData(): {
  data: StarData | null;
  loading: boolean;
  error: Error | null;
} {
  const [data, setData] = useState<StarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/hyg_v42_filtered.csv");
        if (!res.ok) throw new Error(`Failed to load star data: ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        setData(parseHYGCSV(text));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
