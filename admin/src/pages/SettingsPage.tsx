import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Divider,
  Flex,
  IconButton,
  Loader,
  Main,
  MultiSelect,
  MultiSelectOption,
  Switch,
  TextInput,
  Typography,
} from "@strapi/design-system";
import { Plus, Trash } from "@strapi/icons";

import { isReservedStageName, type StageDTO, type WorkflowDTO } from "../../../shared/workflow";
import { api, type ContentTypeOption, type RoleOption } from "../api/client";
import { LabelledField } from "../components/LabelledField";
import { StageBadge } from "../components/StageBadge";

/**
 * One editable stage. Text edits commit on blur so every keystroke does not hit the API,
 * while the role picker commits immediately because it has no intermediate state.
 */
const StageRow = ({
  stage,
  roles,
  onSave,
  onDelete,
}: {
  stage: StageDTO;
  roles: RoleOption[];
  onSave: (patch: {
    name?: string;
    color?: string;
    allowedRoles?: number[];
    publishes?: boolean;
  }) => void;
  onDelete: () => void;
}) => {
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color);
  const [nameError, setNameError] = useState<string | null>(null);

  const selected = roles
    .filter((role) => stage.allowedRoles.includes(role.code))
    .map((role) => String(role.id));

  return (
    <Flex gap={2} alignItems="flex-end" paddingTop={2} paddingBottom={2}>
      <Box width="48px">
        <StageBadge stage={{ name: String(stage.order), color: stage.color }} />
      </Box>

      <Box grow={1}>
        <LabelledField
          label="Stage"
          name={"stage-" + stage.documentId}
          error={nameError ?? undefined}
        >
          <TextInput
            name={"stage-" + stage.documentId}
            value={name}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setName(event.target.value);
              setNameError(null);
            }}
            onBlur={() => {
              if (name === stage.name) return;

              /*
                Caught here as well as on the server. "Draft" and "Published" are Strapi's own
                Draft & Publish states, and a stage wearing one of those names put two badges
                reading the same word into the same column of the edit view.
              */
              if (isReservedStageName(name)) {
                setNameError(
                  `"${name.trim()}" is a Draft & Publish state. Name the editorial step instead, and tick "Publishes" if reaching it should make the entry live.`
                );
                return;
              }

              onSave({ name });
            }}
          />
        </LabelledField>
      </Box>

      <Box width="120px">
        <LabelledField label="Colour" name={"color-" + stage.documentId}>
          <TextInput
            name={"color-" + stage.documentId}
            value={color}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setColor(event.target.value)}
            onBlur={() => {
              if (color !== stage.color) onSave({ color });
            }}
          />
        </LabelledField>
      </Box>

      <Box grow={1}>
        <LabelledField label="Roles allowed to enter" name={"roles-" + stage.documentId}>
          <MultiSelect
            value={selected}
            placeholder="Anyone"
            onChange={(values: string[]) => onSave({ allowedRoles: values.map(Number) })}
            withTags
          >
            {roles.map((role) => (
              <MultiSelectOption key={role.id} value={String(role.id)}>
                {role.name}
              </MultiSelectOption>
            ))}
          </MultiSelect>
        </LabelledField>
      </Box>

      {/*
        The one bridge to Draft & Publish. Exactly one stage per pipeline carries it — the
        server clears it elsewhere when this is ticked, so the two axes always have a single
        answer to "is this entry meant to be live?".
      */}
      <Box width="120px" paddingBottom={1}>
        <LabelledField label="Publishes" name={"publishes-" + stage.documentId}>
          <Switch
            name={"publishes-" + stage.documentId}
            checked={stage.publishes}
            onCheckedChange={(checked: boolean) => onSave({ publishes: checked })}
            visibleLabels
            onLabel="Live"
            offLabel="No"
          />
        </LabelledField>
      </Box>

      <IconButton label="Delete stage" onClick={onDelete} variant="danger-light">
        <Trash />
      </IconButton>
    </Flex>
  );
};

const WorkflowCard = ({
  workflow,
  roles,
  contentTypes,
  reload,
}: {
  workflow: WorkflowDTO;
  roles: RoleOption[];
  contentTypes: ContentTypeOption[];
  reload: () => Promise<void>;
}) => {
  const [newStage, setNewStage] = useState("");

  const run = async (action: Promise<unknown>) => {
    await action;
    await reload();
  };

  return (
    <Box background="neutral0" padding={5} hasRadius shadow="tableShadow" marginBottom={4}>
      <Flex justifyContent="space-between" alignItems="center">
        <Typography variant="delta" tag="h2">
          {workflow.name}
        </Typography>
        <Flex gap={2}>
          <Button
            variant={workflow.enabled ? "success-light" : "tertiary"}
            onClick={() =>
              run(api.updateWorkflow(workflow.documentId, { enabled: !workflow.enabled }))
            }
          >
            {workflow.enabled ? "Enabled" : "Disabled"}
          </Button>
          <Button
            variant="danger-light"
            onClick={() => run(api.deleteWorkflow(workflow.documentId))}
          >
            Delete
          </Button>
        </Flex>
      </Flex>

      <Box paddingTop={4} paddingBottom={4}>
        <LabelledField
          label="Governed content-types"
          name={"content-types-" + workflow.documentId}
        >
          <MultiSelect
            value={workflow.contentTypes}
            placeholder="No content-type bound yet"
            onChange={(values: string[]) => {
              void run(api.updateWorkflow(workflow.documentId, { contentTypes: values }));
            }}
            withTags
          >
            {contentTypes.map((option) => (
              <MultiSelectOption key={option.uid} value={option.uid}>
                {option.displayName}
              </MultiSelectOption>
            ))}
          </MultiSelect>
        </LabelledField>
      </Box>

      <Divider />

      <Box paddingTop={3}>
        <Typography variant="sigma" textColor="neutral600">
          Stages
        </Typography>

        {workflow.stages.map((stage) => (
          <StageRow
            key={stage.documentId}
            stage={stage}
            roles={roles}
            onSave={(patch) => run(api.updateStage(stage.documentId, patch))}
            onDelete={() => run(api.deleteStage(stage.documentId))}
          />
        ))}

        <Flex gap={2} alignItems="flex-end" paddingTop={3}>
          <Box grow={1}>
            <LabelledField label="Add a stage" name={"new-stage-" + workflow.documentId}>
              <TextInput
                name={"new-stage-" + workflow.documentId}
                value={newStage}
                placeholder="e.g. Legal review"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setNewStage(event.target.value)
                }
              />
            </LabelledField>
          </Box>
          <Button
            startIcon={<Plus />}
            disabled={!newStage.trim()}
            onClick={async () => {
              await run(
                api.createStage(workflow.documentId, {
                  name: newStage.trim(),
                  order: workflow.stages.length,
                })
              );
              setNewStage("");
            }}
          >
            Add
          </Button>
        </Flex>
      </Box>
    </Box>
  );
};

/**
 * Build and edit pipelines without a deploy.
 *
 * Stages, their colours and the roles allowed to enter each one are all data, so an
 * editorial process can change as the newsroom changes.
 */
const SettingsPage = () => {
  const [workflows, setWorkflows] = useState<WorkflowDTO[] | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentTypeOption[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setWorkflows(await api.listWorkflows());
      setError(null);
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  };

  useEffect(() => {
    void (async () => {
      const [roleList, typeList] = await Promise.all([api.listRoles(), api.listContentTypes()]);
      setRoles(roleList);
      setContentTypes(typeList);
      await reload();
    })();
  }, []);

  return (
    <Main>
      <Box padding={8}>
        <Flex direction="column" alignItems="flex-start" gap={1} marginBottom={6}>
          <Typography variant="alpha" tag="h1">
            Content Workflow
          </Typography>
          <Typography variant="epsilon" textColor="neutral600">
            Editorial pipelines and the roles allowed to enter each stage. Changes apply
            immediately, without a deploy.
          </Typography>
        </Flex>

        <Flex gap={2} alignItems="flex-end" marginBottom={6}>
          <Box grow={1}>
            <LabelledField label="New workflow" name="new-workflow">
              <TextInput
                name="new-workflow"
                value={name}
                placeholder="e.g. Campaign approval"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setName(event.target.value)
                }
              />
            </LabelledField>
          </Box>
          <Button
            startIcon={<Plus />}
            disabled={!name.trim()}
            onClick={async () => {
              await api.createWorkflow({ name: name.trim() });
              setName("");
              await reload();
            }}
          >
            Create
          </Button>
        </Flex>

        {error ? (
          <Box paddingBottom={4}>
            <Typography textColor="danger600">{error}</Typography>
          </Box>
        ) : null}

        {workflows === null ? (
          <Loader>Loading workflows</Loader>
        ) : workflows.length === 0 ? (
          <Typography textColor="neutral600">
            No workflow yet. Create one above: it starts with a Writing → In review →
            Approved pipeline you can edit, where reaching Approved publishes the entry.
          </Typography>
        ) : (
          workflows.map((workflow) => (
            <WorkflowCard
              key={workflow.documentId}
              workflow={workflow}
              roles={roles}
              contentTypes={contentTypes}
              reload={reload}
            />
          ))
        )}
      </Box>
    </Main>
  );
};

export { SettingsPage };
export default SettingsPage;
