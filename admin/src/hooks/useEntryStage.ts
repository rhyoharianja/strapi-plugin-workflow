import * as React from "react";

import type { EntryStageDTO } from "../../../shared/workflow";
import { api } from "../api/client";

/**
 * Where one entry sits in its pipeline, shared by everything on the edit view that needs it.
 *
 * **Why a store and not just `useState` in each consumer.** Two unrelated places need this
 * answer: the stage panel in the right-hand column, and the wrapper around Strapi's Publish
 * button. They are rendered by the Content Manager in different parts of its tree with no
 * ancestor of ours between them, so there is no provider to share — and without sharing, each
 * would fetch the same thing on every edit view, and a stage move in the panel would leave the
 * Publish button still believing the old stage.
 *
 * Keyed by entry, so opening a different entry cannot show a stale pipeline.
 */

interface Entry {
  state: EntryStageDTO | null;
  error: string | null;
  loading: boolean;
}

const EMPTY: Entry = { state: null, error: null, loading: true };

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const inFlight = new Set<string>();

const keyOf = (uid: string, documentId: string): string => `${uid}:${documentId}`;

const notify = (key: string): void => {
  for (const listener of listeners.get(key) ?? []) listener();
};

const write = (key: string, entry: Entry): void => {
  cache.set(key, entry);
  notify(key);
};

/** Fetch once per entry, however many consumers ask. */
const load = async (uid: string, documentId: string): Promise<void> => {
  const key = keyOf(uid, documentId);

  if (inFlight.has(key)) return;

  inFlight.add(key);

  try {
    const state = await api.describeEntry(uid, documentId);
    write(key, { state, error: null, loading: false });
  } catch (error) {
    write(key, { state: null, error: (error as Error).message, loading: false });
  } finally {
    inFlight.delete(key);
  }
};

/**
 * Re-read an entry after something changed it.
 *
 * A stage move changes what the Publish button is allowed to do, so the panel calling this
 * is what keeps the button honest without either component knowing about the other.
 */
export const refreshEntryStage = async (uid: string, documentId: string): Promise<void> => {
  inFlight.delete(keyOf(uid, documentId));
  await load(uid, documentId);
};

export const useEntryStage = (uid: string, documentId: string): Entry => {
  const key = keyOf(uid, documentId);
  const enabled = Boolean(uid && documentId);

  const subscribe = React.useCallback(
    (listener: () => void) => {
      if (!enabled) return () => {};

      const set = listeners.get(key) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(key, set);

      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(key);
      };
    },
    [key, enabled]
  );

  // A cached snapshot per key: a fresh object per call makes React re-render in a loop.
  const snapshot = React.useCallback(() => cache.get(key) ?? EMPTY, [key]);

  const entry = React.useSyncExternalStore(subscribe, snapshot);

  React.useEffect(() => {
    if (!enabled || cache.has(key)) return;

    void load(uid, documentId);
  }, [enabled, key, uid, documentId]);

  return enabled ? entry : { state: null, error: null, loading: false };
};
