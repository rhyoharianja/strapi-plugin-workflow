import { getFetchClient, isFetchError } from "@strapi/strapi/admin";

import type { EntryStageDTO, WorkflowDTO } from "../../../shared/workflow";
import { PLUGIN_ID } from "../pluginId";

export interface RoleOption {
  id: number;
  code: string;
  name: string;
}

export interface ContentTypeOption {
  uid: string;
  displayName: string;
}

export interface TransitionRecord {
  id: number;
  fromStage: string | null;
  toStage: string;
  at: string;
  note?: string;
  byUser?: { firstname?: string; lastname?: string; email?: string } | null;
}

/**
 * Strapi's own fetch client.
 *
 * Reading the admin JWT out of storage by hand does not work: Strapi 5 keeps the access
 * token in memory behind an httpOnly refresh cookie, so `localStorage.getItem('jwtToken')`
 * is empty and every call comes back "Missing or invalid credentials". `getFetchClient`
 * attaches the current token and transparently refreshes an expired one.
 */
const client = () => getFetchClient();

/**
 * Surface the server's message.
 *
 * It matters here more than anywhere: a rejected transition explains *why* the role was
 * not allowed, and a bare 403 would throw that away.
 */
const message = (error: unknown): string => {
  if (isFetchError(error)) {
    const payload = error.response?.data as { error?: { message?: string } } | undefined;
    return payload?.error?.message ?? error.message;
  }
  return (error as Error).message;
};

const unwrap = async <T>(request: Promise<{ data: { data?: T } }>): Promise<T> => {
  try {
    const { data } = await request;
    return data.data as T;
  } catch (error) {
    throw new Error(message(error));
  }
};

const base = `/${PLUGIN_ID}`;

export const api = {
  listWorkflows: () => unwrap<WorkflowDTO[]>(client().get(`${base}/workflows`)),

  createWorkflow: (body: { name: string; contentTypes?: string[] }) =>
    unwrap<WorkflowDTO>(client().post(`${base}/workflows`, body)),

  updateWorkflow: (
    documentId: string,
    body: { name?: string; enabled?: boolean; contentTypes?: string[] }
  ) => unwrap<WorkflowDTO>(client().put(`${base}/workflows/${documentId}`, body)),

  deleteWorkflow: (documentId: string) =>
    unwrap<unknown>(client().del(`${base}/workflows/${documentId}`)),

  createStage: (
    documentId: string,
    body: {
      name: string;
      color?: string;
      order?: number;
      allowedRoles?: number[];
      publishes?: boolean;
    }
  ) => unwrap<WorkflowDTO>(client().post(`${base}/workflows/${documentId}/stages`, body)),

  updateStage: (
    stageDocumentId: string,
    body: {
      name?: string;
      color?: string;
      order?: number;
      allowedRoles?: number[];
      publishes?: boolean;
    }
  ) => unwrap<WorkflowDTO[]>(client().put(`${base}/stages/${stageDocumentId}`, body)),

  deleteStage: (stageDocumentId: string) =>
    unwrap<WorkflowDTO[]>(client().del(`${base}/stages/${stageDocumentId}`)),

  listContentTypes: () => unwrap<ContentTypeOption[]>(client().get(`${base}/content-types`)),

  listRoles: () => unwrap<RoleOption[]>(client().get(`${base}/roles`)),

  describeEntry: (uid: string, documentId: string) =>
    unwrap<EntryStageDTO>(client().get(`${base}/entries/${uid}/${documentId}`)),

  moveEntry: (uid: string, documentId: string, stage: string, note?: string) =>
    unwrap<EntryStageDTO>(
      client().put(`${base}/entries/${uid}/${documentId}/stage`, { stage, note })
    ),

  entryHistory: (uid: string, documentId: string) =>
    unwrap<TransitionRecord[]>(client().get(`${base}/entries/${uid}/${documentId}/history`)),
};
