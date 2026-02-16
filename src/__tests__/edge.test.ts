import { describe, it, expect } from 'vitest';
import type { DMMF } from '@prisma/generator-helper';
import { generateEdges } from '../helpers/edge';
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

/**
 * Helper to create a minimal DMMF.Model for testing.
 */
function makeModel(name: string, fields: DMMF.Field[]): DMMF.Model {
  return {
    name,
    fields,
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    dbName: null,
  } as unknown as DMMF.Model;
}

describe('generateEdges', () => {
  it('generates edge.To for O2M (owner side without FK)', () => {
    const userModel = makeModel('User', [
      makeField({
        name: 'posts',
        kind: 'object',
        type: 'Post',
        isList: true,
        relationName: 'UserPosts',
        relationFromFields: [],
        relationToFields: [],
      }),
    ]);
    const postModel = makeModel('Post', [
      makeField({
        name: 'author',
        kind: 'object',
        type: 'User',
        isList: false,
        relationName: 'UserPosts',
        relationFromFields: ['authorId'],
        relationToFields: ['id'],
      }),
    ]);

    const imports = createEmptyImports();
    const edges = generateEdges(userModel, [userModel, postModel], imports);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toBe('edge.To("posts", Post.Type)');
    expect(imports.edge).toBe(true);
  });

  it('generates edge.From for O2M (FK-holding side)', () => {
    const userModel = makeModel('User', [
      makeField({
        name: 'posts',
        kind: 'object',
        type: 'Post',
        isList: true,
        relationName: 'UserPosts',
        relationFromFields: [],
        relationToFields: [],
      }),
    ]);
    const postModel = makeModel('Post', [
      makeField({
        name: 'author',
        kind: 'object',
        type: 'User',
        isList: false,
        isRequired: true,
        relationName: 'UserPosts',
        relationFromFields: ['authorId'],
        relationToFields: ['id'],
      }),
      makeField({ name: 'authorId', type: 'Int' }),
    ]);

    const imports = createEmptyImports();
    const edges = generateEdges(postModel, [userModel, postModel], imports);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toContain('edge.From("author", User.Type)');
    expect(edges[0]).toContain('.Ref("posts")');
    expect(edges[0]).toContain('.Unique()');
    expect(edges[0]).toContain('.Field("authorId")');
    expect(edges[0]).toContain('.Required()');
  });

  it('generates edge.To with Unique for O2O (owner side)', () => {
    const userModel = makeModel('User', [
      makeField({
        name: 'profile',
        kind: 'object',
        type: 'Profile',
        isList: false,
        relationName: 'UserProfile',
        relationFromFields: [],
        relationToFields: [],
      }),
    ]);
    const profileModel = makeModel('Profile', [
      makeField({
        name: 'user',
        kind: 'object',
        type: 'User',
        isList: false,
        isRequired: true,
        relationName: 'UserProfile',
        relationFromFields: ['userId'],
        relationToFields: ['id'],
      }),
    ]);

    const imports = createEmptyImports();
    const edges = generateEdges(userModel, [userModel, profileModel], imports);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toBe('edge.To("profile", Profile.Type).Unique()');
  });

  it('generates edge.From with Unique for O2O (FK side)', () => {
    const userModel = makeModel('User', [
      makeField({
        name: 'profile',
        kind: 'object',
        type: 'Profile',
        isList: false,
        relationName: 'UserProfile',
        relationFromFields: [],
        relationToFields: [],
      }),
    ]);
    const profileModel = makeModel('Profile', [
      makeField({
        name: 'user',
        kind: 'object',
        type: 'User',
        isList: false,
        isRequired: true,
        relationName: 'UserProfile',
        relationFromFields: ['userId'],
        relationToFields: ['id'],
      }),
    ]);

    const imports = createEmptyImports();
    const edges = generateEdges(profileModel, [userModel, profileModel], imports);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toContain('edge.From("user", User.Type)');
    expect(edges[0]).toContain('.Ref("profile")');
    expect(edges[0]).toContain('.Unique()');
    expect(edges[0]).toContain('.Required()');
  });

  it('generates M2M edges with alphabetical ownership', () => {
    const postModel = makeModel('Post', [
      makeField({
        name: 'tags',
        kind: 'object',
        type: 'Tag',
        isList: true,
        relationName: 'PostTags',
        relationFromFields: [],
        relationToFields: [],
      }),
    ]);
    const tagModel = makeModel('Tag', [
      makeField({
        name: 'posts',
        kind: 'object',
        type: 'Post',
        isList: true,
        relationName: 'PostTags',
        relationFromFields: [],
        relationToFields: [],
      }),
    ]);

    // Post < Tag alphabetically, so Post owns with edge.To
    const postImports = createEmptyImports();
    const postEdges = generateEdges(postModel, [postModel, tagModel], postImports);
    expect(postEdges).toHaveLength(1);
    expect(postEdges[0]).toBe('edge.To("tags", Tag.Type)');

    // Tag gets edge.From
    const tagImports = createEmptyImports();
    const tagEdges = generateEdges(tagModel, [postModel, tagModel], tagImports);
    expect(tagEdges).toHaveLength(1);
    expect(tagEdges[0]).toContain('edge.From("posts", Post.Type)');
    expect(tagEdges[0]).toContain('.Ref("tags")');
  });

  it('skips scalar fields', () => {
    const model = makeModel('User', [
      makeField({ name: 'email', type: 'String' }),
    ]);
    const imports = createEmptyImports();
    const edges = generateEdges(model, [model], imports);
    expect(edges).toHaveLength(0);
    expect(imports.edge).toBe(false);
  });

  it('handles models with no relation fields', () => {
    const model = makeModel('Tag', [
      makeField({ name: 'name', type: 'String', isUnique: true }),
    ]);
    const imports = createEmptyImports();
    const edges = generateEdges(model, [model], imports);
    expect(edges).toHaveLength(0);
  });
});
