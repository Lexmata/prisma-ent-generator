import { describe, it, expect } from 'vitest';
import type { DMMF } from '@prisma/generator-helper';
import { generateFields, collectFKFieldNames, parseJsonTypeAnnotation } from '../helpers/field';
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
    expect(lines[0]).toBe('field.Int("viewCount").Default(0)');
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
    expect(lines[0]).toBe('field.Time("createdAt").Default(time.Now)');
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

  it('generates a non-id UUID field with uuid() default using .Default(uuid.New)', () => {
    const fields = [
      makeField({
        name: 'documentId',
        type: 'String',
        isUnique: true,
        hasDefaultValue: true,
        default: { name: 'uuid', args: [] },
        nativeType: ['Uuid', []],
      } as Partial<DMMF.Field>),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('field.UUID("documentId", uuid.UUID{})');
    expect(lines[0]).toContain('.Default(uuid.New)');
    expect(lines[0]).not.toContain('.DefaultFunc');
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

  it('generates a Json array field when annotated with @ent.json array', () => {
    const fields = [
      makeField({ name: 'tags', type: 'Json', isRequired: true, documentation: '@ent.json array' }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toBe('field.JSON("tags", []interface{}{})');
  });

  it('generates an optional Json array field', () => {
    const fields = [
      makeField({ name: 'items', type: 'Json', isRequired: false, documentation: '@ent.json array' }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toBe('field.JSON("items", []interface{}{}).Optional()');
  });

  it('generates a Json object field when explicitly annotated with @ent.json object', () => {
    const fields = [
      makeField({ name: 'config', type: 'Json', isRequired: true, documentation: '@ent.json object' }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toBe('field.JSON("config", map[string]interface{}{})');
  });

  it('preserves other documentation alongside @ent.json annotation', () => {
    const fields = [
      makeField({
        name: 'history',
        type: 'Json',
        isRequired: false,
        documentation: 'List of previous actions\n@ent.json array',
      }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toBe('field.JSON("history", []interface{}{}).Optional()');
  });

  it('defaults Json field to object when no @ent.json annotation exists', () => {
    const fields = [
      makeField({ name: 'settings', type: 'Json', isRequired: true, documentation: 'General settings blob' }),
    ];
    const imports = createEmptyImports();
    const lines = generateFields(fields, new Set(), emptyEnumDefs, imports);
    expect(lines[0]).toBe('field.JSON("settings", map[string]interface{}{})');
  });

  it('includes FK fields as regular fields', () => {
    const fields = [
      makeField({ name: 'authorId', type: 'Int' }),
    ];
    const fkNames = new Set(['authorId']);
    const imports = createEmptyImports();
    const lines = generateFields(fields, fkNames, emptyEnumDefs, imports);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('field.Int("authorId")');
  });
});

describe('parseJsonTypeAnnotation', () => {
  it('returns "object" for undefined documentation', () => {
    expect(parseJsonTypeAnnotation(undefined)).toBe('object');
  });

  it('returns "object" for empty documentation', () => {
    expect(parseJsonTypeAnnotation('')).toBe('object');
  });

  it('returns "object" for documentation without @ent.json', () => {
    expect(parseJsonTypeAnnotation('Some field description')).toBe('object');
  });

  it('parses @ent.json array', () => {
    expect(parseJsonTypeAnnotation('@ent.json array')).toBe('array');
  });

  it('parses @ent.json object', () => {
    expect(parseJsonTypeAnnotation('@ent.json object')).toBe('object');
  });

  it('parses annotation embedded in multiline documentation', () => {
    expect(parseJsonTypeAnnotation('A list of tags\n@ent.json array\nMore docs')).toBe('array');
  });

  it('defaults to object for unrecognized @ent.json value', () => {
    expect(parseJsonTypeAnnotation('@ent.json map')).toBe('object');
  });
});
