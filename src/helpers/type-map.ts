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
 * BigInt       → Int     (int64 in Go)
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
  BigInt: 'Int',
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

  if (imports.field) {
    lines.push('\t"entgo.io/ent/schema/field"');
  }
  if (imports.edge) {
    lines.push('\t"entgo.io/ent/schema/edge"');
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
