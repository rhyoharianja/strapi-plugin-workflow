import type { Core } from '@strapi/strapi';

import { TransitionForbiddenError } from '../services/transition';

/** Edit-view endpoints: what stage is this entry in, and where may I move it? */
const controller = ({ strapi }: { strapi: Core.Strapi }) => {
  const service = () => strapi.plugin('workflow').service('transition');

  return {
    async describe(ctx): Promise<void> {
      const { uid, documentId } = ctx.params;
      ctx.body = { data: await service().describe(uid, documentId, ctx.state.user.id) };
    },

    async move(ctx): Promise<void> {
      const { uid, documentId } = ctx.params;
      const { stage, note } = ctx.request.body ?? {};

      if (typeof stage !== 'string' || !stage) {
        return ctx.badRequest('stage (documentId) is required');
      }

      try {
        ctx.body = {
          data: await service().move({
            uid,
            documentId,
            targetStageDocumentId: stage,
            userId: ctx.state.user.id,
            note,
          }),
        };
      } catch (error) {
        if (error instanceof TransitionForbiddenError) {
          return ctx.forbidden(error.message);
        }
        throw error;
      }
    },

    async history(ctx): Promise<void> {
      const { uid, documentId } = ctx.params;
      ctx.body = { data: await service().history(uid, documentId) };
    },
  };
};

export default controller;
