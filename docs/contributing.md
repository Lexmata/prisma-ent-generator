# Contributing to prisma-ent-generator

## Setup

```bash
git clone <repo-url>
cd prisma-ent-generator
pnpm install
pnpm build
pnpm test
```

## How the Generator Works

The Prisma CLI invokes this generator as a child process when you run `prisma generate`. Prisma passes the full DMMF (Data Model Meta Format) -- a JSON representation of your entire schema -- to the generator's `onGenerate` handler in `src/bin.ts`.

The main flow:

1. **`bin.ts`** -- registers the generator with `@prisma/generator-helper` and calls `generate()`.
2. **`generator.ts`** -- checks `isEnabled`, resolves the output directory, orchestrates file writes.
3. **`helpers/schema.ts`** -- assembles a complete Go schema file per Prisma model by calling into field.ts, edge.ts, and type-map.ts.
4. **`helpers/field.ts`** -- converts each Prisma field to an Ent field builder call.
5. **`helpers/edge.ts`** -- converts Prisma relations to Ent edge definitions with correct ownership.
6. **`helpers/type-map.ts`** -- maps Prisma scalar types to Ent field types and tracks Go imports.
7. **`helpers/entfiles.ts`** -- generates the `generate.go` and `entc.go` scaffolding files.

## Adding a New Type Mapping

To support a new Prisma scalar type (or change how an existing one maps to Ent):

1. **Edit `src/helpers/type-map.ts`** -- add or modify the entry in `PRISMA_TO_ENT_FIELD`:

   ```typescript
   const PRISMA_TO_ENT_FIELD: Record<string, string> = {
     // ...existing mappings...
     YourNewType: 'EntFieldMethod',
   };
   ```

2. **Handle imports** -- if the new type requires a Go import (like `DateTime` requires `"time"`), update `requiresTimeImport()` or add a new import-tracking function and wire it into `field.ts` where the import tracker is set.

3. **Add tests** in `src/__tests__/type-map.test.ts`:

   ```typescript
   it('maps YourNewType to EntFieldMethod', () => {
     expect(mapPrismaTypeToEnt('YourNewType')).toBe('EntFieldMethod');
   });
   ```

4. **Add a field-level test** in `src/__tests__/field.test.ts` to verify the full field line is generated correctly with any needed modifiers (`.Optional()`, `.Default()`, etc.).

5. **Update the README** type mapping table.

6. Run `pnpm test` to verify.

## Adding Support for a New Default Kind

Prisma default functions (like `now()`, `uuid()`, `autoincrement()`) are handled in the `formatDefault` function in `src/helpers/field.ts`. To add a new one:

1. Add a new `case` in the `switch (funcDefault.name)` block.
2. Return the appropriate Ent `.Default(...)` or `.DefaultFunc(...)` call.
3. Set any needed import flags on the `imports` object.
4. Add tests in `src/__tests__/field.test.ts`.

## Adding a New Edge Pattern

Edge ownership logic lives in `src/helpers/edge.ts`. The three cases are:

- **FK on this model** -- `buildEdgeFrom()` (back-reference)
- **FK on target model** -- `buildEdgeTo()` (ownership)
- **No FK on either side** -- `buildImplicitEdge()` (M2M, alphabetical tiebreaker)

If Prisma introduces a new relation pattern, add a new branch in `generateEdge()` and corresponding tests in `src/__tests__/edge.test.ts`.

## Testing Locally Against a Real Schema

The `prisma/schema.prisma` file in this repo is an example schema you can use for local testing:

```bash
pnpm build
GENERATE_ENT=true npx prisma generate --schema=prisma/schema.prisma
```

Inspect the generated files in the output directory configured in that schema. Schema files (`schema/*.go`) are always overwritten; `generate.go` and `entc.go` are only written if they do not already exist.

## Code Style

- TypeScript strict mode is enabled.
- All exported functions have JSDoc comments.
- Tests use Vitest with `globals: true` (no explicit `import { describe, it }` needed, though they are used).
- Commits follow Conventional Commits format.

## Submitting Changes

1. Create a feature branch from `develop`.
2. Make your changes with tests.
3. Run `pnpm test` and `pnpm build` to verify.
4. Open a PR against `develop`.
