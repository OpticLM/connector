/**
 * Capability Providers
 *
 * Each provider interface corresponds to one LSP capability.
 * Note: All inputs use ExactPosition. The SDK handles Fuzzy -> Exact conversion.
 */

import type {
  CodeSnippet,
  Diagnostic,
  DocumentSymbol,
  ExactPosition,
  Frontmatter,
  FrontmatterMatch,
  FrontmatterValue,
  Link,
  UnifiedUri,
} from './types.js'

/**
 * Provides go-to-definition functionality.
 */
export interface DefinitionProvider {
  /**
   * Returns definition location reading strictly from disk context.
   *
   * @param uri - The URI of the file
   * @param position - The exact position to find the definition for
   * @returns Array of code snippets representing definition locations
   */
  provideDefinition(
    uri: UnifiedUri,
    position: ExactPosition,
  ): Promise<CodeSnippet[]>

  /**
   * Returns the type definition location for the symbol at the given position.
   *
   * @param uri - The URI of the file
   * @param position - The exact position to find the type definition for
   * @returns Array of code snippets representing type definition locations
   */
  provideTypeDefinition?(
    uri: UnifiedUri,
    position: ExactPosition,
  ): Promise<CodeSnippet[]>
}

/**
 * Provides find-references functionality.
 */
export interface ReferencesProvider {
  /**
   * Finds all references to the symbol at the given position.
   *
   * @param uri - The URI of the file
   * @param position - The exact position to find references for
   * @returns Array of code snippets representing reference locations
   */
  provideReferences(
    uri: UnifiedUri,
    position: ExactPosition,
  ): Promise<CodeSnippet[]>

  /**
   * Finds all references to the given file.
   *
   * @param uri - The URI of the file
   */
  provideFileReferences?(uri: UnifiedUri): Promise<CodeSnippet[]>
}

/**
 * Provides call hierarchy functionality.
 */
export interface HierarchyProvider {
  /**
   * Provides call hierarchy information for the symbol at the given position.
   *
   * @param uri - The URI of the file
   * @param position - The exact position to get call hierarchy for
   * @param direction - Whether to get incoming or outgoing calls
   * @returns Array of code snippets representing call hierarchy items
   */
  provideCallHierarchy(
    uri: UnifiedUri,
    position: ExactPosition,
    direction: 'incoming' | 'outgoing',
  ): Promise<CodeSnippet[]>
}

/**
 * Provides diagnostics (errors, warnings) for a file.
 */
export interface DiagnosticsProvider {
  /**
   * Gets diagnostics for a file.
   *
   * @param uri - The URI of the file
   * @returns Array of diagnostics for the file
   */
  provideDiagnostics(uri: UnifiedUri): Promise<Diagnostic[]>

  /**
   * Gets diagnostics for all files in the workspace.
   * If not provided, the workspace diagnostics resource will not be available.
   *
   * @returns Array of diagnostics for all files in the workspace
   */
  getWorkspaceDiagnostics?(): Promise<Diagnostic[]>
}

/**
 * Provides document outline (symbols) for a file.
 */
export interface OutlineProvider {
  /**
   * Gets the document symbols (outline) for a file.
   *
   * @param uri - The URI of the file
   * @returns Array of document symbols representing the file's outline
   */
  provideDocumentSymbols(uri: UnifiedUri): Promise<DocumentSymbol[]>
}

/**
 * Search options for global find operations.
 */
export interface GlobalFindOptions {
  /** Whether the search is case-sensitive */
  caseSensitive: boolean
  /** Whether to match exact words only */
  exactMatch: boolean
  /** Whether the query is a regular expression */
  regexMode: boolean
}

/**
 * A match result from a global find operation.
 */
export interface GlobalFindMatch {
  /** The URI of the file containing the match */
  uri: UnifiedUri
  /** 1-based line number of the match */
  line: number
  /** 1-based column of the match */
  column: number
  /** The matching text */
  matchText: string
  /** Context around the match (e.g., the full line) */
  context: string
}

/**
 * Provides global find functionality across the workspace.
 */
export interface GlobalFindProvider {
  /**
   * Performs a global find operation across the workspace.
   *
   * @param query - The search query
   * @param options - Search options (case sensitivity, exact match, regex mode)
   * @returns Array of matches found
   */
  globalFind(
    query: string,
    options: GlobalFindOptions,
  ): Promise<GlobalFindMatch[]>
}

/**
 * Provides graph/link functionality for document relationships.
 */
export interface GraphProvider {
  /**
   * Gets all links in the workspace.
   *
   * @returns Array of all links in the workspace
   */
  getLinkStructure(): Promise<Link[]>

  /**
   * Resolves outgoing links from a specific document.
   *
   * @param path - The path to the document
   * @returns Array of outgoing links from the document
   */
  resolveOutlinks(path: UnifiedUri): Promise<Link[]>

  /**
   * Resolves incoming links (backlinks) to a specific document.
   *
   * @param path - The path to the document
   * @returns Array of links pointing to this document
   */
  resolveBacklinks(path: UnifiedUri): Promise<Link[]>

  /**
   * Adds a link to a document by finding a pattern and replacing it with a link.
   * Throws an error if the operation fails (e.g., pattern not found).
   *
   * @param path - The path to the document to modify
   * @param pattern - The text pattern to find and replace with a link
   * @param linkTo - The target URI the link should point to
   * @throws Error if the link cannot be added
   */
  addLink(path: UnifiedUri, pattern: string, linkTo: UnifiedUri): Promise<void>
}

/**
 * Provides frontmatter functionality for document metadata.
 */
export interface FrontmatterProvider {
  /**
   * Gets the frontmatter structure for a specific property across documents.
   * If path is provided, searches only that document. Otherwise, searches all documents.
   *
   * @param property - The frontmatter property name to search for
   * @param path - Optional path to limit the search to a specific document
   * @returns Array of matches containing path and value
   */
  getFrontmatterStructure(
    property: string,
    path?: UnifiedUri,
  ): Promise<FrontmatterMatch[]>

  /**
   * Gets all frontmatter for a specific document.
   *
   * @param path - The path to the document
   * @returns The frontmatter object for the document
   */
  getFrontmatter(path: UnifiedUri): Promise<Frontmatter>

  /**
   * Sets a frontmatter property on a document.
   * Throws an error if the operation fails.
   *
   * @param path - The path to the document
   * @param property - The property name to set
   * @param value - The value to set
   * @throws Error if the frontmatter cannot be updated
   */
  setFrontmatter(
    path: UnifiedUri,
    property: string,
    value: FrontmatterValue,
  ): Promise<void>
}
