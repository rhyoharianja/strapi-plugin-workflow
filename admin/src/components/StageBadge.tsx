import { Badge } from "@strapi/design-system";

import type { StageDTO } from "../../../shared/workflow";

/** Stage pill tinted with the stage's configured colour. */
const StageBadge = ({ stage }: { stage: Pick<StageDTO, "name" | "color"> }) => (
  <Badge
    style={{
      background: stage.color,
      color: "#ffffff",
      border: "none",
    }}
  >
    {stage.name}
  </Badge>
);

export { StageBadge };
