import type { DMMF } from '@prisma/generator-helper';
import { createEmptyImports, buildImportBlock, type GoImports } from './type-map';
import { generateFields, collectFKFieldNames } from './field';
import { generateEdges } from './edge';
import { fileHeader } from '../utils';

/**
 * Index definition from the DMMF Datamodel.indexes array.
 * We accept a loose type since the DMMF re-exports differ across versions.
 */
interface DMMFIndex {
  model: string;
  type: string; // 'id' | 'normal' | 'unique' | 'fulltext'
  isDefinedOnField: boolean;
  name?: string;
  dbName?: string;
  fields: Array<{ name: string; sortOrder?: string }>;
}

/**
 * Generate a complete Go Ent schema file for a single Prisma model.
 *
 * The output follows the standard Ent schema layout:
 *   - Package declaration
 *   - Imports
 *   - Struct embedding ent.Schema
 *   - Fields() method
 *   - Edges() method
 *   - Indexes() method (if applicable)
 *   - Annotations() method (if @@map is used)
 */
export function generateSchema(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enumDefs: Map<string, DMMF.DatamodelEnum>,
  indexes?: readonly DMMFIndex[],
): string {
  const imports = createEmptyImports();

  // Build enum lookup for this model's enum fields
  const fkFieldNames = collectFKFieldNames(model.fields);
  const fieldLines = generateFields(model.fields, fkFieldNames, enumDefs, imports);
  const edgeLines = generateEdges(model, allModels, imports);

  // Filter indexes for this model (exclude field-level unique constraints and primary keys)
  const modelIndexes = (indexes ?? []).filter(
    (idx) =>
      idx.model === model.name &&
      !idx.isDefinedOnField &&
      idx.type !== 'id',
  );
  const indexLines = generateIndexes(modelIndexes, model, imports);

  // Check if we need Annotations (for @@map table name)
  const hasTableMapping = model.dbName != null;

  // Mark imports based on content
  if (fieldLines.length > 0) {
    imports.field = true;
  }
  if (edgeLines.length > 0) {
    imports.edge = true;
  }
  if (indexLines.length > 0) {
    imports.index = true;
  }
  if (hasTableMapping) {
    imports.schema = true;
    imports.entsql = true;
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

  // Indexes() method (if applicable)
  if (indexLines.length > 0) {
    lines.push(`// Indexes of the ${model.name}.`);
    lines.push(`func (${model.name}) Indexes() []ent.Index {`);
    lines.push('\treturn []ent.Index{');
    for (const il of indexLines) {
      lines.push(`\t\t${il},`);
    }
    lines.push('\t}');
    lines.push('}');
    lines.push('');
  }

  // Annotations() method (if @@map is used)
  if (hasTableMapping) {
    lines.push(`// Annotations of the ${model.name}.`);
    lines.push(`func (${model.name}) Annotations() []schema.Annotation {`);
    lines.push('\treturn []schema.Annotation{');
    lines.push(`\t\tentsql.Annotation{Table: "${model.dbName}"},`);
    lines.push('\t}');
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate Ent index definitions from DMMF indexes.
 *
 * Translates Prisma @@index and @@unique (compound) into Ent's index builder:
 *   - @@index([fieldA, fieldB], map: "name") → index.Fields("fieldA", "fieldB").StorageKey("name")
 *   - @@unique([fieldA, fieldB], map: "name") → index.Fields("fieldA", "fieldB").Unique().StorageKey("name")
 */
function generateIndexes(
  indexes: DMMFIndex[],
  model: DMMF.Model,
  imports: GoImports,
): string[] {
  const lines: string[] = [];

  for (const idx of indexes) {
    // Map Prisma field names to Ent field names (use the Prisma field name directly)
    const fieldNames = idx.fields.map((f) => `"${f.name}"`).join(', ');
    const parts: string[] = [];

    parts.push(`index.Fields(${fieldNames})`);

    if (idx.type === 'unique') {
      parts.push('.Unique()');
    }

    // Add custom index name from Prisma's `map:` attribute
    if (idx.dbName) {
      parts.push(`.StorageKey("${idx.dbName}")`);
    }

    lines.push(parts.join(''));
  }

  return lines;
}
