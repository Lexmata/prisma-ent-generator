# prisma-ent-generator

A [Prisma](https://www.prisma.io/) generator that produces a complete [Go Ent](https://entgo.io/) installation from your Prisma schema.

Define your data model once in Prisma and generate fully working Ent schemas — including fields, edges, enums, and the `generate.go` / `entc.go` scaffolding needed to run `go generate`.

## Features

- **Full Ent install** — generates `generate.go`, `entc.go`, and `schema/*.go` so you can immediately run `go generate ./ent`
- **Environment variable toggle** — controlled by `isEnabled = env("GENERATE_ENT")` in the generator config; skips when unset or `false`, runs when `true`
- **Scalar type mapping** — `String`, `Int`, `BigInt`, `Float`, `Decimal`, `Boolean`, `DateTime`, `Json`, `Bytes`
- **Enum support** — Prisma enums map to inline `field.Enum(...).Values(...)` with defaults
- **Relationship edges** — O2O, O2M, and M2M relations are translated to `edge.To` / `edge.From` with correct ownership, `.Ref()`, `.Unique()`, and `.Required()`
- **FK edge fields** — foreign key scalars are included in `Fields()` and bound to edges via `.Field()`
- **Defaults** — `@default(now())`, `@default(uuid())`, `@default(autoincrement())`, `@default(false)`, `@default(0)`, `@default("value")`, and enum defaults
- **@updatedAt** — maps to `.Default(time.Now).UpdateDefault(time.Now)`
- **UUID IDs** — `@id @default(uuid())` generates `field.UUID("id", uuid.UUID{}).Default(uuid.New)`
- **JSON type annotations** — annotate `Json` fields with `/// @ent.json array` or `/// @ent.json object` to control the Go type (`[]interface{}{}` vs `map[string]interface{}{}`); defaults to object
- **Optional / Nillable** — optional fields get `.Optional().Nillable()` (except JSON, which only gets `.Optional()`)

## Installation

```bash
npm install @lexmata/prisma-ent-generator
# or
pnpm add @lexmata/prisma-ent-generator
```

## Usage

### 1. Add the generator to your Prisma schema

```prisma
generator ent {
  provider  = "@lexmata/prisma-ent-generator"
  output    = "./ent"
  isEnabled = env("GENERATE_ENT")
}
```

### 2. Run Prisma generate with the environment variable

```bash
GENERATE_ENT=true npx prisma generate
```

When `isEnabled` resolves to anything other than `"true"`, the generator prints a skip message and produces no output:

```
prisma-ent-generator: Skipping — set isEnabled = env("GENERATE_ENT") to "true" in your generator config.
```

You can use any environment variable name you like — just change the `env()` argument accordingly.

### 3. Run Ent code generation

```bash
cd your-go-project
go generate ./ent
```

This triggers Ent's own pipeline via the generated `generate.go`, producing the full client, queries, mutations, migrations, and predicates.

## Output Structure

```
ent/
├── generate.go          # go:generate directive for Ent codegen
├── entc.go              # Ent codegen configuration (build-tag guarded)
└── schema/
    ├── user.go           # One file per Prisma model
    ├── post.go
    ├── profile.go
    └── tag.go
```

`generate.go` and `entc.go` are only written if they don't already exist, so your customizations are preserved across re-runs. Schema files are always overwritten.

## Example

Given this Prisma schema:

```prisma
enum Role {
  USER
  ADMIN
  MODERATOR
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  author   User   @relation(fields: [authorId], references: [id])
  authorId Int
  tags     Tag[]
  /// @ent.json object
  metadata Json?
  /// @ent.json array
  labels   Json?
}

model Tag {
  id    Int    @id @default(autoincrement())
  name  String @unique
  posts Post[]
}
```

The generator produces:

**`ent/schema/user.go`**

```go
package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/edge"

	"time"
)

type User struct {
	ent.Schema
}

func (User) Fields() []ent.Field {
	return []ent.Field{
		field.String("email").Unique(),
		field.String("name").Optional().Nillable(),
		field.Enum("role").Values("USER", "ADMIN", "MODERATOR").Default("USER"),
		field.Time("created_at").Default(time.Now),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("posts", Post.Type),
	}
}
```

**`ent/schema/post.go`**

```go
package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/edge"
)

type Post struct {
	ent.Schema
}

func (Post) Fields() []ent.Field {
	return []ent.Field{
		field.String("title"),
		field.Int("author_id"),
		field.JSON("metadata", map[string]interface{}{}).Optional(),
		field.JSON("labels", []interface{}{}).Optional(),
	}
}

func (Post) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("author", User.Type).Ref("posts").Unique().Field("author_id").Required(),
		edge.To("tags", Tag.Type),
	}
}
```

## Type Mapping

| Prisma Type | Ent Field | Notes |
|---|---|---|
| `String` | `field.String` | |
| `Boolean` | `field.Bool` | |
| `Int` | `field.Int` | |
| `BigInt` | `field.Int` | int64 in Go |
| `Float` | `field.Float` | |
| `Decimal` | `field.Float` | float64 in Go |
| `DateTime` | `field.Time` | Imports `"time"` |
| `Json` | `field.JSON` | `map[string]interface{}{}` or `[]interface{}{}`; see [JSON type annotations](#json-type-annotations) |
| `Bytes` | `field.Bytes` | |
| Enums | `field.Enum` | Inline `.Values(...)` |

## JSON Type Annotations

Prisma's `Json` type doesn't distinguish between objects and arrays. Use `///` doc comments with the `@ent.json` directive to control the Go type emitted in the Ent schema:

```prisma
model Post {
  /// @ent.json object
  metadata Json?           // → field.JSON("metadata", map[string]interface{}{})

  /// @ent.json array
  labels   Json?           // → field.JSON("labels", []interface{}{})

  config   Json            // → field.JSON("config", map[string]interface{}{})  (default)
}
```

| Annotation | Go Type | When to use |
|---|---|---|
| `@ent.json object` | `map[string]interface{}{}` | JSON objects / key-value maps |
| `@ent.json array` | `[]interface{}{}` | JSON arrays / lists |
| *(none)* | `map[string]interface{}{}` | Defaults to object |

The annotation can appear alongside other documentation comments — the generator looks for the `@ent.json` directive anywhere in the field's doc block.

## Edge Mapping

| Prisma Relation | Ent Edge |
|---|---|
| O2O (owner side) | `edge.To("name", Type.Type).Unique()` |
| O2O (FK side) | `edge.From("name", Type.Type).Ref("...").Unique().Field("fk")` |
| O2M (owner side) | `edge.To("name", Type.Type)` |
| O2M (FK side) | `edge.From("name", Type.Type).Ref("...").Unique().Field("fk")` |
| M2M (owner side) | `edge.To("name", Type.Type)` |
| M2M (inverse side) | `edge.From("name", Type.Type).Ref("...")` |

M2M ownership is determined alphabetically by model name when neither side holds a FK.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

To test generation locally:

```bash
pnpm build
GENERATE_ENT=true npx prisma generate --schema=prisma/schema.prisma
```

## License

MIT - [Lexmata LLC](mailto:jquinn@lexmata.ai)
