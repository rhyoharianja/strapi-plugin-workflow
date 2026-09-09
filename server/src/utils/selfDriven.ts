/**
 * Marks the Draft & Publish calls this plugin makes itself.
 *
 * The gate in `register.ts` refuses a publish or unpublish that would contradict an entry's
 * stage. A stage move *causes* exactly such a call — the whole point of the publishing stage
 * — so without a way to tell the two apart the plugin would block itself and no entry could
 * ever go live.
 *
 * A module-level set rather than a flag: two entries can be moving at once, and a shared
 * boolean would open the gate for both. The key is per document, and `while` releases it in
 * a `finally` so a failed publish cannot leave the gate propped open.
 */
const inFlight = new Set<string>();

const keyOf = (uid: string, documentId: string): string => `${uid}:${documentId}`;

/** Run `action` with the gate opened for this one document. */
export const whileSelfDriven = async <T>(
  uid: string,
  documentId: string,
  action: () => Promise<T>
): Promise<T> => {
  const key = keyOf(uid, documentId);

  inFlight.add(key);

  try {
    return await action();
  } finally {
    inFlight.delete(key);
  }
};

/** Whether the current Draft & Publish call was made by this plugin. */
export const isSelfDriven = (uid: string, documentId: string): boolean =>
  inFlight.has(keyOf(uid, documentId));
