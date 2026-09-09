/**
 * A single step of an editorial pipeline.
 *
 * `allowedRoles` is a relation to admin roles rather than a free-text list so the GUI
 * offers a picker and the rule survives a role being renamed.
 */
export default {
  kind: 'collectionType',
  collectionName: 'content_hub_workflow_stages',
  info: {
    singularName: 'stage',
    pluralName: 'stages',
    displayName: 'Workflow Stage',
    description: 'One step of an editorial pipeline',
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
    name: { type: 'string', required: true, maxLength: 60 },
    color: {
      type: 'string',
      default: '#4945ff',
      regex: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
    },
    /** Position in the pipeline; transitions are only allowed between adjacent orders. */
    order: { type: 'integer', required: true, default: 0, min: 0 },
    /**
     * Reaching this stage publishes the entry; leaving it takes the entry down.
     *
     * The single bridge to Strapi's Draft & Publish state. At most one stage per workflow
     * sets it, which the service enforces — two publishing stages would mean an entry could
     * be "live" in two places at once and the Publish gate would have no single answer.
     */
    publishes: { type: 'boolean', default: false },
    /** Admin roles allowed to move an entry INTO this stage. Empty = open to all. */
    allowedRoles: {
      type: 'relation',
      relation: 'oneToMany',
      target: 'admin::role',
    },
    workflow: {
      type: 'relation',
      relation: 'manyToOne',
      target: 'plugin::content-hub-workflow.workflow',
      inversedBy: 'stages',
    },
  },
};
