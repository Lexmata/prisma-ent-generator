import type { DMMF } from '@prisma/generator-helper';
import type { GoImports } from './type-map';

/**
 * Information about a generated Ent edge.
 */
export interface EdgeDef {
  /** The full Go code for the edge definition (e.g., `edge.To("posts", Post.Type)`). */
  code: string;
}

/**
 * Generate the Ent edge definition lines for a given model.
 *
 * Analyses all relation (object) fields on the model, determines edge ownership
 * (edge.To vs edge.From) based on FK presence, and generates the correct Ent
 * edge builder calls.
 *
 * Ownership rules:
 * - Model with FK fields (relationFromFields non-empty) → edge.From (back-reference)
 * - Model without FK fields, but inverse has FK → edge.To (owns the relation)
 * - Neither side has FK (M2M implicit join table) → alphabetical model name tiebreaker
 *
 * @returns An array of Go code strings, each representing one edge definition.
 */
export function generateEdges(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  imports: GoImports,
): string[] {
  const edges: string[] = [];

  for (const field of model.fields) {
    if (field.kind !== 'object') continue;

    const edge = generateEdge(field, model, allModels);
    if (edge) {
      imports.edge = true;
      edges.push(edge);
    }
  }

  return edges;
}

/**
 * Generate a single Ent edge definition from a Prisma relation field.
 */
function generateEdge(
  field: DMMF.Field,
  currentModel: DMMF.Model,
  allModels: readonly DMMF.Model[],
): string | null {
  const targetModelName = field.type;
  const targetModel = allModels.find((m) => m.name === targetModelName);
  if (!targetModel) return null;

  // Find the inverse relation field on the target model
  const inverseField = targetModel.fields.find(
    (f) => f.kind === 'object' && f.relationName === field.relationName,
  );

  const hasFK =
    field.relationFromFields !== undefined && field.relationFromFields.length > 0;
  const inverseHasFK =
    inverseField?.relationFromFields !== undefined &&
    inverseField.relationFromFields.length > 0;

  const edgeName = field.name;

  if (hasFK) {
    // This model holds the FK → edge.From (back-reference)
    return buildEdgeFrom(field, edgeName, targetModelName, inverseField);
  }

  if (inverseHasFK) {
    // Other model holds the FK → edge.To (this model owns)
    return buildEdgeTo(field, edgeName, targetModelName);
  }

  // Neither side has FK — M2M implicit or O2O bidirectional
  return buildImplicitEdge(
    field,
    edgeName,
    targetModelName,
    currentModel.name,
    inverseField,
  );
}

/**
 * Build an edge.From definition (this model holds the FK).
 */
function buildEdgeFrom(
  field: DMMF.Field,
  edgeName: string,
  targetModelName: string,
  inverseField: DMMF.Field | undefined,
): string {
  const refName = inverseField ? inverseField.name : targetModelName;

  const parts: string[] = [];
  parts.push(`edge.From("${edgeName}", ${targetModelName}.Type)`);
  parts.push(`.Ref("${refName}")`);
  parts.push('.Unique()');

  // Bind the FK field to this edge
  if (field.relationFromFields && field.relationFromFields.length > 0) {
    const fkFieldName = field.relationFromFields[0];
    parts.push(`.Field("${fkFieldName}")`);
  }

  if (field.isRequired) {
    parts.push('.Required()');
  }

  return parts.join('');
}

/**
 * Build an edge.To definition (this model owns the relation).
 */
function buildEdgeTo(
  field: DMMF.Field,
  edgeName: string,
  targetModelName: string,
): string {
  const parts: string[] = [];
  parts.push(`edge.To("${edgeName}", ${targetModelName}.Type)`);

  if (!field.isList) {
    parts.push('.Unique()');
  }

  return parts.join('');
}

/**
 * Build an edge for an implicit M2M or bidirectional relation
 * where neither side holds a FK.
 *
 * Uses alphabetical model name ordering to determine ownership:
 * - Model with earlier name → edge.To (owner)
 * - Model with later name → edge.From (back-reference)
 *
 * For self-referential relations on the same model, the field that appears
 * first (alphabetically by field name) becomes edge.To.
 */
function buildImplicitEdge(
  field: DMMF.Field,
  edgeName: string,
  targetModelName: string,
  currentModelName: string,
  inverseField: DMMF.Field | undefined,
): string {
  const isSelfRef = currentModelName === targetModelName;

  let isOwner: boolean;
  if (isSelfRef) {
    // Self-referential: use field name ordering
    isOwner = field.name <= (inverseField?.name ?? field.name);
  } else {
    // Cross-model: use model name ordering
    isOwner = currentModelName <= targetModelName;
  }

  if (isOwner) {
    return buildEdgeTo(field, edgeName, targetModelName);
  }

  // Back-reference
  const refName = inverseField ? inverseField.name : targetModelName;
  const parts: string[] = [];
  parts.push(`edge.From("${edgeName}", ${targetModelName}.Type)`);
  parts.push(`.Ref("${refName}")`);

  if (!field.isList) {
    parts.push('.Unique()');
  }

  return parts.join('');
}
