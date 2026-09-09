/**
 * Immutable audit log of every stage change.
 *
 * Stage names are stored as plain strings, not relations: an audit record must stay
 * readable after the stage it refers to has been renamed or deleted.
 */
export default {
  kind: 'collectionType',
  collectionName: 'content_hub_workflow_transitions',
  info: {
    singularName: 'transition',
    pluralName: 'transitions',
    displayName: 'Workflow Transition',
    description: 'Audit log of stage changes',
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
    /** Content-type UID of the entry that moved. */
    uid: { type: 'string', required: true },
    /** Document id of the entry that moved. */
    targetDocumentId: { type: 'string', required: true },
    fromStage: { type: 'string' },
    toStage: { type: 'string', required: true },
    byUser: {
      type: 'relation',
      relation: 'oneToOne',
      target: 'admin::user',
    },
    at: { type: 'datetime', required: true },
    note: { type: 'text' },
  },
};
