"use client";

// Local-first sketch storage. Excalidraw scenes can be MBs each, so we
// keep them in the browser's IndexedDB instead of paying for Convex DB
// quota. On first read we seed from any legacy Convex copy so users
// don't lose work. Writes go to IndexedDB only.

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type SketchRow = { slug: string; data_json: string; updated_at: number };

const DB_NAME = "iwantajob";
const DB_VERSION = 1;
const STORE = "sketches";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "slug" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    Promise.resolve(fn(store)).then((value) => {
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }, reject);
  });
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readLocal(slug: string): Promise<SketchRow | null> {
  if (typeof indexedDB === "undefined") return null;
  return tx("readonly", (store) => reqAsPromise(store.get(slug) as IDBRequest<SketchRow | undefined>))
    .then((r) => r ?? null)
    .catch(() => null);
}

async function listLocal(): Promise<SketchRow[]> {
  if (typeof indexedDB === "undefined") return [];
  return tx("readonly", (store) => reqAsPromise(store.getAll() as IDBRequest<SketchRow[]>))
    .then((rows) => rows.sort((a, b) => b.updated_at - a.updated_at))
    .catch(() => []);
}

async function writeLocal(row: SketchRow): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await tx("readwrite", (store) => reqAsPromise(store.put(row)));
}

async function removeLocal(slug: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await tx("readwrite", (store) => reqAsPromise(store.delete(slug)));
}

// Track which legacy slugs we've already pulled down from Convex so we
// don't keep doing it across re-renders within a session.
const seededSlugs = new Set<string>();
const seededAll = { done: false };

export function useSketch(slug: string): {
  data_json: string;
  updated_at: number;
} | null | undefined {
  const [local, setLocal] = useState<SketchRow | null | undefined>(undefined);
  // One-shot legacy fetch: only fires until we've confirmed local has it.
  const legacy = useQuery(
    api.sketches.get,
    local === null && !seededSlugs.has(slug) ? { slug } : "skip",
  );

  useEffect(() => {
    let cancelled = false;
    readLocal(slug).then((r) => {
      if (!cancelled) setLocal(r);
    });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (local !== null || seededSlugs.has(slug)) return;
    if (legacy === undefined) return; // still loading
    seededSlugs.add(slug);
    if (legacy) {
      const row: SketchRow = { slug, data_json: legacy.data_json, updated_at: legacy.updated_at };
      writeLocal(row).then(() => setLocal(row));
    }
  }, [legacy, local, slug]);

  return local === undefined ? undefined : local;
}

export function useSketchList(): SketchRow[] | undefined {
  const [rows, setRows] = useState<SketchRow[] | undefined>(undefined);
  const legacy = useQuery(api.sketches.list, !seededAll.done ? {} : "skip");

  const refresh = useCallback(() => {
    listLocal().then(setRows);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (seededAll.done || !legacy) return;
    seededAll.done = true;
    if (!Array.isArray(legacy) || legacy.length === 0) return;
    Promise.all(
      legacy.map(async (r) => {
        const existing = await readLocal(r.slug);
        if (existing && existing.updated_at >= r.updated_at) return;
        await writeLocal({ slug: r.slug, data_json: r.data_json, updated_at: r.updated_at });
      }),
    ).then(refresh);
  }, [legacy, refresh]);

  return rows;
}

export function useSketchSave(): (args: { slug: string; data: string }) => Promise<{ ok: true; bytes: number }> {
  return useCallback(async ({ slug, data }) => {
    await writeLocal({ slug, data_json: data, updated_at: Date.now() });
    return { ok: true, bytes: data.length };
  }, []);
}

export function useSketchRemove(): (args: { slug: string }) => Promise<{ ok: true }> {
  // Mirror the delete to Convex too so freed bytes count toward the
  // server-side quota. Server delete is best-effort.
  const cloudRemove = useMutation(api.sketches.remove);
  return useCallback(async ({ slug }) => {
    await removeLocal(slug);
    try { await cloudRemove({ slug }); } catch { /* ignore */ }
    return { ok: true };
  }, [cloudRemove]);
}
