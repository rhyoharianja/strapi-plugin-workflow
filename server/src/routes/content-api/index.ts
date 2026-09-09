/**
 * No public routes: editorial state is internal to the newsroom, and exposing stages
 * publicly would leak unreleased content planning. Other plugins read stages through the
 * service layer instead.
 */
export default () => ({
  type: 'content-api',
  routes: [],
});
