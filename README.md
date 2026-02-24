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

The package ships dual ESM and CJS builds, so both `import` and `require` work out of the box.

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

  getFileTree: (uri: string) => yourIDE.workspace.getFileTree(uri),

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
  diagnostics,
  outline,
  filesystem,
  onDiagnosticsChanged: (callback) => {
    // Register for diagnostic changes
    yourIDE.onDiagnosticsChanged((uri) => callback(uri))
  },
  // Add more capabilities as needed
}

installMcpLspDriver({ server, capabilities })

// 6. Connect to transport (you control the server lifecycle)
const transport = new StdioServerTransport()
await server.connect(transport)
```

## API Reference

### Core Interfaces

#### `FileAccessProvider` (Required)

Provides disk access for reading files:

```typescript
// type UnifiedUri = string
interface FileAccessProvider {
  readFile(uri: UnifiedUri): Promise<string>
  getFileTree(folderPath: UnifiedUri): Promise<string[]>
  readDirectory(folderPath: UnifiedUri): Promise<string[]>
}
```

#### `EditProvider` (Required for edits)

Handles applying changes to files. At least one method must be implemented:

```typescript
interface EditProvider {
  // Apply edits directly without user interaction
  applyEdits?(operation: PendingEditOperation): Promise<boolean>
  // Preview edits and get user approval before applying
  previewAndApplyEdits?(operation: PendingEditOperation): Promise<boolean>
}
```

If both methods are provided, `previewAndApplyEdits` takes precedence.

### Capability Providers

All capability providers receive `ExactPosition` coordinates (0-based). The SDK handles fuzzy-to-exact conversion before calling these.

#### `DefinitionProvider`

```typescript
interface DefinitionProvider {
  provideDefinition(uri: UnifiedUri, position: ExactPosition): Promise<CodeSnippet[]>
}
```

#### `ReferencesProvider`

```typescript
interface ReferencesProvider {
  provideReferences(uri: UnifiedUri, position: ExactPosition): Promise<CodeSnippet[]>
}
```

#### `HierarchyProvider`

```typescript
interface HierarchyProvider {
  provideCallHierarchy(
    uri: UnifiedUri,
    position: ExactPosition,
    direction: 'incoming' | 'outgoing'
  ): Promise<CodeSnippet[]>
}
```

#### `DiagnosticsProvider`

```typescript
interface DiagnosticsProvider {
  provideDiagnostics(uri: UnifiedUri): Promise<Diagnostic[]>
  getWorkspaceDiagnostics?(): Promise<Diagnostic[]>  // Optional workspace diagnostics
}
```

#### `OutlineProvider`

```typescript
interface OutlineProvider {
  provideDocumentSymbols(uri: UnifiedUri): Promise<DocumentSymbol[]>
}
```

#### `GlobalFindProvider`

```typescript
interface GlobalFindProvider {
  globalFind(query: string, options: GlobalFindOptions): Promise<GlobalFindMatch[]>
  globalReplace(query: string, replaceWith: string, options: GlobalFindOptions): Promise<number>
}
```

Provides global find and replace functionality across the workspace. `GlobalFindOptions` includes:
- `caseSensitive`: Whether the search is case-sensitive (default: false)
- `exactMatch`: Whether to match exact words only (default: false)
- `regexMode`: Whether the query is a regular expression (default: false)

`GlobalFindMatch` includes:
- `uri`: File URI containing the match
- `line`: 1-based line number
- `column`: 1-based column number
- `matchText`: The matching text
- `context`: Context around the match (e.g., the full line)

#### `GraphProvider`

```typescript
interface GraphProvider {
  getLinkStructure(): Promise<Link[]>
  resolveOutlinks(path: UnifiedUri): Promise<Link[]>
  resolveBacklinks(path: UnifiedUri): Promise<Link[]>
  addLink(path: UnifiedUri, pattern: string, linkTo: UnifiedUri): Promise<boolean>
}
```

Provides graph/link functionality for document relationships (e.g., wiki-style links, cross-references). `Link` includes:
- `sourceUri`: The source URI where the link originates
- `targetUri`: The target URI the link points to
- `subpath`: Optional subpath within the target (e.g., `#section` for Obsidian-style anchors)
- `displayText`: Optional display text of the link
- `resolved`: Whether the link target exists
- `line`: 1-based line number where the link appears
- `column`: 1-based column number where the link starts

#### `FrontmatterProvider`

```typescript
interface FrontmatterProvider {
  getFrontmatterStructure(property: string, path?: UnifiedUri): Promise<FrontmatterMatch[]>
  getFrontmatter(path: UnifiedUri): Promise<Frontmatter>
  setFrontmatter(path: UnifiedUri, property: string, value: FrontmatterValue): Promise<boolean>
}
```

Provides frontmatter metadata functionality for documents (e.g., YAML frontmatter in Markdown files). Types:

```typescript
type FrontmatterValue = string | string[] | number | number[] | boolean | boolean[] | Date | undefined
type Frontmatter = { [key: string]: FrontmatterValue }
interface FrontmatterMatch {
  path: UnifiedUri
  value: FrontmatterValue
}
```

- `getFrontmatterStructure`: Searches for a specific property across documents. If `path` is provided, searches only that document.
- `getFrontmatter`: Gets all frontmatter for a specific document.
- `setFrontmatter`: Sets a frontmatter property. Use `undefined` to remove the property.

### IdeCapabilities

Combine all providers into a single configuration:

```typescript
interface IdeCapabilities {
  fileAccess: FileAccessProvider           // Required
  edit?: EditProvider                      // Required for apply_edit tool
  definition?: DefinitionProvider           // Enables goto_definition tool
  references?: ReferencesProvider           // Enables find_references tool
  hierarchy?: HierarchyProvider             // Enables call_hierarchy tool
  diagnostics?: DiagnosticsProvider         // Enables diagnostics resources
  outline?: OutlineProvider                 // Enables outline resource
  globalFind?: GlobalFindProvider           // Enables global_find and global_replace tools
  graph?: GraphProvider                     // Enables graph tools and resources
  frontmatter?: FrontmatterProvider         // Enables frontmatter tools and resource
  onDiagnosticsChanged?: (callback: OnDiagnosticsChangedCallback) => void
}
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

Apply a text edit to a file (requires user approval).

**Inputs:**
- `uri`: File path or URI
- `search_text`: Exact text to replace (must be unique in file)
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

### `global_replace`

Replace all occurrences of text across the entire workspace.

**Inputs:**
- `query`: The search query (required)
- `replace_with`: The replacement text (required)
- `case_sensitive`: Whether the search is case-sensitive (optional, default: false)
- `exact_match`: Whether to match exact words only (optional, default: false)
- `regex_mode`: Whether the query is a regular expression (optional, default: false)

**Returns:**
- Number of replacements made
- Success status and message

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

**Subscription Support:** If your IDE implements `onDiagnosticsChanged` capability, these resources become subscribable. When diagnostics change, the driver sends resource update notifications.

### `diagnostics://workspace`

Get diagnostics across the entire workspace.

**Resource URI:** `diagnostics://workspace`

Only available if your `DiagnosticsProvider` implements the optional `getWorkspaceDiagnostics()` method.

Returns workspace diagnostics grouped by file, formatted as markdown.

**Subscription Support:** If your IDE implements `onDiagnosticsChanged` capability, this resource becomes subscribable.

### `outline://{path}`

Get the document outline (symbol tree) for a file.

**Resource URI Pattern:** `outline://{+path}`

**Example:** `outline://src/components/Button.tsx`

Returns document symbols formatted as a hierarchical markdown outline, including:
- Symbol names and kinds (class, function, method, etc.)
- Source locations
- Nested children (e.g., methods within classes)

No subscription support for this resource (read-only).

### `filetree://{path}`

Get the complete file tree for a directory, excluding git-ignored files.

**Resource URI Pattern:** `filetree://{+path}`

**Example:** `filetree://src`, `filetree://.`

Returns a JSON array of all file paths in the directory tree (recursive). Use "." for the root directory.

No subscription support for this resource (read-only).

### `files://{path}`

For directories: returns directory children (git-ignored files excluded, similar to `ls`). For files: gets file content with optional line range.

**Resource URI Pattern:** `files://{+path}`

**Example:** `files://src`, `files://src/index.ts`, `files://src/index.ts#L1-L2`

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

When your IDE supports the `onDiagnosticsChanged` capability, diagnostic resources become subscribable:

```typescript
const capabilities: IdeCapabilities = {
  fileAccess,
  diagnostics: {
    provideDiagnostics: async (uri) => { /* ... */ },
    getWorkspaceDiagnostics: async () => { /* ... */ }
  },
  onDiagnosticsChanged: (callback) => {
    // Register your IDE's diagnostic change listener
    yourIDE.onDiagnosticsChanged((uri) => {
      // Call the callback when diagnostics change
      callback(uri)
    })
  }
}
```

When diagnostics change, call the registered callback with the affected file URI. The driver will send MCP resource update notifications to subscribers.

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

The handshake automatically discovers which providers the server exposes and builds typed proxies. Diagnostics change notifications (`onDiagnosticsChanged`) are forwarded as push notifications to all connected clients. Multiple clients can connect to the same pipe simultaneously.

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
