import { describe, it, expect } from 'vitest';
import {
  mapPrismaTypeToEnt,
  requiresTimeImport,
  buildImportBlock,
  createEmptyImports,
} from '../helpers/type-map';

describe('mapPrismaTypeToEnt', () => {
  it('maps String to String', () => {
    expect(mapPrismaTypeToEnt('String')).toBe('String');
  });

  it('maps Boolean to Bool', () => {
    expect(mapPrismaTypeToEnt('Boolean')).toBe('Bool');
  });

  it('maps Int to Int', () => {
    expect(mapPrismaTypeToEnt('Int')).toBe('Int');
  });

  it('maps BigInt to Int64', () => {
    expect(mapPrismaTypeToEnt('BigInt')).toBe('Int64');
  });

  it('maps Float to Float', () => {
    expect(mapPrismaTypeToEnt('Float')).toBe('Float');
  });

  it('maps Decimal to Float', () => {
    expect(mapPrismaTypeToEnt('Decimal')).toBe('Float');
  });

  it('maps DateTime to Time', () => {
    expect(mapPrismaTypeToEnt('DateTime')).toBe('Time');
  });

  it('maps Json to JSON', () => {
    expect(mapPrismaTypeToEnt('Json')).toBe('JSON');
  });

  it('maps Bytes to Bytes', () => {
    expect(mapPrismaTypeToEnt('Bytes')).toBe('Bytes');
  });

  it('falls back to String for unknown types', () => {
    expect(mapPrismaTypeToEnt('Unknown')).toBe('String');
  });
});

describe('requiresTimeImport', () => {
  it('returns true for DateTime', () => {
    expect(requiresTimeImport('DateTime')).toBe(true);
  });

  it('returns false for other types', () => {
    expect(requiresTimeImport('String')).toBe(false);
    expect(requiresTimeImport('Int')).toBe(false);
  });
});

describe('buildImportBlock', () => {
  it('includes only ent for empty imports', () => {
    const imports = createEmptyImports();
    const block = buildImportBlock(imports);
    expect(block).toContain('"entgo.io/ent"');
    expect(block).not.toContain('field');
    expect(block).not.toContain('edge');
  });

  it('includes field import when needed', () => {
    const imports = createEmptyImports();
    imports.field = true;
    const block = buildImportBlock(imports);
    expect(block).toContain('"entgo.io/ent/schema/field"');
  });

  it('includes edge import when needed', () => {
    const imports = createEmptyImports();
    imports.edge = true;
    const block = buildImportBlock(imports);
    expect(block).toContain('"entgo.io/ent/schema/edge"');
  });

  it('includes time import when needed', () => {
    const imports = createEmptyImports();
    imports.time = true;
    const block = buildImportBlock(imports);
    expect(block).toContain('"time"');
  });

  it('includes uuid import when needed', () => {
    const imports = createEmptyImports();
    imports.uuid = true;
    const block = buildImportBlock(imports);
    expect(block).toContain('"github.com/google/uuid"');
  });

  it('includes all imports together', () => {
    const imports = createEmptyImports();
    imports.field = true;
    imports.edge = true;
    imports.time = true;
    imports.uuid = true;
    const block = buildImportBlock(imports);
    expect(block).toContain('"entgo.io/ent"');
    expect(block).toContain('"entgo.io/ent/schema/field"');
    expect(block).toContain('"entgo.io/ent/schema/edge"');
    expect(block).toContain('"time"');
    expect(block).toContain('"github.com/google/uuid"');
  });
});
