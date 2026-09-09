import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STAGES,
  isReservedStageName,
  mayActDirectly,
  publishEffectOf,
  publishStageOf,
  type StageDTO,
} from './workflow';

/**
 * This file exists because the workflow had *two* status axes that nothing connected.
 *
 * Stages called "Draft" and "Published" sat in the same column of the edit view as Strapi's
 * own Draft & Publish badge, using the same two words for something else entirely. Nothing
 * reconciled them, so both of these were reachable and neither looked like a bug:
 *
 * - an entry in stage "Published" whose `publishedAt` was null — the panel claimed it was
 *   live while the Content Manager, correctly, called it a draft;
 * - an entry published straight from stage "Draft" with the Publish button, skipping the
 *   entire review pipeline.
 *
 * The fix gives the editorial axis editorial words and exactly one bridge to the other axis.
 */

const stage = (name: string, order: number, publishes = false): StageDTO => ({
  id: order + 1,
  documentId: `stage-${order}`,
  name,
  color: '#000000',
  order,
  allowedRoles: [],
  publishes,
});

const WRITING = stage('Writing', 0);
const IN_REVIEW = stage('In review', 1);
const APPROVED = stage('Approved', 2, true);

describe('DEFAULT_STAGES', () => {
  it('never names a stage after a Draft & Publish state', () => {
    // The collision that produced two badges reading the same word.
    for (const seeded of DEFAULT_STAGES) {
      expect(isReservedStageName(seeded.name)).toBe(false);
    }
  });

  it('has exactly one stage that publishes', () => {
    expect(DEFAULT_STAGES.filter((seeded) => seeded.publishes)).toHaveLength(1);
  });

  it('puts the publishing stage last, so the pipeline ends by going live', () => {
    const publishing = DEFAULT_STAGES.filter((seeded) => seeded.publishes)[0]!;
    const highest = Math.max(...DEFAULT_STAGES.map((seeded) => seeded.order));

    expect(publishing.order).toBe(highest);
  });

  it('keeps "Approved", which the field-RBAC plugin locks fields from by name', () => {
    // `DEFAULT_LOCK_STAGE` in the field-RBAC plugin is the string 'Approved'. Renaming this
    // stage would silently stop every fact-field lock configured against the default.
    expect(DEFAULT_STAGES.map((seeded) => seeded.name)).toContain('Approved');
  });
});

describe('isReservedStageName', () => {
  it('rejects the Draft & Publish vocabulary whatever the casing or padding', () => {
    for (const reserved of ['Draft', 'draft', '  DRAFT ', 'Published', 'published', 'Modified']) {
      expect(isReservedStageName(reserved)).toBe(true);
    }
  });

  it('allows editorial names that merely contain a reserved word', () => {
    // "Ready to publish" describes an editorial step and collides with nothing.
    for (const allowed of ['Ready to publish', 'Draft review', 'Writing', 'Legal review']) {
      expect(isReservedStageName(allowed)).toBe(false);
    }
  });
});

describe('publishStageOf', () => {
  it('finds the one stage that makes an entry live', () => {
    expect(publishStageOf([WRITING, IN_REVIEW, APPROVED])?.name).toBe('Approved');
  });

  it('returns null for a pipeline that never publishes', () => {
    // Legitimate: a workflow can govern a content-type with no Draft & Publish at all.
    expect(publishStageOf([WRITING, IN_REVIEW])).toBeNull();
  });

  it('says nothing about an empty pipeline rather than throwing', () => {
    expect(publishStageOf([])).toBeNull();
  });
});

describe('publishEffectOf', () => {
  it('publishes when an entry crosses into the publishing stage', () => {
    expect(publishEffectOf(IN_REVIEW, APPROVED)).toBe('publish');
  });

  it('takes the entry down when it leaves the publishing stage', () => {
    // This is what makes "move it back to review" mean something to a reader of the site.
    expect(publishEffectOf(APPROVED, IN_REVIEW)).toBe('unpublish');
  });

  it('leaves Draft & Publish alone for purely editorial moves', () => {
    expect(publishEffectOf(WRITING, IN_REVIEW)).toBe('none');
    expect(publishEffectOf(IN_REVIEW, WRITING)).toBe('none');
  });

  it('publishes an entry that starts life at the publishing stage', () => {
    // `from` is null for an entry that has never moved: no stage row is written until
    // something changes, so a first move can come from nowhere.
    expect(publishEffectOf(null, APPROVED)).toBe('publish');
  });

  it('does nothing when an entry arrives from nowhere at an ordinary stage', () => {
    expect(publishEffectOf(null, IN_REVIEW)).toBe('none');
  });

  it('does not re-publish a move between two publishing stages', () => {
    /*
     * Only reachable mid-migration, while a second stage still carries the flag. Emitting
     * `publish` here would be harmless but wrong, and `unpublish` would take a live entry
     * down for no reason.
     */
    const alsoPublishes = stage('Live', 3, true);

    expect(publishEffectOf(APPROVED, alsoPublishes)).toBe('none');
  });
});

describe('mayActDirectly', () => {
  it('refuses a publish that would skip the pipeline', () => {
    // The bypass: an entry still being written, published with the Publish button.
    expect(mayActDirectly(WRITING, 'publish')).toBe(false);
    expect(mayActDirectly(IN_REVIEW, 'publish')).toBe(false);
  });

  it('allows re-publishing at the publishing stage', () => {
    /*
     * Not a nicety. Editing an already-published entry puts it in Strapi's "Modified" state,
     * and the fix is to publish again. Gating that would leave an approved entry's changes
     * permanently invisible with no way out except moving the stage back and forth.
     */
    expect(mayActDirectly(APPROVED, 'publish')).toBe(true);
  });

  it('refuses an unpublish that would contradict the stage', () => {
    expect(mayActDirectly(APPROVED, 'unpublish')).toBe(false);
  });

  it('allows unpublishing anywhere the entry is not meant to be live', () => {
    // Settles a disagreement rather than creating one — e.g. an entry published before the
    // workflow existed.
    expect(mayActDirectly(WRITING, 'unpublish')).toBe(true);
  });

  it('never gates an ungoverned entry', () => {
    // null means no enabled workflow claims this content-type; the plugin must be invisible.
    expect(mayActDirectly(null, 'publish')).toBe(true);
    expect(mayActDirectly(null, 'unpublish')).toBe(true);
  });
});
