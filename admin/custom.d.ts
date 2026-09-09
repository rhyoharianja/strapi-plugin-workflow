/*
 * Subpath imports only.
 *
 * The scaffold also declared the bare `@strapi/design-system` module here, which shadowed the
 * package's real types with `any`: every prop on every Design System component went
 * unchecked. That is not theoretical — it let `TextInput error={...}` and
 * `Switch selected={...}` through, neither of which exists in v2, and both would have failed
 * silently in the browser. This package typechecks clean against the real types; keep it that
 * way rather than restoring the shim.
 */
declare module "@strapi/design-system/*";
