import type { DMMF } from '@prisma/generator-helper';
import { mapPrismaTypeToEnt, requiresTimeImport, type GoImports } from './type-map';
import { toSnakeCase } from '../utils';

/**
 * Determine the set of field names that serve as foreign keys for relations.
 * These are the scalar fields referenced in `relationFromFields` of relation fields.
 */
export function collectFKFieldNames(fields: readonly DMMF.Field[]): Set<string> {
  const fkNames = new Set<string>();
  for (const f of fields) {
    if (f.kind === 'object' && f.relationFromFields) {
      for (const fk of f.relationFromFields) {
        fkNames.add(fk);
      }
    }
  }
  return fkNames;
}

/**
 * Generate the Ent field definition lines for a Prisma model.
 *
 * - Skips relation (object) fields — those become edges.
 * - Includes FK scalar fields so they can be bound to edges via `.Field()`.
 * - Handles ID fields: skips default Int autoincrement IDs (Ent default),
 *   but generates UUID ID fields when needed.
 *
 * @returns An array of Go code strings, each representing one `field.X(...)` call.
 */
export function generateFields(
  fields: readonly DMMF.Field[],
  fkFieldNames: Set<string>,
  enumDefs: Map<string, DMMF.DatamodelEnum>,
  imports: GoImports,
): string[] {
  const lines: string[] = [];

  for (const f of fields) {
    // Skip relation fields — they become edges
    if (f.kind === 'object') continue;

    const line = generateField(f, fkFieldNames, enumDefs, imports);
    if (line !== null) {
      lines.push(line);
    }
  }

  return lines;
}

/**
 * Generate a single Ent field definition from a Prisma DMMF field.
 * Returns null if the field should be skipped.
 */
function generateField(
  field: DMMF.Field,
  fkFieldNames: Set<string>,
  enumDefs: Map<string, DMMF.DatamodelEnum>,
  imports: GoImports,
): string | null {
  // Handle @id fields
  if (field.isId) {
    return generateIdField(field, imports);
  }

  const fieldName = toSnakeCase(field.name);
  imports.field = true;

  if (field.kind === 'enum') {
    return generateEnumField(field, fieldName, enumDefs, imports);
  }

  return generateScalarField(field, fieldName, fkFieldNames, imports);
}

/**
 * Generate an @id field. Returns null for the default Int autoincrement case
 * since Ent handles that automatically.
 */
function generateIdField(field: DMMF.Field, imports: GoImports): string | null {
  // Default case: Int with autoincrement — Ent handles this
  if (field.type === 'Int') {
    const isAutoIncrement =
      field.hasDefaultValue &&
      typeof field.default === 'object' &&
      field.default !== null &&
      'name' in field.default &&
      (field.default as { name: string }).name === 'autoincrement';

    if (isAutoIncrement || !field.hasDefaultValue) {
      return null;
    }
  }

  imports.field = true;

  // UUID ID field
  if (field.type === 'String' && field.hasDefaultValue) {
    const defaultObj = field.default as { name?: string } | undefined;
    if (defaultObj && typeof defaultObj === 'object' && 'name' in defaultObj) {
      if (defaultObj.name === 'uuid') {
        imports.uuid = true;
        return 'field.UUID("id", uuid.UUID{}).Default(uuid.New)';
      }
      if (defaultObj.name === 'cuid') {
        return 'field.String("id").MaxLen(30).NotEmpty()';
      }
    }
  }

  // Other custom ID types
  const entType = mapPrismaTypeToEnt(field.type);
  return `field.${entType}("id")`;
}

/**
 * Generate a scalar (non-enum, non-relation) Ent field definition.
 */
function generateScalarField(
  field: DMMF.Field,
  fieldName: string,
  fkFieldNames: Set<string>,
  imports: GoImports,
): string {
  // JSON fields have special syntax in Ent: field.JSON("name", type)
  if (field.type === 'Json') {
    return generateJsonField(field, fieldName, imports);
  }

  const entType = mapPrismaTypeToEnt(field.type);
  const parts: string[] = [];

  parts.push(`field.${entType}("${fieldName}")`);

  // Track time import
  if (requiresTimeImport(field.type)) {
    imports.time = true;
  }

  // Unique constraint
  if (field.isUnique) {
    parts.push('.Unique()');
  }

  // Optional / Nillable
  if (!field.isRequired) {
    parts.push('.Optional()');
    parts.push('.Nillable()');
  }

  // FK fields that are required should still be Optional in Ent
  // because the edge manages the FK value
  if (fkFieldNames.has(field.name) && field.isRequired) {
    // Don't add Optional — Ent requires the FK field to match the edge's Required status.
    // The edge definition will handle Required() separately.
  }

  // Handle @updatedAt (must come before default handling to avoid double-default)
  if (field.isUpdatedAt) {
    imports.time = true;
    parts.push('.Default(time.Now)');
    parts.push('.UpdateDefault(time.Now)');
    return parts.join('');
  }

  // Handle defaults
  if (field.hasDefaultValue && field.default !== undefined) {
    const defaultStr = formatDefault(field.default, field.type, imports);
    if (defaultStr) {
      parts.push(defaultStr);
    }
  }

  return parts.join('');
}

/**
 * Generate an Ent JSON field definition.
 *
 * Ent's field.JSON requires two arguments: the field name and a Go type value.
 * Uses `map[string]interface{}{}` as the generic type for Prisma's `Json`.
 * JSON fields support `.Optional()` but not `.Nillable()`.
 */
function generateJsonField(
  field: DMMF.Field,
  fieldName: string,
  imports: GoImports,
): string {
  const parts: string[] = [];

  parts.push(`field.JSON("${fieldName}", map[string]interface{}{})`);

  if (!field.isRequired) {
    parts.push('.Optional()');
  }

  return parts.join('');
}

/**
 * Generate an Ent enum field definition with inline `.Values()`.
 */
function generateEnumField(
  field: DMMF.Field,
  fieldName: string,
  enumDefs: Map<string, DMMF.DatamodelEnum>,
  imports: GoImports,
): string {
  const parts: string[] = [];
  parts.push(`field.Enum("${fieldName}")`);

  // Get enum values from the definition
  const enumDef = enumDefs.get(field.type);
  if (enumDef) {
    const values = enumDef.values.map((v) => `"${v.name}"`).join(', ');
    parts.push(`.Values(${values})`);
  }

  // Optional / Nillable
  if (!field.isRequired) {
    parts.push('.Optional()');
    parts.push('.Nillable()');
  }

  // Default value for enums
  if (field.hasDefaultValue && typeof field.default === 'string') {
    parts.push(`.Default("${field.default}")`);
  }

  return parts.join('');
}

/**
 * Format a Prisma default value into an Ent `.Default(...)` or `.DefaultFunc(...)` call.
 * Returns null if the default should be skipped (e.g., autoincrement).
 */
function formatDefault(
  defaultValue: unknown,
  prismaType: string,
  imports: GoImports,
): string | null {
  if (defaultValue === undefined || defaultValue === null) {
    return null;
  }

  // Handle function defaults (e.g., now(), uuid(), autoincrement())
  if (
    typeof defaultValue === 'object' &&
    defaultValue !== null &&
    !Array.isArray(defaultValue) &&
    'name' in defaultValue
  ) {
    const funcDefault = defaultValue as { name: string; args: unknown[] };
    switch (funcDefault.name) {
      case 'now':
        imports.time = true;
        return '.Default(time.Now)';
      case 'uuid':
        imports.uuid = true;
        return '.DefaultFunc(uuid.NewString)';
      case 'cuid':
        // No built-in Ent CUID; leave a comment
        return '/* .DefaultFunc(cuid.New) — add a CUID library */';
      case 'autoincrement':
        return null;
      case 'dbgenerated':
        return null;
      default:
        return null;
    }
  }

  if (typeof defaultValue === 'boolean') {
    return `.Default(${defaultValue})`;
  }
  if (typeof defaultValue === 'number') {
    return `.Default(${defaultValue})`;
  }
  if (typeof defaultValue === 'string') {
    return `.Default("${escapeGoString(defaultValue)}")`;
  }

  return null;
}

/**
 * Escape a string for Go string literals.
 */
function escapeGoString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
