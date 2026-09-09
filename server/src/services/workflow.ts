import type { Core } from '@strapi/strapi';

import {
  DEFAULT_STAGES,
  UID,
  type StageDTO,
  type WorkflowDTO,
} from '../../../shared/workflow';
import { documents, type DocumentRow } from '../utils/documents';

/** Shape of a stage row with its role relation populated. */
type RawStage = {
  id: number;
  documentId: string;
  name: string;
  color: string | null;
  order: number;
  allowedRoles?: Array<{ code: string }> | null;
  publishes?: boolean | null;
};

export const toStageDTO = (stage: RawStage): StageDTO => ({
  id: stage.id,
  documentId: stage.documentId,
  name: stage.name,
  color: stage.color ?? '#4945ff',
  order: stage.order,
  allowedRoles: (stage.allowedRoles ?? []).map((role) => role.code),
  // Rows written before the publish bridge existed have no value at all, not `false`.
  publishes: stage.publishes === true,
});

const byOrder = (a: StageDTO, b: StageDTO): number => a.order - b.order;

const workflow = ({ strapi }: { strapi: Core.Strapi }) => ({
  async findAll(): Promise<WorkflowDTO[]> {
    const rows = await documents(strapi, UID.workflow).findMany({
      populate: { stages: { populate: ['allowedRoles'] } },
    });

    return rows.map((row: DocumentRow) => ({
      id: row.id,
      documentId: row.documentId,
      name: row.name,
      enabled: row.enabled ?? false,
      contentTypes: Array.isArray(row.contentTypes) ? row.contentTypes : [],
      stages: (row.stages ?? []).map(toStageDTO).sort(byOrder),
    }));
  },

  /**
   * The enabled workflow governing `uid`, or null.
   *
   * A content-type may only be governed by one enabled workflow; the first match wins and
   * a duplicate is reported rather than silently applied.
   */
  async findForContentType(uid: string): Promise<WorkflowDTO | null> {
    const all = await this.findAll();
    const matches = all.filter(
      (item) => item.enabled && item.contentTypes.includes(uid)
    );

    if (matches.length > 1) {
      strapi.log.warn(
        `[content-hub-workflow] ${uid} is claimed by ${matches.length} enabled workflows; using "${matches[0]!.name}"`
      );
    }

    return matches[0] ?? null;
  },

  /**
   * The workflow a stage belongs to, by document id.
   *
   * Needed because a stage is edited by its own id while `publishes` is a property of the
   * *pipeline* — only one stage in it may publish.
   */
  async workflowOfStage(stageDocumentId: string): Promise<string | null> {
    const all = await this.findAll();
    const owner = all.find((item) =>
      item.stages.some((stage) => stage.documentId === stageDocumentId)
    );

    return owner?.documentId ?? null;
  },

  /**
   * Clear `publishes` from every stage of a workflow, optionally sparing one.
   *
   * Called before a stage is marked as publishing, so the pipeline is never left with two
   * stages both claiming to make an entry live — the publish gate would then have no single
   * answer to "is this entry meant to be published?".
   */
  async clearPublishStage(
    workflowDocumentId: string,
    exceptStageDocumentId?: string
  ): Promise<void> {
    const all = await this.findAll();
    const target = all.find((item) => item.documentId === workflowDocumentId);

    if (!target) return;

    for (const stage of target.stages) {
      if (!stage.publishes || stage.documentId === exceptStageDocumentId) continue;

      await documents(strapi, UID.stage).update({
        documentId: stage.documentId,
        data: { publishes: false },
      });
    }
  },

  /** Content-type UIDs a workflow may be bound to: API collections and single types. */
  listGovernableContentTypes(): Array<{ uid: string; displayName: string }> {
    return Object.values(strapi.contentTypes)
      .filter((contentType) => contentType.uid.startsWith('api::'))
      .map((contentType) => ({
        uid: contentType.uid,
        displayName: contentType.info?.displayName ?? contentType.uid,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  /** Create a workflow together with the default pipeline, in one call from the GUI. */
  async createWithDefaultStages(data: {
    name: string;
    enabled?: boolean;
    contentTypes?: string[];
  }): Promise<WorkflowDTO> {
    const created = await documents(strapi, UID.workflow).create({
      data: {
        name: data.name,
        enabled: data.enabled ?? true,
        contentTypes: data.contentTypes ?? [],
      },
    });

    for (const stage of DEFAULT_STAGES) {
      await documents(strapi, UID.stage).create({
        data: { ...stage, workflow: created.documentId },
      });
    }

    const withStages = (await this.findAll()).find(
      (item) => item.documentId === created.documentId
    );

    return withStages!;
  },
});

export default workflow;
