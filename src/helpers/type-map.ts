/**
 * Tracks which Go imports are required based on the types and features used.
 */
export interface GoImports {
  /** Whether the "time" package is needed (for DateTime fields). */
  time: boolean;
  /** Whether the "github.com/google/uuid" package is needed (for UUID defaults). */
  uuid: boolean;
  /** Whether "entgo.io/ent/schema/field" is needed (always true if there are fields). */
  field: boolean;
  /** Whether "entgo.io/ent/schema/edge" is needed (always true if there are edges). */
  edge: boolean;
  /** Whether "entgo.io/ent/schema/index" is needed (for indexes). */
  index: boolean;
  /** Whether "entgo.io/ent/schema" is needed (for Annotations). */
  schema: boolean;
  /** Whether "entgo.io/ent/dialect/entsql" is needed (for table name annotations). */
  entsql: boolean;
}

/**
 * Create an empty Go imports tracker.
 */
export function createEmptyImports(): GoImports {
  return {
    time: false,
    uuid: false,
    field: false,
    edge: false,
    index: false,
    schema: false,
    entsql: false,
  };
}

/**
 * Mapping from Prisma scalar types to Ent field builder function names.
 *
 * Prisma Type  → Ent field.X()
 * ──────────────────────────────
 * String       → String
 * Boolean      → Bool
 * Int          → Int
 * BigInt       → Int64   (int64 in Go, Ent uses field.Int for int32)
 * Float        → Float
 * Decimal      → Float   (float64 in Go)
 * DateTime     → Time
 * Json         → JSON
 * Bytes        → Bytes
 */
const PRISMA_TO_ENT_FIELD: Record<string, string> = {
  String: 'String',
  Boolean: 'Bool',
  Int: 'Int',
  BigInt: 'Int64',
  Float: 'Float',
  Decimal: 'Float',
  DateTime: 'Time',
  Json: 'JSON',
  Bytes: 'Bytes',
};

/**
 * Map a Prisma scalar type to the corresponding Ent field builder function name.
 * Returns "String" as a fallback for unknown types.
 */
export function mapPrismaTypeToEnt(prismaType: string): string {
  return PRISMA_TO_ENT_FIELD[prismaType] || 'String';
}

/**
 * Check whether a Prisma scalar type requires the "time" import.
 */
export function requiresTimeImport(prismaType: string): boolean {
  return prismaType === 'DateTime';
}

/**
 * Build the Go import block string from tracked imports.
 */
export function buildImportBlock(imports: GoImports): string {
  const lines: string[] = [];

  lines.push('import (');
  lines.push('\t"entgo.io/ent"');

  if (imports.entsql) {
    lines.push('\t"entgo.io/ent/dialect/entsql"');
  }
  if (imports.schema) {
    lines.push('\t"entgo.io/ent/schema"');
  }
  if (imports.edge) {
    lines.push('\t"entgo.io/ent/schema/edge"');
  }
  if (imports.field) {
    lines.push('\t"entgo.io/ent/schema/field"');
  }
  if (imports.index) {
    lines.push('\t"entgo.io/ent/schema/index"');
  }

  // Standard library imports (separated by blank line if present)
  const stdImports: string[] = [];
  if (imports.time) {
    stdImports.push('\t"time"');
  }

  // Third-party imports
  const thirdParty: string[] = [];
  if (imports.uuid) {
    thirdParty.push('\t"github.com/google/uuid"');
  }

  if (stdImports.length > 0 || thirdParty.length > 0) {
    lines.push('');
    lines.push(...stdImports);
  }
  if (thirdParty.length > 0) {
    if (stdImports.length === 0) {
      lines.push('');
    }
    lines.push(...thirdParty);
  }

  lines.push(')');

  return lines.join('\n');
}

/**
 * Check whether a field's native type indicates a UUID.
 * Prisma encodes `@db.Uuid` as `['Uuid', []]`.
 */
export function isUuidNativeType(nativeType?: readonly [string, readonly string[]] | null): boolean {
  return nativeType != null && nativeType[0] === 'Uuid';
}

/**
 * Check whether a field's native type indicates a Text column.
 * Prisma encodes `@db.Text` as `['Text', []]`.
 */
export function isTextNativeType(nativeType?: readonly [string, readonly string[]] | null): boolean {
  return nativeType != null && nativeType[0] === 'Text';
}

/**
 * Extract MaxLen from a native type like VarChar(N) or Char(N).
 * Returns the length as a number, or null if not applicable.
 */
export function extractMaxLen(nativeType?: readonly [string, readonly string[]] | null): number | null {
  if (nativeType == null) return null;
  const [typeName, args] = nativeType;
  if ((typeName === 'VarChar' || typeName === 'Char') && args.length > 0) {
    const len = parseInt(args[0], 10);
    return isNaN(len) ? null : len;
  }
  return null;
}
