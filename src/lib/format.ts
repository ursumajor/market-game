/** Signed points to one decimal, e.g. "+133.3", "−50.0", "0.0". */
export function fmtPoints(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return "0.0";
  return (rounded > 0 ? "+" : "−") + Math.abs(rounded).toFixed(1);
}

export function fmtNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Lenient number parsing for form input: allows "1,234", spaces and "1e6". Returns NaN for blanks. */
export function parseNumber(input: unknown): number {
  const s = String(input ?? "").replace(/[,\s_]/g, "");
  return s === "" ? NaN : Number(s);
}

export function pointsClass(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded > 0 ? "text-gain" : rounded < 0 ? "text-loss" : "text-muted";
}
