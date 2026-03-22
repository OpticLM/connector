# MCP LSP Driver SDK

A TypeScript SDK that bridges Language Server Protocol (LSP) capabilities with the Model Context Protocol (MCP). Designed for IDE plugin developers building AI-assisted coding tools for VS Code, JetBrains, and other editors.

## Core Philosophy

- **Fuzzy-to-Exact Resolution**: LLMs interact via semantic anchors (`symbolName`, `lineHint`), and the SDK resolves them to precise coordinates
- **Disk-Based Truth**: All read operations reflect the state of files on disk, ignoring unsaved IDE buffers
- **High Abstraction**: Beyond LSP, it also provides functionality related to something like dual chains (graph capability) and metadata (frontmatter capability).

## Installation

```bash
npm install mcp-lsp-driver
# or
pnpm add mcp-lsp-driver
```

## Quick Start

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { installMcpLspDriver, type IdeCapabilities } from 'mcp-lsp-driver'
import * as fs from 'fs/promises'

// 1. Create your MCP server
const server = new McpServer({
  name: 'my-ide-mcp-server',
  version: '1.0.0'
})

// 2. Implement File Access (required)
const fileAccess = {
  readFile: async (uri: string) => {
    return await fs.readFile(uri, 'utf-8')
  },

  readDirectory: (uri: string) => yourIDE.workspace.readDirectory(uri)
}

// 3. Implement Edit Provider (required for edits)
const edit = {
  // Option 1: Preview and apply with user approval
  previewAndApplyEdits: async (operation) => {
    // Show diff in your IDE and get user approval
    return await showDiffDialog(operation)
  },
  // Option 2: Apply directly without preview (use one or both)
  applyEdits: async (operation) => {
    // Apply edits directly
    return await yourIDE.applyEdits(operation)
  }
}

// 4. Implement LSP Capability Providers
const definition = {
  provideDefinition: async (uri, position) => {
    // Call your IDE's LSP to get definition
    return await lspClient.getDefinition(uri, position)
  }
}

const diagnostics = {
  provideDiagnostics: async (uri) => {
    // Get diagnostics from your IDE for the file
    return await lspClient.getDiagnostics(uri)
  },
  getWorkspaceDiagnostics: async () => {
    // Optional: Get all diagnostics in the workspace
    return await lspClient.getWorkspaceDiagnostics()
  }
}

const outline = {
  provideDocumentSymbols: async (uri) => {
    // Get document symbols from your IDE
    return await lspClient.getDocumentSymbols(uri)
  }
}

// 5. Register LSP tools and resources on the server
const capabilities: IdeCapabilities = {
  fileAccess,
  edit,
  definition,
  diagnostics: {
    ...diagnostics,
    onDiagnosticsChanged: (callback) => {
      // Register for diagnostic changes
      yourIDE.onDiagnosticsChanged((uri) => callback(uri))
    },
  },
  outline,
  filesystem,
  // Add more capabilities as needed
}

installMcpLspDriver({ server, capabilities })

// 6. Connect to transport (you control the server lifecycle)
const transport = new StdioServerTransport()
await server.connect(transport)
```

## MCP Tools

The SDK automatically registers tools based on which capabilities you provide:

### `goto_definition`

Navigate to the definition of a symbol.

**Inputs:**
- `uri`: File path or URI
- `symbol_name`: Text of the symbol to find
- `line_hint`: Approximate line number (1-based)
- `order_hint`: Which occurrence if symbol appears multiple times (0-based, default: 0)

### `find_references`

Find all references to a symbol.

**Inputs:** Same as `goto_definition`

### `call_hierarchy`

Get call hierarchy for a function or method.

**Inputs:**
- Same as `goto_definition`, plus:
- `direction`: `'incoming'` (callers) or `'outgoing'` (callees)

### `apply_edit`

Apply a text edit to a file using hashline references (requires user approval).

The `files://` resource returns file content in **hashline format** — each line is prefixed with `<line>:<hash>|`, where the hash is a 2-char CRC16 digest of the line's content. To edit a file, reference lines by these hashes. If the file has changed since the last read, the hashes won't match and the edit is rejected, preventing stale overwrites.

**Inputs:**
- `uri`: File path or URI
- `start_hash`: Line reference with hash from file read (e.g., `"3:a1"`)
- `end_hash`: End line reference for multi-line edits (e.g., `"5:0e"`). Defaults to `start_hash` for single-line edits
- `replace_text`: New text to insert
- `description`: Rationale for the edit

### `global_find`

Search for text across the entire workspace.

**Inputs:**
- `query`: The search query (required)
- `case_sensitive`: Whether the search is case-sensitive (optional, default: false)
- `exact_match`: Whether to match exact words only (optional, default: false)
- `regex_mode`: Whether the query is a regular expression (optional, default: false)

**Returns:**
- Array of matches with file URI, line, column, matching text, and context
- Total number of matches found

### `get_link_structure`

Get all links in the workspace, showing relationships between documents.

**Inputs:** None

**Returns:**
- Array of links with source URI, target URI, subpath, display text, resolved status, line, and column

### `add_link`

Add a link to a document by finding a text pattern and replacing it with a link.

**Inputs:**
- `path`: The path to the document to modify
- `pattern`: The text pattern to find and replace with a link
- `link_to`: The target URI the link should point to

**Returns:**
- Success status and message

### `get_frontmatter_structure`

Get frontmatter property values across documents.

**Inputs:**
- `property`: The frontmatter property name to search for (required)
- `path`: Optional path to limit the search to a specific document

**Returns:**
- Array of matches with path and value

### `set_frontmatter`

Set a frontmatter property on a document.

**Inputs:**
- `path`: The path to the document to modify (required)
- `property`: The frontmatter property name to set (required)
- `value`: The value to set. Can be a string, number, boolean, array of these types, or null to remove the property.

**Returns:**
- Success status and message

## MCP Resources

The SDK automatically registers resources based on which capabilities you provide:

### `diagnostics://{path}`

Get diagnostics (errors, warnings) for a specific file.

**Resource URI Pattern:** `diagnostics://{+path}`

**Example:** `diagnostics://src/main.ts`

Returns diagnostics formatted as markdown with location, severity, and message information.

**Subscription Support:** If your `DiagnosticsProvider` implements `onDiagnosticsChanged`, these resources become subscribable. When diagnostics change, the driver sends resource update notifications.

### `diagnostics://workspace`

Get diagnostics across the entire workspace.

**Resource URI:** `diagnostics://workspace`

Only available if your `DiagnosticsProvider` implements the optional `getWorkspaceDiagnostics()` method.

Returns workspace diagnostics grouped by file, formatted as markdown.

**Subscription Support:** If your `DiagnosticsProvider` implements `onDiagnosticsChanged`, this resource becomes subscribable.

### `outline://{path}`

Get the document outline (symbol tree) for a file.

**Resource URI Pattern:** `outline://{+path}`

**Example:** `outline://src/components/Button.tsx`

Returns document symbols formatted as a hierarchical markdown outline, including:
- Symbol names and kinds (class, function, method, etc.)
- Source locations
- Nested children (e.g., methods within classes)

No subscription support for this resource (read-only).

### `files://{path}`

For directories: returns directory children (git-ignored files excluded, similar to `ls`). For files: returns content in **hashline format** with optional line range and regex filtering.

**Hashline format:** Each line is prefixed with `<line>:<hash>|`, where `<line>` is the 1-based line number and `<hash>` is a 2-char CRC16 hex digest of the line content. For example:

```
1:a3|function hello() {
2:f1|  return "world"
3:0e|}
```

These hashes serve as content-addressed anchors for the `apply_edit` tool — if the file changes between read and edit, the hash mismatch is detected and the edit is safely rejected.

**Resource URI Pattern:** `files://{+path}`

**Example:** `files://src`, `files://src/index.ts`, `files://src/index.ts#L1-L2`, `files://src/index.ts?pattern=^import`, `files://src/index.ts?pattern=TODO#L10-L50`

No subscription support for this resource (read-only).

### `outlinks://{path}`

Get outgoing links from a specific file.

**Resource URI Pattern:** `outlinks://{+path}`

**Example:** `outlinks://notes/index.md`

Returns a JSON array of links originating from the specified document.

No subscription support for this resource (read-only).

### `backlinks://{path}`

Get incoming links (backlinks) to a specific file.

**Resource URI Pattern:** `backlinks://{+path}`

**Example:** `backlinks://notes/topic-a.md`

Returns a JSON array of links pointing to the specified document.

No subscription support for this resource (read-only).

### `frontmatter://{path}`

Get frontmatter metadata for a specific file.

**Resource URI Pattern:** `frontmatter://{+path}`

**Example:** `frontmatter://notes/index.md`

Returns a JSON object containing all frontmatter properties and values for the document.

No subscription support for this resource (read-only).

## Subscription and Change Notifications

Providers can implement optional `onDiagnosticsChanged` and `onFileChanged` callbacks to make resources subscribable:

```typescript
const capabilities: IdeCapabilities = {
  fileAccess: {
    readFile: async (uri) => { /* ... */ },
    readDirectory: async (path) => { /* ... */ },
    onFileChanged: (callback) => {
      // Register your IDE's file change listener
      yourIDE.onFileChanged((uri) => callback(uri))
    },
  },
  diagnostics: {
    provideDiagnostics: async (uri) => { /* ... */ },
    getWorkspaceDiagnostics: async () => { /* ... */ },
    onDiagnosticsChanged: (callback) => {
      // Register your IDE's diagnostic change listener
      yourIDE.onDiagnosticsChanged((uri) => callback(uri))
    },
  },
}
```

When diagnostics or files change, call the registered callback with the affected file URI. The driver will send MCP resource update notifications to subscribers.

## Symbol Resolution

The SDK uses a robust algorithm to handle imprecise LLM positioning:

1. Target the `lineHint` (converting 1-based to 0-based)
2. Search for `symbolName` in that line
3. **Robustness Fallback**: If not found, scan +/- 2 lines (configurable)
4. Use `orderHint` to select the Nth occurrence if needed

Configure the search radius:

```typescript
installMcpLspDriver({ server, capabilities, config: {
  resolverConfig: {
    lineSearchRadius: 5  // Default: 2
  }
}})
```

## Merging Capabilities

When you have multiple providers (e.g., an LSP client and a pipe connection), use `mergeCapabilities` to combine them into a single `IdeCapabilities` object. Pass a fallback `FileAccessProvider` that is used when none of the partials supply one.

```typescript
import { mergeCapabilities, installMcpLspDriver } from 'mcp-lsp-driver'
import type { PartialIdeCapabilities } from 'mcp-lsp-driver'

const lspCaps: PartialIdeCapabilities = {
  definition: lsp.definition,
  references: lsp.references,
}

const pipeCaps: PartialIdeCapabilities = {
  diagnostics: pipeDiagnostics,
  outline: pipeOutline,
}

const fallbackFileAccess = {
  readFile: (uri) => fs.readFile(uri, 'utf-8'),
  readDirectory: async () => [],
}

const merged = mergeCapabilities([lspCaps, pipeCaps], fallbackFileAccess)

installMcpLspDriver({ server, capabilities: merged })
```

- **Read providers** (definition, references, hierarchy, diagnostics, outline, globalFind, graph, frontmatter) concat their results via `Promise.all` + `flat`.
- **Write/mutation providers** (edit, `addLink`, `setFrontmatter`) use the first available ("first wins").
- **`onDiagnosticsChanged`** and **`onFileChanged`** register the callback on every provider that supplies them.
- **`fileAccess`** uses the first partial that provides it, falling back to the `fallbackFileAccess` argument.

## Type Definitions

### Position Types

```typescript
// 0-based exact coordinates (internal)
interface ExactPosition {
  line: number
  character: number
}

// Fuzzy position from LLM
interface FuzzyPosition {
  symbolName: string
  lineHint: number      // 1-based
  orderHint?: number    // 0-based, default: 0
}

// Range on disk
interface DiskRange {
  start: ExactPosition
  end: ExactPosition
}
```

### Result Types

```typescript
interface CodeSnippet {
  uri: UnifiedUri
  range: DiskRange
  content: string
}

interface Diagnostic {
  uri: UnifiedUri
  range: DiskRange
  severity: 'error' | 'warning' | 'information' | 'hint'
  message: string
  source?: string
  code?: string | number
}

interface Link {
  sourceUri: UnifiedUri
  targetUri: UnifiedUri
  subpath?: string
  displayText?: string
  resolved: boolean
  line: number
  column: number
}

type EditResult =
  | { success: true; message: string }
  | { success: false; message: string; reason: 'UserRejected' | 'IOError' | 'ValidationFailed' }
```

## Pipe IPC (Out-of-Process)

When the MCP server runs in a separate process from the IDE plugin (e.g., spawned via stdio transport), the Pipe IPC layer lets the two communicate over a named pipe.

**IDE plugin side** — expose capabilities:

```typescript
import { serveLspPipe, type IdeCapabilities } from 'mcp-lsp-driver'

const capabilities: IdeCapabilities = {
  fileAccess: { /* ... */ },
  definition: { /* ... */ },
  // ...
}

const server = await serveLspPipe({
  pipeName: 'my-ide-lsp',
  capabilities,
})
// server.pipePath  — the resolved pipe path
// server.connectionCount — number of connected clients
// await server.close() — shut down
```

**MCP server side** — connect and use proxy capabilities:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { connectLspPipe, installMcpLspDriver } from 'mcp-lsp-driver'

const conn = await connectLspPipe({
  pipeName: 'my-ide-lsp',
  connectTimeout: 5000, // optional, default 5000ms
})

// conn.capabilities is a full IdeCapabilities proxy
// conn.availableMethods lists the methods the server exposes

const mcpServer = new McpServer({ name: 'my-mcp', version: '1.0.0' })
installMcpLspDriver({ server: mcpServer, capabilities: conn.capabilities })

// When done:
conn.disconnect()
```

The handshake automatically discovers which providers the server exposes and builds typed proxies. Change notifications (`onDiagnosticsChanged`, `onFileChanged`) are forwarded as push notifications to all connected clients. Multiple clients can connect to the same pipe simultaneously.

## LSP Client (Built-in)

For standalone MCP servers that need to communicate directly with an LSP server (e.g., when not running inside an IDE plugin), `LspClient` spawns a language server process and automatically creates capability providers based on the server's reported capabilities.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createLspClient, installMcpLspDriver } from 'mcp-lsp-driver'
import * as fs from 'fs/promises'

// 1. Create and start the LSP client
const lsp = createLspClient({
  command: 'typescript-language-server',
  args: ['--stdio'],
  workspacePath: '/path/to/project',
  readFile: (path) => fs.readFile(path, 'utf-8'),
})

await lsp.start()

// 2. Wire capabilities into MCP
const server = new McpServer({ name: 'my-mcp', version: '1.0.0' })
installMcpLspDriver({
  server,
  capabilities: {
    fileAccess: {
      readFile: (uri) => fs.readFile(uri, 'utf-8'),
      readDirectory: async () => [],
    },
    // Providers are automatically created based on server capabilities
    definition: lsp.definition,
    references: lsp.references,
    hierarchy: lsp.hierarchy,
    outline: lsp.outline,
    diagnostics: {
      ...lsp.diagnostics,
      onDiagnosticsChanged: lsp.onDiagnosticsChanged,
    },
  },
})

const transport = new StdioServerTransport()
await server.connect(transport)
```

### `LspClientOptions`

```typescript
interface LspClientOptions {
  command: string               // LSP server command to spawn
  args?: string[]               // Command arguments (e.g., ['--stdio'])
  workspacePath: string         // Absolute path to the workspace root
  readFile: (path: string) => Promise<string>  // File reader for document sync
  env?: Record<string, string>  // Additional environment variables
  initializationOptions?: unknown  // LSP initializationOptions
  documentIdleTimeout?: number  // Auto-close open docs after ms (default: 30000)
  requestTimeout?: number       // Timeout for LSP requests in ms (default: 30000)
}
```

### How It Works

1. `start()` spawns the LSP server process and performs the initialize/initialized handshake
2. The server's `ServerCapabilities` response determines which providers are created:
   - `definitionProvider` &rarr; `lsp.definition`
   - `referencesProvider` &rarr; `lsp.references`
   - `callHierarchyProvider` &rarr; `lsp.hierarchy`
   - `documentSymbolProvider` &rarr; `lsp.outline`
   - Diagnostics are always available (via `textDocument/publishDiagnostics` notifications)
3. Providers that the server does not support remain `undefined`
4. Documents are automatically opened/closed with the server on demand, with an idle timeout for cleanup

### Lifecycle

```typescript
const lsp = createLspClient({ /* ... */ })

lsp.getState()  // 'idle'
await lsp.start()
lsp.getState()  // 'running'

// Use lsp.definition, lsp.references, etc.

await lsp.stop()
lsp.getState()  // 'dead'
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint
pnpm lint

# Format
pnpm format
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.7.0

## License

MIT
