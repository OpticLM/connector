# CLAUDE.md

## Build & Development Commands

- Read `package.json` to check available commands.
- Use `jj` VCS instead of `git`. When fetching diff, use `jj diff --git` instead of `jj diff` or `git diff`.

## Architecture

This is a TypeScript SDK that bridges Language Server Protocol (LSP) capabilities with Model Context Protocol (MCP), enabling IDE plugins to expose IDE features (go-to-definition, find-references, diagnostics, etc.) to AI models.

### Data Flow

```
LLM request (fuzzy position)
  -> Zod validation
  -> SymbolResolver (fuzzy -> exact)
  -> IDE capability provider
  -> Structured JSON + text response
```

### Testing

Test files live alongside source (`src/*.test.ts`). Shared mocks are in `server.fixtures.ts`.

### Dependencies

- MCP SDK (`@modelcontextprotocol/sdk`) and Zod are **peer dependencies**
- Build uses tsup producing dual ESM/CJS output
- Code style: Biome with single quotes, no semicolons, trailing commas, LF line endings
