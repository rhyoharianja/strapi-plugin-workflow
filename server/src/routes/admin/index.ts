/**
 * Admin routes. All of them require an authenticated admin user; per-stage authorisation
 * is enforced inside the transition service, which is the only place that knows the
 * pipeline shape and the acting user's roles.
 */
export default () => ({
  type: 'admin',
  routes: [
    // Settings page — workflow CRUD
    { method: 'GET', path: '/workflows', handler: 'workflow.find', config: { policies: [] } },
    { method: 'POST', path: '/workflows', handler: 'workflow.create', config: { policies: [] } },
    {
      method: 'PUT',
      path: '/workflows/:documentId',
      handler: 'workflow.update',
      config: { policies: [] },
    },
    {
      method: 'DELETE',
      path: '/workflows/:documentId',
      handler: 'workflow.delete',
      config: { policies: [] },
    },

    // Settings page — stage CRUD
    {
      method: 'POST',
      path: '/workflows/:documentId/stages',
      handler: 'workflow.createStage',
      config: { policies: [] },
    },
    {
      method: 'PUT',
      path: '/stages/:stageDocumentId',
      handler: 'workflow.updateStage',
      config: { policies: [] },
    },
    {
      method: 'DELETE',
      path: '/stages/:stageDocumentId',
      handler: 'workflow.deleteStage',
      config: { policies: [] },
    },

    // Pickers
    {
      method: 'GET',
      path: '/content-types',
      handler: 'workflow.contentTypes',
      config: { policies: [] },
    },
    { method: 'GET', path: '/roles', handler: 'workflow.roles', config: { policies: [] } },

    // Edit-view injection
    {
      method: 'GET',
      path: '/entries/:uid/:documentId',
      handler: 'transition.describe',
      config: { policies: [] },
    },
    {
      method: 'PUT',
      path: '/entries/:uid/:documentId/stage',
      handler: 'transition.move',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/entries/:uid/:documentId/history',
      handler: 'transition.history',
      config: { policies: [] },
    },
  ],
});
