"use client";

// FX rates cached in localStorage, refreshed once per 24h. exchangerate.host
// is keyless + CORS-friendly. We only need a handful of currencies the
// scrapers actually surface plus TRY for the user.

import { useEffect, useState } from "react";

const CACHE_KEY = "fx:rates:v1";
const TTL_MS = 24 * 60 * 60 * 1000;
const SYMBOLS = "USD,EUR,GBP,TRY,CAD,AUD,CHF,JPY,SEK,NOK,DKK,PLN,INR,BRL";

// Fallback rates baked in for offline / API-down. Approximate, 2026-06.
const FALLBACK: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.78, TRY: 39.5, CAD: 1.37, AUD: 1.52,
  CHF: 0.88, JPY: 158, SEK: 10.6, NOK: 10.8, DKK: 6.85, PLN: 4.02,
  INR: 83.6, BRL: 5.4,
};

type RateCache = { ts: number; rates: Record<string, number> };

async function fetchRates(): Promise<Record<string, number>> {
  const r = await fetch(`https://api.exchangerate.host/latest?base=USD&symbols=${SYMBOLS}`);
  if (!r.ok) throw new Error(`fx ${r.status}`);
  const d = await r.json() as { rates?: Record<string, number> };
  if (!d.rates) throw new Error("no rates");
  return { USD: 1, ...d.rates };
}

let inFlight: Promise<Record<string, number>> | null = null;

export function useRates(): Record<string, number> {
  const [rates, setRates] = useState<Record<string, number>>(FALLBACK);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as RateCache;
          if (Date.now() - cached.ts < TTL_MS && cached.rates?.USD) {
            if (!cancelled) setRates(cached.rates);
            return;
          }
        }
      } catch { /* ignore */ }
      try {
        inFlight = inFlight ?? fetchRates();
        const fresh = await inFlight;
        if (cancelled) return;
        setRates(fresh);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rates: fresh })); } catch {}
      } catch { /* keep fallback */ }
      finally { inFlight = null; }
    })();
    return () => { cancelled = true; };
  }, []);
  return rates;
}

export function convert(amount: number, from: string, to: string, rates: Record<string, number>): number {
  const usd = amount / (rates[from] ?? 1);
  return usd * (rates[to] ?? 1);
}

export function formatMoney(amount: number, code: string): string {
  if (!Number.isFinite(amount) || amount <= 0) return "?";
  const n = amount >= 1000 ? Math.round(amount / 100) * 100 : Math.round(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${code} ${n.toLocaleString()}`;
  }
}
