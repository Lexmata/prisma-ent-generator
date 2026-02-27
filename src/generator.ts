import fs from 'fs';
import path from 'path';
import type { DMMF, GeneratorOptions } from '@prisma/generator-helper';
import { generateSchema } from './helpers/schema';
import { generateGenerateGo, generateEntcGo } from './helpers/entfiles';
import { modelToFileName, fileHeader } from './utils';

/**
 * Check whether the generator is enabled via the `isEnabled` config property
 * in the Prisma generator block.
 *
 * The property should reference an environment variable using Prisma's `env()`:
 *
 *   generator ent {
 *     isEnabled = env("GENERATE_ENT")
 *   }
 *
 * Prisma resolves the env var and passes the value through
 * `options.generator.config.isEnabled`. Returns true only when the
 * resolved value is "true" (case-insensitive).
 */
export function isEnabled(configValue?: string): boolean {
  return configValue?.toLowerCase() === 'true';
}

/**
 * Main generator function — receives the full Prisma DMMF and generator config,
 * then writes a complete Go Ent installation to the output directory.
 *
 * Output structure:
 *   <outputDir>/
 *     generate.go          — go:generate directive to run ent codegen
 *     entc.go              — ent codegen configuration (build-tag guarded)
 *     schema/
 *       user.go            — one schema file per Prisma model
 *       post.go
 *       ...
 */
export async function generate(options: GeneratorOptions): Promise<void> {
  const isEnabledValue = options.generator.config.isEnabled;
  const configValue = Array.isArray(isEnabledValue) ? isEnabledValue[0] : isEnabledValue;
  if (!isEnabled(configValue)) {
    console.log(
      'prisma-ent-generator: Skipping — set isEnabled = env("GENERATE_ENT") to "true" in your generator config.',
    );
    return;
  }

  const outputDir = options.generator.output?.value;
  if (!outputDir) {
    throw new Error('No output directory specified for prisma-ent-generator');
  }

  // The output dir is the ent root (e.g. ./ent).
  // Schema files go into <outputDir>/schema/
  const schemaDir = path.join(outputDir, 'schema');
  fs.mkdirSync(schemaDir, { recursive: true });

  const { datamodel } = options.dmmf;
  const models = [...datamodel.models] as DMMF.Model[];
  const enums = [...datamodel.enums] as DMMF.DatamodelEnum[];
  // Indexes are available at the datamodel level in Prisma v6 DMMF
  const indexes = (datamodel as any).indexes ?? [];

  // Build enum lookup map
  const enumDefs = new Map<string, DMMF.DatamodelEnum>();
  for (const e of enums) {
    enumDefs.set(e.name, e);
  }

  // --- generate.go (go:generate directive) ---
  const generateGoPath = path.join(outputDir, 'generate.go');
  if (!fs.existsSync(generateGoPath)) {
    fs.writeFileSync(generateGoPath, generateGenerateGo(), 'utf-8');
  }

  // --- entc.go (ent codegen config, build-tag guarded) ---
  const entcGoPath = path.join(outputDir, 'entc.go');
  if (!fs.existsSync(entcGoPath)) {
    fs.writeFileSync(entcGoPath, generateEntcGo(), 'utf-8');
  }

  // --- schema/*.go (one per Prisma model, always overwritten) ---
  for (const model of models) {
    const content = generateSchema(model, models, enumDefs, indexes);
    const fileName = modelToFileName(model.name);
    const filePath = path.join(schemaDir, `${fileName}.go`);
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  const modelNames = models.map((m) => m.name).join(', ');
  console.log(
    `prisma-ent-generator: Generated ${models.length} schema(s) → ${schemaDir} [${modelNames}]`,
  );
  console.log(
    `prisma-ent-generator: Ent root → ${outputDir} (generate.go, entc.go)`,
  );
}
