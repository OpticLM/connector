/**
 * MCP LSP Driver SDK
 *
 * A TypeScript SDK for building IDE plugins that expose LSP features
 * through the Model Context Protocol (MCP).
 *
 * @packageDocumentation
 */

// Capability Providers
export type {
  DefinitionProvider,
  DiagnosticsProvider,
  FrontmatterProvider,
  GlobalFindMatch,
  GlobalFindOptions,
  GlobalFindProvider,
  GraphProvider,
  HierarchyProvider,
  IdeCapabilities,
  OnDiagnosticsChangedCallback,
  OutlineProvider,
  ReferencesProvider,
} from './capabilities.js'

// Infrastructure Interfaces
export type {
  FileAccessProvider,
  UserInteractionProvider,
} from './interfaces.js'
export type { ResolverConfig } from './resolver.js'

// Symbol Resolver
export { SymbolResolutionError, SymbolResolver } from './resolver.js'
export type { McpLspDriverConfig } from './server.js'

// Driver
export { installMcpLspDriver } from './server.js'
// Core Data Models
export type {
  CodeSnippet,
  Diagnostic,
  DiagnosticSeverity,
  DiskRange,
  DocumentSymbol,
  EditFailureReason,
  EditResult,
  ExactPosition,
  Frontmatter,
  FrontmatterMatch,
  FrontmatterValue,
  FuzzyPosition,
  Link,
  PendingEditOperation,
  SymbolKind,
  TextEdit,
  UnifiedUri,
} from './types.js'
