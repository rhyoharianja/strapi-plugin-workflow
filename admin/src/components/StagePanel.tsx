import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Divider,
  Flex,
  Loader,
  SingleSelect,
  SingleSelectOption,
  Textarea,
  Typography,
} from "@strapi/design-system";
import { useParams } from "react-router-dom";

import { publishEffectOf, type StageDTO } from "../../../shared/workflow";
import { api, type TransitionRecord } from "../api/client";
import { refreshEntryStage, useEntryStage } from "../hooks/useEntryStage";
import { LabelledField } from "./LabelledField";
import { StageBadge } from "./StageBadge";

/**
 * Injected into the Content Manager edit view.
 *
 * Only stages the current user may actually move to are offered — the same
 * `canTransition` rule the server enforces, so the UI never dangles an action that will
 * be rejected. The server remains the authority; this is convenience, not security.
 *
 * **It deliberately does not show a second status badge.** Strapi's own Draft/Published badge
 * sits in this same column, and when a stage was called "Published" the two read the same word
 * for different things. What the panel shows instead is where the entry is in the *pipeline*
 * and what a move would do to the published state — so the relationship between the two axes
 * is on screen rather than left for the editor to guess.
 */
const StagePanel = () => {
  const { slug, id } = useParams<{ slug: string; id: string }>();

  const uid = slug ?? "";
  const documentId = id ?? "";

  /*
   * The stage comes from the shared store, not local state: the wrapper around Strapi's
   * Publish button reads the same entry, and a move made here has to reach it.
   */
  const { state, error: loadError } = useEntryStage(uid, documentId);

  const [history, setHistory] = useState<TransitionRecord[]>([]);
  const [target, setTarget] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const error = moveError ?? loadError;

  const loadHistory = useCallback(async () => {
    if (!uid || !documentId) return;

    try {
      setHistory(await api.entryHistory(uid, documentId));
    } catch {
      // The audit trail is context, not function: failing to load it must not break the panel.
    }
  }, [uid, documentId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const move = async () => {
    if (!target) return;

    setBusy(true);
    try {
      await api.moveEntry(uid, documentId, target, note || undefined);
      setTarget("");
      setNote("");
      /*
       * Refresh the shared store, not just this panel. Crossing the publishing stage changed
       * whether the Publish button is allowed to act, and that button is a different
       * component in a different part of the Content Manager's tree.
       */
      await refreshEntryStage(uid, documentId);
      await loadHistory();
      setMoveError(null);
    } catch (failure) {
      // A 403 from the server lands here with its explanation intact.
      setMoveError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** What moving to the selected stage will do to the entry's published state. */
  const selected: StageDTO | undefined = state?.availableStages.find(
    (stage) => stage.documentId === target
  );

  const effect = selected
    ? publishEffectOf(state?.currentStage ?? null, selected)
    : "none";

  // A brand-new entry has no document id yet, and most content-types are not governed.
  if (!uid || !documentId) return null;
  if (state !== null && state.workflow === null) return null;

  return (
    <Box
      background="neutral0"
      padding={4}
      hasRadius
      shadow="tableShadow"
      borderColor="neutral150"
    >
      <Typography variant="sigma" textColor="neutral600">
        Workflow
      </Typography>

      {state === null ? (
        <Box paddingTop={3}>
          <Loader small>Loading stage</Loader>
        </Box>
      ) : (
        <>
          <Flex paddingTop={3} paddingBottom={1} gap={2} alignItems="center">
            {state.currentStage ? <StageBadge stage={state.currentStage} /> : null}
            <Typography variant="pi" textColor="neutral600">
              {state.workflow?.name}
            </Typography>
          </Flex>

          {/*
            Say plainly which axis is in charge. Without this the editor sees a disabled
            Publish button and no reason for it.
          */}
          <Box paddingBottom={3}>
            <Typography variant="pi" textColor="neutral600">
              {state.currentStage?.publishes
                ? "This stage keeps the entry published."
                : "The entry goes live when it reaches the publishing stage."}
            </Typography>
          </Box>

          <Divider />

          {state.availableStages.length === 0 ? (
            <Box paddingTop={3}>
              <Typography variant="pi" textColor="neutral600">
                No transition available to your role from this stage.
              </Typography>
            </Box>
          ) : (
            <Flex direction="column" alignItems="stretch" gap={2} paddingTop={3}>
              <LabelledField label="Move to stage" name="target-stage">
                <SingleSelect
                  value={target}
                  onChange={(value: string | number) => setTarget(String(value))}
                  placeholder="Select a stage"
                >
                  {state.availableStages.map((stage) => (
                    <SingleSelectOption key={stage.documentId} value={stage.documentId}>
                      {stage.publishes ? `${stage.name} (publishes)` : stage.name}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
              </LabelledField>

              {/* The consequence, before the click rather than after it. */}
              {effect === "none" ? null : (
                <Typography
                  variant="pi"
                  textColor={effect === "publish" ? "success600" : "danger600"}
                >
                  {effect === "publish"
                    ? "Moving here publishes this entry."
                    : "Moving here takes this entry off the live site."}
                </Typography>
              )}

              <LabelledField label="Note" name="note">
                <Textarea
                  name="note"
                  value={note}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setNote(event.target.value)
                  }
                  placeholder="Why is it moving? (optional)"
                />
              </LabelledField>

              <Button onClick={move} disabled={!target} loading={busy} fullWidth>
                Move stage
              </Button>
            </Flex>
          )}

          {error ? (
            <Box paddingTop={3}>
              <Typography variant="pi" textColor="danger600">
                {error}
              </Typography>
            </Box>
          ) : null}

          {history.length > 0 ? (
            <Box paddingTop={4}>
              <Typography variant="sigma" textColor="neutral600">
                History
              </Typography>
              <Flex direction="column" alignItems="stretch" gap={1} paddingTop={2}>
                {history.slice(0, 5).map((record) => (
                  <Typography key={record.id} variant="pi" textColor="neutral600">
                    {(record.fromStage ?? "start") + " to " + record.toStage} ·{" "}
                    {new Date(record.at).toLocaleString()}
                    {record.byUser?.firstname ? " · " + record.byUser.firstname : ""}
                  </Typography>
                ))}
              </Flex>
            </Box>
          ) : null}
        </>
      )}
    </Box>
  );
};

export { StagePanel };
