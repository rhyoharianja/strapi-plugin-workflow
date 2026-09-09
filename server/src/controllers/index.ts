import type { Core } from '@strapi/strapi';

import transition from './transition';
import workflow from './workflow';

/** Annotated for declaration portability under pnpm (see docs/package-conventions.md). */
const controllers: Record<string, (context: { strapi: Core.Strapi }) => unknown> = {
  workflow,
  transition,
};

export default controllers;
