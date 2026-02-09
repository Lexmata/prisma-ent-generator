import { describe, it, expect } from 'vitest';
import type { DMMF } from '@prisma/generator-helper';
import { generateFields, collectFKFieldNames } from '../helpers/field';
import { createEmptyImports } from '../helpers/type-map';

/**
 * Helper to create a minimal DMMF.Field for testing.
 */
function makeField(overrides: Partial<DMMF.Field>): DMMF.Field {
  return {
    name: 'testField',
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    type: 'String',
    hasDefaultValue: false,
    ...overrides,
  } as DMMF.Field;
}

const emptyEnumDefs = new Map<string, DMMF.DatamodelEnum>();

describe('collectFKFieldNames', () => {
  it('collects FK field names from relation fields', () => {
    const fields = [
      makeField({ name: 'authorId', type: 'Int', kind: 'scalar' }),
      makeField({
        name: 'author',
        kind: 'object',
        type: 'User',
        relationName: 'PostAuthor',
        relationFromFields: ['authorId'],
        relationToFields: ['id'],
      }),
    ];
    const fks = collectFKFieldNames(fields);
    expect(fks.has('authorId')).toBe(true);
    expect(fks.size).toBe(1);
  });

  it('returns empty set when no relations exist', () => {
    const fields = [
      makeField({ name: 'title', type: 'String' }),
    ];
    expect(collectFKFieldNames(fields).size).toBe(0);
  });
});

describe('generateFields', () => {
  it('generates a simple String field', () => {
    const fields = [makeField({ name: 'email', type: 'String' })];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('field.String("email")');
    expect(imports.field).toBe(true);
  });

  it('generates a unique String field', () => {
    const fields = [makeField({ name: 'email', type: 'String', isUnique: true })];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toContain('.Unique()');
  });

  it('generates an optional field with Nillable', () => {
    const fields = [makeField({ name: 'bio', type: 'String', isRequired: false })];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toContain('.Optional()');
    expect(lines[0]).toContain('.Nillable()');
  });

  it('generates a Boolean field with default', () => {
    const fields = [
      makeField({
        name: 'published',
        type: 'Boolean',
        hasDefaultValue: true,
        default: false,
      }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toBe('field.Bool("published").Default(false)');
  });

  it('generates an Int field with numeric default', () => {
    const fields = [
      makeField({
        name: 'viewCount',
        type: 'Int',
        hasDefaultValue: true,
        default: 0,
      }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toBe('field.Int("view_count").Default(0)');
  });

  it('generates a DateTime field with now() default', () => {
    const fields = [
      makeField({
        name: 'createdAt',
        type: 'DateTime',
        hasDefaultValue: true,
        default: { name: 'now', args: [] },
      }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toBe('field.Time("created_at").Default(time.Now)');
    expect(imports.time).toBe(true);
  });

  it('generates an @updatedAt field with Default and UpdateDefault', () => {
    const fields = [
      makeField({
        name: 'updatedAt',
        type: 'DateTime',
        isUpdatedAt: true,
        hasDefaultValue: false,
      }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toContain('.Default(time.Now)');
    expect(lines[0]).toContain('.UpdateDefault(time.Now)');
    expect(imports.time).toBe(true);
  });

  it('skips @id Int autoincrement fields', () => {
    const fields = [
      makeField({
        name: 'id',
        type: 'Int',
        isId: true,
        hasDefaultValue: true,
        default: { name: 'autoincrement', args: [] },
      }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines).toHaveLength(0);
  });

  it('generates a UUID id field', () => {
    const fields = [
      makeField({
        name: 'id',
        type: 'String',
        isId: true,
        hasDefaultValue: true,
        default: { name: 'uuid', args: [] },
      }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('field.UUID("id", uuid.UUID{})');
    expect(lines[0]).toContain('.Default(uuid.New)');
    expect(imports.uuid).toBe(true);
  });

  it('skips relation (object) fields', () => {
    const fields = [
      makeField({ name: 'author', kind: 'object', type: 'User' }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines).toHaveLength(0);
  });

  it('generates an enum field with inline values', () => {
    const enumDef: DMMF.DatamodelEnum = {
      name: 'Role',
      values: [{ name: 'USER', dbName: null }, { name: 'ADMIN', dbName: null }, { name: 'MODERATOR', dbName: null }],
    };
    const enumDefs = new Map([['Role', enumDef]]);
    const fields = [
      makeField({
        name: 'role',
        kind: 'enum',
        type: 'Role',
        hasDefaultValue: true,
        default: 'USER',
      }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), enumDefs, imports);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('field.Enum("role")');
    expect(lines[0]).toContain('.Values("USER", "ADMIN", "MODERATOR")');
    expect(lines[0]).toContain('.Default("USER")');
  });

  it('generates a Json optional field with Go type argument', () => {
    const fields = [
      makeField({ name: 'metadata', type: 'Json', isRequired: false }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toBe('field.JSON("metadata", map[string]interface{}{}).Optional()');
  });

  it('generates a required Json field with Go type argument', () => {
    const fields = [
      makeField({ name: 'data', type: 'Json', isRequired: true }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toBe('field.JSON("data", map[string]interface{}{})');
  });

  it('includes FK fields as regular fields', () => {
    const fields = [
      makeField({ name: 'authorId', type: 'Int' }),
    ];
    const fkNames = new Set(['authorId']);
    const imports = createEmptyImports();
    const lines = generateFields(fields, fkNames, emptyEnumDefs, imports);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('field.Int("author_id")');
  });
});
