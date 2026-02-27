import type { DMMF } from '@prisma/generator-helper';
import {
  mapPrismaTypeToEnt,
  requiresTimeImport,
  isUuidNativeType,
  isTextNativeType,
  extractMaxLen,
  type GoImports,
} from './type-map';

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
 * - Uses Prisma field names (camelCase) as Ent field names, with
 *   `.StorageKey()` for the DB column mapping from `@map`.
 *
 * @returns An array of Go code strings, each representing one `field.X(...)` call.
 */
export function generateFields(
  fields: readonly DMMF.Field[],
  fkFieldNames: Set<string>,
  enumDefs: Map<string, DMMF.DatamodelEnum>,
  imports: GoImports,
): string[] {
  // Build set of FK fields whose relation is optional.
  // In Ent, FK field optionality must match edge optionality.
  const optionalRelationFKs = new Set<string>();
  for (const f of fields) {
    if (f.kind === 'object' && !f.isRequired && f.relationFromFields) {
      for (const fk of f.relationFromFields) {
        optionalRelationFKs.add(fk);
      }
    }
  }

  const lines: string[] = [];

  for (const f of fields) {
    // Skip relation fields — they become edges
    if (f.kind === 'object') continue;

    // Skip unsupported fields (e.g., vector types)
    if (f.kind === 'unsupported') continue;

    const line = generateField(f, fkFieldNames, enumDefs, imports, optionalRelationFKs);
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
  optionalRelationFKs?: Set<string>,
): string | null {
  // Handle @id fields
  if (field.isId) {
    return generateIdField(field, imports);
  }

  const fieldName = field.name;
  imports.field = true;

  if (field.kind === 'enum') {
    return generateEnumField(field, fieldName, enumDefs, imports);
  }

  return generateScalarField(field, fieldName, fkFieldNames, imports, optionalRelationFKs);
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

  // UUID ID field — detected by @db.Uuid native type or uuid() default
  const nativeType = (field as any).nativeType as [string, string[]] | null | undefined;
  const isUuid = isUuidNativeType(nativeType);
  const hasUuidDefault =
    field.hasDefaultValue &&
    typeof field.default === 'object' &&
    field.default !== null &&
    'name' in field.default &&
    (field.default as { name: string }).name === 'uuid';

  if (isUuid || (field.type === 'String' && hasUuidDefault)) {
    imports.uuid = true;
    const parts: string[] = [];
    parts.push('field.UUID("id", uuid.UUID{})');

    // Add StorageKey if mapped to a different column name
    if (field.dbName && field.dbName !== 'id') {
      parts.push(`.StorageKey("${field.dbName}")`);
    }

    if (hasUuidDefault) {
      parts.push('.Default(uuid.New)');
    }

    return parts.join('');
  }

  // CUID ID field
  if (field.type === 'String' && field.hasDefaultValue) {
    const defaultObj = field.default as { name?: string } | undefined;
    if (defaultObj && typeof defaultObj === 'object' && 'name' in defaultObj) {
      if (defaultObj.name === 'cuid') {
        const parts: string[] = [];
        parts.push('field.String("id")');
        if (field.dbName && field.dbName !== 'id') {
          parts.push(`.StorageKey("${field.dbName}")`);
        }
        parts.push('.MaxLen(30).NotEmpty()');
        return parts.join('');
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
  optionalRelationFKs?: Set<string>,
): string {
  // JSON fields have special syntax in Ent: field.JSON("name", type)
  if (field.type === 'Json') {
    return generateJsonField(field, fieldName, imports);
  }

  const nativeType = (field as any).nativeType as [string, string[]] | null | undefined;
  const parts: string[] = [];

  // Check for UUID native type on non-ID fields (FK fields, etc.)
  if (isUuidNativeType(nativeType)) {
    imports.uuid = true;
    parts.push(`field.UUID("${fieldName}", uuid.UUID{})`);
  } else if (isTextNativeType(nativeType)) {
    // Text fields use field.Text() for unlimited length
    parts.push(`field.Text("${fieldName}")`);
  } else {
    const entType = mapPrismaTypeToEnt(field.type);
    parts.push(`field.${entType}("${fieldName}")`);
  }

  // StorageKey from @map annotation
  if (field.dbName) {
    parts.push(`.StorageKey("${field.dbName}")`);
  }

  // Unique constraint
  if (field.isUnique) {
    parts.push('.Unique()');
  }

  // Optional — also mark FK fields as optional when their relation is optional,
  // because Ent requires FK field optionality to match edge optionality.
  const isOptional = !field.isRequired || (optionalRelationFKs?.has(field.name) ?? false);
  if (isOptional) {
    parts.push('.Optional()');
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
    const defaultStr = formatDefault(field.default, field.type, imports, isUuidNativeType(nativeType));
    if (defaultStr) {
      parts.push(defaultStr);
    }
  }

  // MaxLen from @db.VarChar(N) or @db.Char(N) — only for string-like fields
  const maxLen = extractMaxLen(nativeType);
  if (maxLen !== null) {
    parts.push(`.MaxLen(${maxLen})`);
  }

  return parts.join('');
}

/**
 * Parse a `@ent.json` annotation from a field's documentation comment.
 *
 * Supported values: `array`, `object`.
 * Returns `'array'` or `'object'`, defaulting to `'object'` when absent.
 */
export function parseJsonTypeAnnotation(documentation?: string): 'array' | 'object' {
  if (!documentation) return 'object';
  const match = documentation.match(/@ent\.json\s+(array|object)\b/);
  return (match?.[1] as 'array' | 'object') ?? 'object';
}

/**
 * Return the Go type literal for a JSON field based on the annotation.
 */
function jsonGoType(kind: 'array' | 'object'): string {
  return kind === 'array' ? '[]interface{}{}' : 'map[string]interface{}{}';
}

/**
 * Generate an Ent JSON field definition.
 *
 * Ent's field.JSON requires two arguments: the field name and a Go type value.
 * The Go type is determined by an optional `@ent.json array` or `@ent.json object`
 * annotation in the field's documentation comment:
 *   - `@ent.json array`  → `[]interface{}{}`
 *   - `@ent.json object` → `map[string]interface{}{}` (default)
 *
 * JSON fields support `.Optional()` but not `.Nillable()`.
 */
function generateJsonField(
  field: DMMF.Field,
  fieldName: string,
  imports: GoImports,
): string {
  const parts: string[] = [];
  const jsonKind = parseJsonTypeAnnotation(field.documentation);

  parts.push(`field.JSON("${fieldName}", ${jsonGoType(jsonKind)})`);

  // StorageKey from @map annotation
  if (field.dbName) {
    parts.push(`.StorageKey("${field.dbName}")`);
  }

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

  // StorageKey from @map annotation
  if (field.dbName) {
    parts.push(`.StorageKey("${field.dbName}")`);
  }

  // Get enum values from the definition
  const enumDef = enumDefs.get(field.type);
  if (enumDef) {
    const values = enumDef.values.map((v) => `"${v.name}"`).join(', ');
    parts.push(`.Values(${values})`);
  }

  // Optional
  if (!field.isRequired) {
    parts.push('.Optional()');
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
  isUuidField: boolean = false,
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
    // BigInt defaults are serialized as strings in the DMMF.
    // If the Prisma type is BigInt and the string is a valid number, emit as numeric.
    if (prismaType === 'BigInt' && /^-?\d+$/.test(defaultValue)) {
      return `.Default(${defaultValue})`;
    }
    // UUID fields require func() uuid.UUID for defaults, not a bare value.
    if (isUuidField) {
      imports.uuid = true;
      return `.Default(func() uuid.UUID { return uuid.MustParse("${escapeGoString(defaultValue)}") })`;
    }
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
