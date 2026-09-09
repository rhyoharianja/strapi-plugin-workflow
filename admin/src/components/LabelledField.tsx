import { Field } from "@strapi/design-system";

/**
 * Design System v2 dropped the `label` prop from inputs: a label is composed with
 * `Field.Root` + `Field.Label` instead. This wrapper keeps that boilerplate in one place
 * so the forms below stay readable.
 */
const LabelledField = ({
  label,
  name,
  hint,
  error,
  children,
}: {
  label: string;
  name?: string;
  hint?: string;
  /** Validation message. v2 carries it on `Field.Root`, not on the input itself. */
  error?: string;
  children: React.ReactNode;
}) => (
  <Field.Root name={name} hint={hint} error={error}>
    <Field.Label>{label}</Field.Label>
    {children}
    <Field.Hint />
    <Field.Error />
  </Field.Root>
);

export { LabelledField };
