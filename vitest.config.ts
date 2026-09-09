import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /*
     * The bridge between the editorial axis and Draft & Publish. It is pure on purpose: the
     * two ways it can be wrong are both silent on screen — a stage that says an entry is live
     * when it is not, and a Publish button that either bypasses the pipeline or locks an
     * editor out of re-publishing an approved entry they just edited.
     */
    include: ['shared/**/*.test.ts'],
    environment: 'node',
  },
});
