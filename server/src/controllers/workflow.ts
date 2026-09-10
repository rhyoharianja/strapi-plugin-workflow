import type { Core } from '@strapi/strapi';

import { UID, isReservedStageName } from '../../../shared/workflow';
import { documents } from '../utils/documents';

/**
 * CRUD for workflows and stages, driving the Settings page.
 *
 * Stages are edited here rather than only in the Content Manager so a whole pipeline can
 * be built on one screen — adding a stage never requires a deploy.
 */
const controller = ({ strapi }: { strapi: Core.Strapi }) => {
  const service = () => strapi.plugin('workflow').service('workflow');

  return {
    async find(ctx): Promise<void> {
      ctx.body = { data: await service().findAll() };
    },

    /** Content-types a workflow can be bound to, for the Settings page picker. */
    async contentTypes(ctx): Promise<void> {
      ctx.body = { data: service().listGovernableContentTypes() };
    },

    async create(ctx): Promise<void> {
      const { name, enabled, contentTypes } = ctx.request.body ?? {};

      if (typeof name !== 'string' || !name.trim()) {
        return ctx.badRequest('name is required');
      }

      ctx.body = {
        data: await service().createWithDefaultStages({
          name: name.trim(),
          enabled,
          contentTypes: Array.isArray(contentTypes) ? contentTypes : [],
        }),
      };
    },

    async update(ctx): Promise<void> {
      const { documentId } = ctx.params;
      const { name, enabled, contentTypes } = ctx.request.body ?? {};

      await documents(strapi, UID.workflow).update({
        documentId,
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(enabled !== undefined ? { enabled } : {}),
          ...(Array.isArray(contentTypes) ? { contentTypes } : {}),
        },
      });

      ctx.body = {
        data: (await service().findAll()).find(
          (item: { documentId: string }) => item.documentId === documentId
        ),
      };
    },

    async delete(ctx): Promise<void> {
      await documents(strapi, UID.workflow).delete({ documentId: ctx.params.documentId });
      ctx.body = { data: { documentId: ctx.params.documentId } };
    },

    async createStage(ctx): Promise<void> {
      const { documentId } = ctx.params;
      const { name, color, order, allowedRoles, publishes } = ctx.request.body ?? {};

      if (typeof name !== 'string' || !name.trim()) {
        return ctx.badRequest('name is required');
      }

      if (isReservedStageName(name)) {
        return ctx.badRequest(
          `"${name.trim()}" is a Draft & Publish state, not an editorial stage. ` +
            'Pick a name that describes the editorial step, and mark the stage as publishing ' +
            'if reaching it should make the entry live.'
        );
      }

      if (publishes === true) {
        await service().clearPublishStage(documentId);
      }

      await documents(strapi, UID.stage).create({
        data: {
          name: name.trim(),
          color,
          order: Number.isInteger(order) ? order : 0,
          allowedRoles: Array.isArray(allowedRoles) ? allowedRoles : [],
          publishes: publishes === true,
          workflow: documentId,
        },
      });

      ctx.body = {
        data: (await service().findAll()).find(
          (item: { documentId: string }) => item.documentId === documentId
        ),
      };
    },

    async updateStage(ctx): Promise<void> {
      const { stageDocumentId } = ctx.params;
      const { name, color, order, allowedRoles, publishes } = ctx.request.body ?? {};

      if (typeof name === 'string' && isReservedStageName(name)) {
        return ctx.badRequest(
          `"${name.trim()}" is a Draft & Publish state, not an editorial stage.`
        );
      }

      /*
       * Only one stage may publish. Clearing the flag elsewhere first means the pipeline is
       * never briefly in a state where two stages both claim to make an entry live — which
       * the publish gate would have no single answer for.
       */
      if (publishes === true) {
        const owner = await service().workflowOfStage(stageDocumentId);

        if (owner) await service().clearPublishStage(owner, stageDocumentId);
      }

      await documents(strapi, UID.stage).update({
        documentId: stageDocumentId,
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(order !== undefined ? { order } : {}),
          ...(Array.isArray(allowedRoles) ? { allowedRoles } : {}),
          ...(publishes !== undefined ? { publishes: publishes === true } : {}),
        },
      });

      ctx.body = { data: await service().findAll() };
    },

    async deleteStage(ctx): Promise<void> {
      await documents(strapi, UID.stage).delete({ documentId: ctx.params.stageDocumentId });
      ctx.body = { data: await service().findAll() };
    },

    /** Admin roles, so the Settings page can offer a role picker per stage. */
    async roles(ctx): Promise<void> {
      const roles = await strapi.db.query('admin::role').findMany();
      ctx.body = {
        data: roles.map((role: { id: number; code: string; name: string }) => ({
          id: role.id,
          code: role.code,
          name: role.name,
        })),
      };
    },
  };
};

export default controller;
