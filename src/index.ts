/**
 * OpticLM Connector
 *
 * Provides an abstract interface that allows LLMs to connect to fact sources such as LSPs,
 * code diagnostics, symbol definitions/references, links, and frontmatter.
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
  OutlineProvider,
  ReferencesProvider,
} from './capabilities.js'
export { createFileCompleter } from './completer.js'

// Infrastructure Interfaces
export type {
  EditProvider,
  FileAccessProvider,
} from './interfaces.js'
export type { ResolverConfig } from './resolver.js'

// Symbol Resolver
export { SymbolResolutionError, SymbolResolver } from './resolver.js'

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
  UnifiedUri,
} from './types.js'
