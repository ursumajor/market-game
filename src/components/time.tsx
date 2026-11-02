"use client";

import { useSyncExternalStore } from "react";

// Both render only in the browser: the server can't read the clock during a
// render (Cache Components), and the viewer's timezone is only known here. The
// server snapshot is null, so server and first client render match ("…").

function subscribeToClock(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
// Whole seconds, so the snapshot is stable between ticks.
const nowInSeconds = () => Math.floor(Date.now() / 1000);
const useNowSeconds = () => useSyncExternalStore(subscribeToClock, nowInSeconds, () => null);

const noSubscription = () => () => {};
const useIsBrowser = () => useSyncExternalStore(noSubscription, () => true, () => false);

function formatLeft(seconds: number) {
  const s = Math.max(0, seconds);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** "3h 12m left", ticking; `done` once the time has passed. */
export function Countdown({ to, done = "closed" }: { to: number; done?: string }) {
  const now = useNowSeconds();
  if (now === null) return <span className="tabular-nums">…</span>;
  const left = Math.ceil(to / 1000) - now;
  return <span className="tabular-nums">{left <= 0 ? done : `${formatLeft(left)} left`}</span>;
}

/** A timestamp in the viewer's timezone, e.g. "Nov 3, 4:30 PM". */
export function LocalTime({ at }: { at: number }) {
  const isBrowser = useIsBrowser();
  if (!isBrowser) return <span>…</span>;
  return <span>{new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>;
}
