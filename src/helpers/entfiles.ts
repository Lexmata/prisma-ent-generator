import { fileHeader } from '../utils';

/**
 * Generate the contents of `generate.go` — the standard Ent entry point
 * that enables `go generate ./ent` to trigger Ent's own code generation.
 *
 * This file is placed in the ent root directory (e.g. `./ent/generate.go`).
 */
export function generateGenerateGo(): string {
  const lines: string[] = [];

  lines.push(fileHeader());
  lines.push('package ent');
  lines.push('');
  lines.push('//go:generate go run -mod=mod entgo.io/ent/cmd/ent generate ./schema');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate the contents of `entc.go` — the Ent codegen configuration file.
 *
 * This file is guarded by the `ignore` build tag so it is only executed
 * during code generation (via `go generate`) and not during normal builds.
 *
 * Users can customise this file to add features, hooks, or extensions
 * to the Ent code generation pipeline.
 */
export function generateEntcGo(): string {
  const lines: string[] = [];

  lines.push(fileHeader());
  lines.push('//go:build ignore');
  lines.push('');
  lines.push('package main');
  lines.push('');
  lines.push('import (');
  lines.push('\t"log"');
  lines.push('');
  lines.push('\t"entgo.io/ent/entc"');
  lines.push('\t"entgo.io/ent/entc/gen"');
  lines.push(')');
  lines.push('');
  lines.push('func main() {');
  lines.push('\terr := entc.Generate("./schema", &gen.Config{})');
  lines.push('\tif err != nil {');
  lines.push('\t\tlog.Fatalf("running ent codegen: %v", err)');
  lines.push('\t}');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}
