import type { DMMF } from '@prisma/generator-helper';
import { createEmptyImports, buildImportBlock } from './type-map';
import { generateFields, collectFKFieldNames } from './field';
import { generateEdges } from './edge';
import { fileHeader } from '../utils';

/**
 * Generate a complete Go Ent schema file for a single Prisma model.
 *
 * The output follows the standard Ent schema layout:
 *   - Package declaration
 *   - Imports
 *   - Struct embedding ent.Schema
 *   - Fields() method
 *   - Edges() method
 */
export function generateSchema(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enumDefs: Map<string, DMMF.DatamodelEnum>,
): string {
  const imports = createEmptyImports();

  // Build enum lookup for this model's enum fields
  const fkFieldNames = collectFKFieldNames(model.fields);
  const fieldLines = generateFields(model.fields, fkFieldNames, enumDefs, imports);
  const edgeLines = generateEdges(model, allModels, imports);

  // Mark imports based on content
  if (fieldLines.length > 0) {
    imports.field = true;
  }
  if (edgeLines.length > 0) {
    imports.edge = true;
  }

  const lines: string[] = [];

  // File header
  lines.push(fileHeader());
  lines.push('package schema');
  lines.push('');

  // Import block
  lines.push(buildImportBlock(imports));
  lines.push('');

  // Struct definition
  if (model.documentation) {
    lines.push(`// ${model.name} ${model.documentation}`);
  } else {
    lines.push(`// ${model.name} holds the schema definition for the ${model.name} entity.`);
  }
  lines.push(`type ${model.name} struct {`);
  lines.push('\tent.Schema');
  lines.push('}');
  lines.push('');

  // Fields() method
  lines.push(`// Fields of the ${model.name}.`);
  lines.push(`func (${model.name}) Fields() []ent.Field {`);
  if (fieldLines.length === 0) {
    lines.push('\treturn nil');
  } else {
    lines.push('\treturn []ent.Field{');
    for (const fl of fieldLines) {
      lines.push(`\t\t${fl},`);
    }
    lines.push('\t}');
  }
  lines.push('}');
  lines.push('');

  // Edges() method
  lines.push(`// Edges of the ${model.name}.`);
  lines.push(`func (${model.name}) Edges() []ent.Edge {`);
  if (edgeLines.length === 0) {
    lines.push('\treturn nil');
  } else {
    lines.push('\treturn []ent.Edge{');
    for (const el of edgeLines) {
      lines.push(`\t\t${el},`);
    }
    lines.push('\t}');
  }
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}
