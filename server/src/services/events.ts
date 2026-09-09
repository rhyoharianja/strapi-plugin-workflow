import type { Core } from '@strapi/strapi';

import { STAGE_CHANGED_EVENT, type StageChangedPayload } from '../../../shared/workflow';

type Listener = (payload: StageChangedPayload) => void | Promise<void>;

/**
 * Minimal in-process event hub.
 *
 * Other Content Hub plugins (the flow engine in Tahap 5) subscribe here to react to
 * stage changes without depending on this plugin's internals:
 *
 *   strapi.plugin('content-hub-workflow').service('events').on(handler);
 *
 * Listener failures are logged and swallowed — an automation that throws must never roll
 * back an editorial transition that already happened.
 */
const events = ({ strapi }: { strapi: Core.Strapi }) => {
  const listeners = new Set<Listener>();

  return {
    on(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async emit(payload: StageChangedPayload): Promise<void> {
      // Strapi's own webhook/event bus, so external subscribers see it too.
      strapi.eventHub?.emit(STAGE_CHANGED_EVENT, payload);

      for (const listener of listeners) {
        try {
          await listener(payload);
        } catch (error) {
          strapi.log.error(
            `[${STAGE_CHANGED_EVENT}] listener failed: ${(error as Error).message}`
          );
        }
      }
    },

    get listenerCount(): number {
      return listeners.size;
    },
  };
};

export default events;
