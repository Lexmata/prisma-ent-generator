# prisma-ent-generator

A [Prisma](https://www.prisma.io/) generator that produces a complete [Go Ent](https://entgo.io/) installation from your Prisma schema.

Define your data model once in Prisma and generate fully working Ent schemas — including fields, edges, enums, and the `generate.go` / `entc.go` scaffolding needed to run `go generate`.

## Features

- **Full Ent install** — generates `generate.go`, `entc.go`, and `schema/*.go` so you can immediately run `go generate ./ent`
- **Environment variable toggle** — controlled by `GENERATE_ENT`; skips when unset or `false`, runs when set to `true`
- **Scalar type mapping** — `String`, `Int`, `BigInt`, `Float`, `Decimal`, `Boolean`, `DateTime`, `Json`, `Bytes`
- **Enum support** — Prisma enums map to inline `field.Enum(...).Values(...)` with defaults
- **Relationship edges** — O2O, O2M, and M2M relations are translated to `edge.To` / `edge.From` with correct ownership, `.Ref()`, `.Unique()`, and `.Required()`
- **FK edge fields** — foreign key scalars are included in `Fields()` and bound to edges via `.Field()`
- **Defaults** — `@default(now())`, `@default(uuid())`, `@default(autoincrement())`, `@default(false)`, `@default(0)`, `@default("value")`, and enum defaults
- **@updatedAt** — maps to `.Default(time.Now).UpdateDefault(time.Now)`
- **UUID IDs** — `@id @default(uuid())` generates `field.UUID("id", uuid.UUID{}).Default(uuid.New)`
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
  provider = "@lexmata/prisma-ent-generator"
  output   = "./ent"
}
```

### 2. Run Prisma generate with the environment variable

```bash
GENERATE_ENT=true npx prisma generate
```

Without `GENERATE_ENT=true`, the generator prints a skip message and produces no output:

```
prisma-ent-generator: Skipping — set GENERATE_ENT=true to enable.
```

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
| `Json` | `field.JSON` | Second arg: `map[string]interface{}{}` |
| `Bytes` | `field.Bytes` | |
| Enums | `field.Enum` | Inline `.Values(...)` |

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
