import type { Core } from '@strapi/strapi';

import { STAGE_CHANGED_EVENT } from '../../shared/workflow';

const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  // Log every transition. The flow engine subscribes to the same hub to run
  // automations, which is why the emitter is a service rather than a local callback.
  strapi
    .plugin('workflow')
    .service('events')
    .on((payload) => {
      strapi.log.info(
        `[${STAGE_CHANGED_EVENT}] ${payload.uid}/${payload.documentId}: ` +
          `${payload.fromStage ?? '—'} → ${payload.toStage} (user ${payload.byUser})`
      );
    });
};

export default bootstrap;
