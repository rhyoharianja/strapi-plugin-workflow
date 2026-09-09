/**
 * An editorial pipeline bound to one or more content-types.
 *
 * `contentTypes` is a JSON array of UIDs rather than a relation: content-types are code,
 * not data, so there is nothing to relate to. Validation happens in the service.
 */
export default {
  kind: 'collectionType',
  collectionName: 'content_hub_workflows',
  info: {
    singularName: 'workflow',
    pluralName: 'workflows',
    displayName: 'Workflow',
    description: 'Editorial pipeline governing one or more content-types',
  },
  options: { draftAndPublish: false },
  pluginOptions: {
    /*
     * Hidden from the Content Manager on purpose.
     *
     * The Content Manager is where people edit *content*; this is platform configuration
     * (or a log) that belongs to this plugin's own admin section. Leaving it in the
     * collection-type list buries Article and Page among a dozen internal tables.
     */
    'content-manager': { visible: false },
    'content-type-builder': { visible: false },
  },
  attributes: {
    name: { type: 'string', required: true, unique: true, maxLength: 80 },
    enabled: { type: 'boolean', default: true },
    /** Content-type UIDs this workflow governs, e.g. ["api::article.article"]. */
    contentTypes: { type: 'json', default: [] },
    stages: {
      type: 'relation',
      relation: 'oneToMany',
      target: 'plugin::content-hub-workflow.stage',
      mappedBy: 'workflow',
    },
  },
};
