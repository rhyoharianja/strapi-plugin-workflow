import type { Core } from '@strapi/strapi';
import { canTransition, type ActingUser } from '../../../shared/workflow';

import {
  UID,
  publishEffectOf,
  type EntryStageDTO,
  type PublishEffect,
  type StageChangedPayload,
  type StageDTO,
  type WorkflowDTO,
} from '../../../shared/workflow';
import { documents } from '../utils/documents';
import { whileSelfDriven } from '../utils/selfDriven';

/** Raised when RBAC or the pipeline shape rejects a move; surfaced as HTTP 403. */
export class TransitionForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransitionForbiddenError';
  }
}

const transition = ({ strapi }: { strapi: Core.Strapi }) => {
  const workflows = () => strapi.plugin('content-hub-workflow').service('workflow');
  const events = () => strapi.plugin('content-hub-workflow').service('events');

  /** Admin roles are relations, so the acting user's role codes are loaded per request. */
  const toActingUser = async (userId: number): Promise<ActingUser> => {
    const user = await strapi.db
      .query('admin::user')
      .findOne({ where: { id: userId }, populate: ['roles'] });

    return {
      id: userId,
      roles: (user?.roles ?? []).map((role: { code: string }) => role.code),
    };
  };

  const findEntryStage = async (uid: string, documentId: string) =>
    documents(strapi, UID.entryStage).findFirst({
      filters: { uid, targetDocumentId: documentId },
      populate: { stage: { populate: ['allowedRoles'] }, workflow: true },
    });

  /** Whether the target content-type has a published state to drive at all. */
  const hasDraftAndPublish = (uid: string): boolean =>
    strapi.contentTypes[uid as keyof typeof strapi.contentTypes]?.options?.draftAndPublish ===
    true;

  /**
   * Apply a stage move to Strapi's Draft & Publish state.
   *
   * Done *before* the stage row is written, so a refused publish leaves the entry exactly
   * where it was. The other order would be worse in the one way this whole change exists to
   * prevent: a stage claiming an entry is live when it is not.
   *
   * Publishing is idempotent in the Document Service, so the recoverable failure — published
   * but not yet advanced — is fixed by simply moving again.
   */
  const applyPublishEffect = async (
    uid: string,
    documentId: string,
    effect: PublishEffect
  ): Promise<void> => {
    if (effect === 'none') return;

    if (!hasDraftAndPublish(uid)) {
      // A content-type without Draft & Publish has no published state to contradict.
      strapi.log.debug(
        `[content-hub-workflow] ${uid} has no Draft & Publish; skipping ${effect}`
      );
      return;
    }

    await whileSelfDriven(uid, documentId, async () => {
      if (effect === 'publish') {
        await documents(strapi, uid).publish({ documentId });
      } else {
        await documents(strapi, uid).unpublish({ documentId });
      }
    });
  };

  return {
    /**
     * Current stage of an entry plus the stages this user may move it to.
     *
     * An entry that has never moved sits in the first stage implicitly — no row is
     * written until something actually changes, so enabling a workflow does not have to
     * backfill every existing entry.
     */
    async describe(uid: string, documentId: string, userId: number): Promise<EntryStageDTO> {
      const workflow: WorkflowDTO | null = await workflows().findForContentType(uid);

      if (!workflow || workflow.stages.length === 0) {
        return { uid, documentId, workflow: null, currentStage: null, availableStages: [] };
      }

      const row = await findEntryStage(uid, documentId);
      const currentStage: StageDTO =
        (row?.stage &&
          workflow.stages.find((stage) => stage.documentId === row.stage.documentId)) ||
        workflow.stages[0]!;

      const user = await toActingUser(userId);

      return {
        uid,
        documentId,
        workflow: { id: workflow.id, documentId: workflow.documentId, name: workflow.name },
        currentStage,
        availableStages: workflow.stages.filter(
          (target) => target.id !== currentStage.id && canTransition(user, currentStage, target)
        ),
      };
    },

    /**
     * Move an entry to `targetStageDocumentId`.
     *
     * Validation, audit record and stage update happen in that order; the event fires
     * only after the move is durable, so subscribers never react to a rejected move.
     */
    async move(params: {
      uid: string;
      documentId: string;
      targetStageDocumentId: string;
      userId: number;
      note?: string;
    }): Promise<EntryStageDTO> {
      const { uid, documentId, targetStageDocumentId, userId, note } = params;

      const workflow: WorkflowDTO | null = await workflows().findForContentType(uid);

      if (!workflow) {
        throw new TransitionForbiddenError(`No enabled workflow governs ${uid}`);
      }

      const target = workflow.stages.find(
        (stage) => stage.documentId === targetStageDocumentId
      );

      if (!target) {
        throw new TransitionForbiddenError(
          `Stage ${targetStageDocumentId} does not belong to workflow "${workflow.name}"`
        );
      }

      const current = await this.describe(uid, documentId, userId);
      const from = current.currentStage;

      if (from?.id === target.id) {
        return current;
      }

      const user = await toActingUser(userId);

      if (!canTransition(user, from, target)) {
        throw new TransitionForbiddenError(
          `Role(s) [${user.roles.join(', ') || 'none'}] may not move this entry from "${
            from?.name ?? 'none'
          }" to "${target.name}"`
        );
      }

      /*
       * The bridge to Draft & Publish. Crossing into the publishing stage makes the entry
       * live and leaving it takes the entry down; every other move is editorial only.
       */
      await applyPublishEffect(uid, documentId, publishEffectOf(from, target));

      const at = new Date().toISOString();

      await documents(strapi, UID.transition).create({
        data: {
          uid,
          targetDocumentId: documentId,
          fromStage: from?.name ?? null,
          toStage: target.name,
          byUser: userId,
          at,
          note,
        },
      });

      const existing = await findEntryStage(uid, documentId);

      if (existing) {
        await documents(strapi, UID.entryStage).update({
          documentId: existing.documentId,
          data: { stage: target.documentId, workflow: workflow.documentId },
        });
      } else {
        await documents(strapi, UID.entryStage).create({
          data: {
            uid,
            targetDocumentId: documentId,
            stage: target.documentId,
            workflow: workflow.documentId,
          },
        });
      }

      const payload: StageChangedPayload = {
        uid,
        documentId,
        workflowId: workflow.id,
        fromStage: from?.name ?? null,
        toStage: target.name,
        byUser: userId,
        at,
        note,
      };

      await events().emit(payload);

      return this.describe(uid, documentId, userId);
    },

    /**
     * Current stage of an entry, or null when no enabled workflow governs it.
     *
     * A read-only lookup with no RBAC of its own, so other plugins can ask "where is this
     * entry?" without pretending to be a user. The publish gate in `register.ts` uses it to
     * decide whether a Draft & Publish change contradicts the pipeline.
     */
    async currentStageOf(uid: string, documentId: string): Promise<StageDTO | null> {
      const workflow: WorkflowDTO | null = await workflows().findForContentType(uid);

      if (!workflow || workflow.stages.length === 0) return null;

      const row = await findEntryStage(uid, documentId);

      // No row yet means the entry still sits implicitly in the first stage.
      if (!row?.stage) return workflow.stages[0]!;

      return (
        workflow.stages.find((candidate) => candidate.documentId === row.stage.documentId) ??
        null
      );
    },

    /**
     * Current stage *name* of an entry. The field-RBAC plugin uses it for the fact-field
     * lock, which is configured by stage name (`lockedFromStage`).
     */
    async currentStageName(uid: string, documentId: string): Promise<string | null> {
      const stage = await this.currentStageOf(uid, documentId);

      return stage?.name ?? null;
    },

    /** Audit trail for one entry, newest first. */
    async history(uid: string, documentId: string) {
      return documents(strapi, UID.transition).findMany({
        filters: { uid, targetDocumentId: documentId },
        populate: ['byUser'],
        sort: { at: 'desc' },
      });
    },
  };
};

export default transition;
