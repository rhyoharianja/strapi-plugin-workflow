import {
  mayActDirectly,
  publishStageOf,
  type DocumentAction,
} from "../../shared/workflow";
import { useEntryStage } from "./hooks/useEntryStage";

/**
 * Wrap Strapi's own Publish and Unpublish buttons with the workflow's rule.
 *
 * **This is courtesy, not enforcement.** The authority is the document-service middleware in
 * `server/src/register.ts`, which applies to the REST API, GraphQL and any script. Without
 * this wrapper the rule still holds — the editor just discovers it by pressing an
 * enabled-looking button and reading a 403 toast. Disabling the button with the reason on it
 * is the difference between a rule and a trap.
 *
 * The built-in actions are hooks, so the wrapper must call the original unconditionally and
 * decide afterwards; returning early would change the hook order between renders.
 */

/** What the Content Manager passes each document action. */
interface ActionProps {
  model?: string;
  documentId?: string;
}

/** The subset of a document-action descriptor this wrapper touches. */
interface Descriptor {
  disabled?: boolean;
  label?: string;
  [key: string]: unknown;
}

type ActionComponent = ((props: ActionProps) => Descriptor | undefined) & {
  type?: string;
  position?: unknown;
};

const GATED: Record<string, DocumentAction> = {
  publish: "publish",
  unpublish: "unpublish",
};

const withWorkflowGate = (action: ActionComponent): ActionComponent => {
  const gated = GATED[action.type ?? ""];

  if (!gated) return action;

  const Wrapped = (props: ActionProps): Descriptor | undefined => {
    const descriptor = action(props);
    const { state } = useEntryStage(props.model ?? "", props.documentId ?? "");

    // Ungoverned entry, or the pipeline has not loaded yet: leave Strapi's own answer alone.
    if (!descriptor || !state?.workflow || !state.currentStage) return descriptor;
    if (mayActDirectly(state.currentStage, gated)) return descriptor;

    const target = publishStageOf(state.availableStages);

    return {
      ...descriptor,
      disabled: true,
      label:
        gated === "publish"
          ? target
            ? `Move to "${target.name}" to publish`
            : `Publishing happens at a later stage`
          : `Move out of "${state.currentStage.name}" to unpublish`,
    };
  };

  // The Content Manager filters actions by these statics, so they must survive wrapping.
  Wrapped.type = action.type;
  Wrapped.position = action.position;

  return Wrapped;
};

/** Applied to every document action; only publish and unpublish are changed. */
export const gateDocumentActions = (actions: ActionComponent[]): ActionComponent[] =>
  actions.map(withWorkflowGate);
