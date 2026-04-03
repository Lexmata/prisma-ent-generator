# Troubleshooting

## Generator Does Not Produce Output

**Symptom:** Running `prisma generate` prints "Skipping" and produces no files.

**Cause:** The `GENERATE_ENT` environment variable is not set to `"true"`.

**Fix:** Set the variable explicitly:

```bash
GENERATE_ENT=true npx prisma generate
```

If you are using a custom variable name in your generator config (`isEnabled = env("MY_VAR")`), set that variable instead.

## `generate.go` or `entc.go` Not Updating

**Symptom:** You changed the Prisma schema but `generate.go` or `entc.go` still have old content.

**Cause:** These two files are **only written if they do not already exist**. This is by design so that your manual customizations (e.g., adding Ent extensions in `entc.go`) are preserved across re-runs.

**Fix:** Delete the file you want regenerated and run the generator again:

```bash
rm ent/generate.go ent/entc.go
GENERATE_ENT=true npx prisma generate
```

Schema files in `ent/schema/*.go` are always overwritten.

## BigInt Maps to `field.Int64`, Not `field.Int`

**Symptom:** A Prisma `BigInt` field generates `field.Int64(...)` in Ent, but the README type mapping table says `field.Int`.

**Cause:** The README table was simplified. The actual mapping is `BigInt` to `field.Int64` (int64 in Go). The `Int` mapping is for Prisma `Int` (int32).

This is correct behavior. Ent's `field.Int` is 32-bit; `field.Int64` is 64-bit, which matches Prisma's BigInt semantics.

## JSON Fields Default to `map[string]interface{}{}`

**Symptom:** A `Json` field generates `field.JSON("name", map[string]interface{}{})` but you expected an array type.

**Cause:** Without an explicit `@ent.json` annotation, the generator defaults to the object type.

**Fix:** Add a doc comment annotation to your Prisma field:

```prisma
model Example {
  /// @ent.json array
  tags Json?
}
```

See the README section on JSON Type Annotations for details.

## Go Keyword Conflicts

**Symptom:** A Prisma model named `Type` or `Map` generates a Go struct named `TypeEntity` or `MapEntity`.

**Cause:** The generator appends `Entity` to model names that would conflict with Go reserved keywords (`type`, `map`, `interface`, `func`, etc.). This prevents compilation errors.

This is expected behavior. The Go file name also uses the suffixed form (e.g., `type_entity.go`).

## FK Fields Marked Optional When Relation Is Optional

**Symptom:** A foreign key field that is `Int` (not `Int?`) in Prisma gets `.Optional()` in the generated Ent schema.

**Cause:** Ent requires FK field optionality to match edge optionality. If the relation field (e.g., `author User?`) is optional, the generator marks the FK scalar field (e.g., `authorId Int`) as `.Optional()` too, even if Prisma does not mark it as optional.

This is correct behavior -- without it, Ent would reject the schema at compile time.

## UUID Fields Not Detected

**Symptom:** A `String @id @default(uuid())` field does not generate `field.UUID(...)`.

**Cause:** UUID detection looks for either `@db.Uuid` native type annotation or a `uuid()` default function. If you have a plain `String @id` without either marker, it will generate `field.String("id")` instead.

**Fix:** Add `@default(uuid())` or `@db.Uuid` to your ID field:

```prisma
model Example {
  id String @id @default(uuid()) @db.Uuid
}
```
