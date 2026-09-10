/**
 * Contract shared by this plugin's server and admin bundles.
 *
 * The UIDs are referenced from both halves and by other plugins (the flow
 * engine subscribes to the stage-changed event), so they live in one place.
 */

export const PLUGIN_ID = 'workflow' as const;

export const UID = {
  workflow: 'plugin::workflow.workflow',
  stage: 'plugin::workflow.stage',
  transition: 'plugin::workflow.transition',
  entryStage: 'plugin::workflow.entry-stage',
} as const;

/**
 * Event other plugins subscribe to. The flow engine listens for this to run
 * automations when an entry is approved, published, taken down, and so on.
 */
export const STAGE_CHANGED_EVENT = 'content-workflow.stage.changed' as const;

export interface StageDTO {
  id: number;
  documentId: string;
  name: string;
  color: string;
  order: number;
  /** Admin role codes allowed to move an entry INTO this stage. Empty = open to all. */
  allowedRoles: string[];
  /**
   * Whether reaching this stage makes the entry live.
   *
   * At most one stage per workflow sets this. It is the single bridge between the editorial
   * axis (stages) and Strapi's own Draft & Publish axis (`publishedAt`) — see
   * `publishEffectOf`. Everything else about a stage is editorial bookkeeping.
   */
  publishes: boolean;
}

export interface WorkflowDTO {
  id: number;
  documentId: string;
  name: string;
  enabled: boolean;
  /** Content-type UIDs governed by this workflow. */
  contentTypes: string[];
  stages: StageDTO[];
}

/** Current stage of one entry, plus the transitions its viewer is allowed to make. */
export interface EntryStageDTO {
  uid: string;
  documentId: string;
  workflow: Pick<WorkflowDTO, 'id' | 'documentId' | 'name'> | null;
  currentStage: StageDTO | null;
  /** Stages this user may move the entry to right now. */
  availableStages: StageDTO[];
}

export interface StageChangedPayload {
  uid: string;
  documentId: string;
  workflowId: number;
  fromStage: string | null;
  toStage: string;
  byUser: number;
  at: string;
  note?: string;
}

/** Colour used when a stage has none configured. */
export const DEFAULT_STAGE_COLOR = '#4945ff';

/**
 * Stages created for a brand-new workflow.
 *
 * **No stage is called "Draft" or "Published".** Those two words belong to Strapi's Draft &
 * Publish axis, which this plugin does not own, and the stage panel is injected into the same
 * right-hand column as Strapi's own status badge. Naming a stage after a D&P state produced
 * two badges reading the same word with different meanings — and, because nothing linked
 * them, an entry could sit in stage "Published" while `publishedAt` was null.
 *
 * The editorial axis therefore uses editorial words, and exactly one stage carries
 * `publishes` to bridge to the other axis.
 */
export const DEFAULT_STAGES: Array<Pick<StageDTO, 'name' | 'color' | 'order' | 'publishes'>> = [
  { name: 'Writing', color: '#8e8ea9', order: 0, publishes: false },
  { name: 'In review', color: '#d9822b', order: 1, publishes: false },
  { name: 'Approved', color: '#328048', order: 2, publishes: true },
];

/** What a stage is allowed to be called: never a Draft & Publish state. */
export const RESERVED_STAGE_NAMES = ['draft', 'published', 'modified'] as const;

/**
 * Rejects stage names that duplicate Strapi's Draft & Publish vocabulary.
 *
 * Enforced when a stage is created or renamed, because the collision is not a cosmetic
 * preference — it is what made the two status badges contradict each other on screen.
 */
export const isReservedStageName = (name: string): boolean =>
  (RESERVED_STAGE_NAMES as readonly string[]).includes(name.trim().toLowerCase());

/** The one stage that makes an entry live, or null when the pipeline never publishes. */
export const publishStageOf = <T extends Pick<StageDTO, 'publishes'>>(
  stages: readonly T[]
): T | null => stages.find((stage) => stage.publishes) ?? null;

/** Effect a move has on Strapi's Draft & Publish state. */
export type PublishEffect = 'publish' | 'unpublish' | 'none';

/**
 * What moving between two stages must do to `publishedAt`.
 *
 * The whole reconciliation lives here: crossing *into* the publishing stage publishes, and
 * leaving it takes the entry back down. Anything else is editorial movement that D&P must
 * not notice.
 */
export const publishEffectOf = (
  from: Pick<StageDTO, 'publishes'> | null,
  to: Pick<StageDTO, 'publishes'>
): PublishEffect => {
  if (to.publishes) return from?.publishes ? 'none' : 'publish';

  return from?.publishes ? 'unpublish' : 'none';
};

/** A Draft & Publish action an editor can take directly from the Content Manager. */
export type DocumentAction = 'publish' | 'unpublish';

/**
 * Whether an editor may drive Draft & Publish directly, given where the entry sits.
 *
 * With the stage owning publishing, the Publish button is not a second way to go live — it
 * would let an entry in "Writing" skip the pipeline entirely. It stays available only where
 * it cannot contradict the stage:
 *
 * - `publish` at the publishing stage: the entry is *meant* to be live, so re-publishing
 *   after an edit (Strapi's "Modified") is exactly right, and must keep working.
 * - `unpublish` anywhere else: the entry is not meant to be live, so taking it down only
 *   settles a disagreement rather than creating one.
 *
 * An ungoverned entry is never gated: `null` means no enabled workflow claims it.
 */
export const mayActDirectly = (
  currentStage: Pick<StageDTO, 'publishes'> | null,
  action: DocumentAction
): boolean => {
  if (currentStage === null) return true;

  return action === 'publish' ? currentStage.publishes : !currentStage.publishes;
};


// ── Stage RBAC ──────────────────────────────────────────────────────────────────────────────
//
// Moved here from a separate `shared-utils` package. These two functions had exactly one
// consumer — this plugin — so keeping them in a package every installation had to resolve
// bought nothing.

/** Minimal shape of the acting user that stage RBAC needs. */
export interface ActingUser {
  id: number;
  /** Admin role codes, e.g. `strapi-super-admin`. */
  roles: string[];
}

const SUPER_ADMIN_ROLE = 'strapi-super-admin';

const hasRole = (user: ActingUser | null | undefined, role: string): boolean =>
  Boolean(user?.roles.includes(role));

const isSuperAdmin = (user: ActingUser | null | undefined): boolean =>
  hasRole(user, SUPER_ADMIN_ROLE);

/**
 * Whether the user may move an entry *into* `target`.
 *
 * Each stage carries the role codes allowed to enter it. A stage with no roles listed is open
 * to anyone who can edit the entry — an unconfigured pipeline must still be usable.
 */
export const canEnterStage = (
  user: ActingUser | null | undefined,
  target: Pick<StageDTO, 'allowedRoles'>
): boolean => {
  if (isSuperAdmin(user)) return true;
  if (target.allowedRoles.length === 0) return true;

  return target.allowedRoles.some((role) => hasRole(user, role));
};

/**
 * Whether a transition between two stages is structurally valid.
 *
 * Movement is allowed between **adjacent** stages in either direction — forward to progress,
 * backward to send work back for revision — and the target's role gate must pass. A super admin
 * skips the adjacency rule but is still audited, so an unusual move is always explainable
 * afterwards.
 */
export const canTransition = (
  user: ActingUser | null | undefined,
  from: Pick<StageDTO, 'order'> | null,
  to: Pick<StageDTO, 'order' | 'allowedRoles'>
): boolean => {
  if (!canEnterStage(user, to)) return false;
  if (from === null) return true;
  if (isSuperAdmin(user)) return true;

  return Math.abs(to.order - from.order) === 1;
};
