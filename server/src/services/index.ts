import type { Core } from '@strapi/strapi';

import events from './events';
import transition from './transition';
import workflow from './workflow';

/** Annotated for declaration portability under pnpm (see docs/package-conventions.md). */
const services: Record<string, (context: { strapi: Core.Strapi }) => unknown> = {
  workflow,
  transition,
  events,
};

export default services;
