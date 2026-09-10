/**
 * Current stage of one entry.
 *
 * Held in a side table keyed by (uid, documentId) rather than as a field injected into
 * every governed content-type. That keeps the plugin non-invasive: enabling or removing
 * a workflow never rewrites another content-type's schema or migrates its data.
 */
export default {
  kind: 'collectionType',
  collectionName: 'workflow_entry_stages',
  info: {
    singularName: 'entry-stage',
    pluralName: 'entry-stages',
    displayName: 'Entry Stage',
    description: 'Current workflow stage of a content entry',
  },
  options: { draftAndPublish: false },
  pluginOptions: {
    'content-manager': { visible: false },
    'content-type-builder': { visible: false },
  },
  attributes: {
    uid: { type: 'string', required: true },
    targetDocumentId: { type: 'string', required: true },
    workflow: {
      type: 'relation',
      relation: 'oneToOne',
      target: 'plugin::workflow.workflow',
    },
    stage: {
      type: 'relation',
      relation: 'oneToOne',
      target: 'plugin::workflow.stage',
    },
  },
};
