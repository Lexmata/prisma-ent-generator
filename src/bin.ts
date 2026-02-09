#!/usr/bin/env node
import { generatorHandler } from '@prisma/generator-helper';
import { generate } from './generator';

generatorHandler({
  onManifest() {
    return {
      prettyName: 'Prisma Ent Generator',
      defaultOutput: './ent',
    };
  },
  onGenerate: generate,
});
