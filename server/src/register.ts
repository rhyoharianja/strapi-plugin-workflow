import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

import {
  PLUGIN_ID,
  mayActDirectly,
  type DocumentAction,
  type StageDTO,
} from '../../shared/workflow';
import { isSelfDriven } from './utils/selfDriven';

/** Document-service actions that change whether an entry is live. */
const GATED_ACTIONS: Record<string, DocumentAction> = {
  publish: 'publish',
  unpublish: 'unpublish',
};

/**
 * Refuse a Draft & Publish change that would contradict an entry's workflow stage.
 *
 * **Why this exists.** The stage panel and Strapi's own status badge sit in the same column
 * of the edit view, and until now nothing connected them: an entry could be published while
 * its stage said it was still being written, skipping the review pipeline entirely, and a
 * stage could claim an entry was live while `publishedAt` was null. Renaming the stages stops
 * the two badges reading the same word; only a gate stops them disagreeing.
 *
 * **Where the authority lives.** Here, in the document service — not in the admin. Hiding the
 * Publish button is a courtesy to the editor; the middleware is what makes the rule true for
 * the REST API, the GraphQL layer and any script. The admin change is in `admin/src/index.ts`.
 *
 * A middleware rather than a lifecycle hook because it must run for *every* content-type,
 * including ones that did not exist when the server booted \u2014 which content-types are governed
 * is data.
 */
const register = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.documents.use(async (context, next) => {
    const action = GATED_ACTIONS[context.action];

    // Not a publish/unpublish, or one of this plugin's own tables.
    if (!action || context.uid.startsWith(`plugin::${PLUGIN_ID}`)) {
      return next();
    }

    const documentId = (context.params as { documentId?: string } | undefined)?.documentId;

    if (!documentId) return next();

    // A stage move drives publishing itself; blocking it would block every transition.
    if (isSelfDriven(context.uid, documentId)) return next();

    const current: StageDTO | null = await strapi
      .plugin(PLUGIN_ID)
      .service('transition')
      .currentStageOf(context.uid, documentId);

    if (mayActDirectly(current, action)) return next();

    const message =
      action === 'publish'
        ? `This entry is at the "${current?.name}" stage. Move it to the stage that publishes instead of publishing directly.`
        : `This entry is live because it sits at the "${current?.name}" stage. Move it out of that stage to take it down.`;

    /*
     * `PolicyError`, not `ForbiddenError` — and this is not a style choice.
     *
     * Strapi's `createAuthorizeMiddleware` wraps every downstream handler and catches any
     * `ForbiddenError` on its way out, replacing it with a bare `ctx.forbidden()`. The message
     * is discarded, so the editor gets `403 "Forbidden"` and no idea what to do. Its own
     * comment names the single exception:
     *
     *     // allow PolicyError as an exception to throw a publicly visible message in the API
     *
     * `PolicyError` extends `ForbiddenError`, so the status is still 403 — the message
     * survives. Verified: the same refusal returned "Forbidden" as a `ForbiddenError` and the
     * text below as a `PolicyError`.
     */
    throw new errors.PolicyError(message, { plugin: PLUGIN_ID, reason: message });
  });
};

export default register;
