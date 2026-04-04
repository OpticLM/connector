/**
 * Core Data Models
 *
 * These types define how the LLM communicates intent versus how the IDE executes commands.
 */

/**
 * A Unified Resource Identifier.
 * Must be a file system path.
 */
export type UnifiedUri = string

/**
 * 0-based exact coordinate system (Used internally by IDE).
 */
export interface ExactPosition {
  /** 0-based line number */
  line: number
  /** 0-based column (character offset) */
  character: number
}

/**
 * The fuzzy location provided by the LLM.
 * Designed to be robust against minor formatting changes or token counting errors.
 */
export interface FuzzyPosition {
  /**
   * The text of the symbol to find (e.g., function name, variable name).
   */
  symbolName: string

  /**
   * An approximate line number where the symbol is expected.
   * 1-based (Human friendly) for LLM input, converted to 0-based internally.
   */
  lineHint: number

  /**
   * If the symbol appears multiple times on the line, which occurrence to target?
   * 0-based index. Defaults to 0 (the first occurrence).
   * Example: "add(a, a)" -> looking for second 'a' -> orderHint: 1.
   */
  orderHint?: number
}

/**
 * Represents a resolved span of text on disk.
 */
export interface DiskRange {
  start: ExactPosition
  end: ExactPosition
}

/**
 * Represents a snippet of code read from disk.
 */
export interface CodeSnippet {
  /** The URI of the file containing the snippet */
  uri: UnifiedUri
  /** The range of the snippet in the file */
  range: DiskRange
  /** The actual text read from disk */
  content: string
}

/**
 * Represents a pending edit operation that awaits user approval.
 * The SDK resolves edits against the current file content and provides
 * the fully updated file text, so plugins only need to write the result.
 */
export interface PendingEditOperation {
  /** Unique identifier for this operation */
  id: string
  /** The URI of the file to edit */
  uri: UnifiedUri
  /** The full updated content of the file after applying the edit */
  updated: string
  /** Optional description of the edit (e.g., "Refactor logic to handle null cases") */
  description?: string
}

/**
 * The reason why an edit operation failed.
 */
export type EditFailureReason = 'UserRejected' | 'IOError' | 'ValidationFailed'

/**
 * The result of editing a file.
 * The edit may be automatically approved, or it may require user approval;
 * the user may reject it, approve it, or make changes based on the existing edit.
 */
export type EditResult =
  | { type: EditFailureReason }
  | {
      type: 'Approved'
      updated: string
    }

// ============================================================================
// Diagnostic Types
// ============================================================================

/**
 * Severity level for diagnostics.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint'

/**
 * Represents a diagnostic (error, warning, etc.) from the IDE.
 */
export interface Diagnostic {
  /** The URI of the file containing the diagnostic */
  uri: UnifiedUri
  /** The range of the diagnostic */
  range: DiskRange
  /** The severity of the diagnostic */
  severity: DiagnosticSeverity
  /** The diagnostic message */
  message: string
  /** Optional source of the diagnostic (e.g., "typescript", "eslint") */
  source?: string
  /** Optional diagnostic code */
  code?: string | number
}

// ============================================================================
// Outline Types
// ============================================================================

/**
 * Symbol kind for outline items.
 */
export type SymbolKind =
  | 'file'
  | 'module'
  | 'namespace'
  | 'package'
  | 'class'
  | 'method'
  | 'property'
  | 'field'
  | 'constructor'
  | 'enum'
  | 'interface'
  | 'function'
  | 'variable'
  | 'constant'
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'key'
  | 'null'
  | 'enumMember'
  | 'struct'
  | 'event'
  | 'operator'
  | 'typeParameter'

/**
 * Represents a symbol in the document outline (e.g., class, function, variable).
 */
export interface DocumentSymbol {
  /** The name of the symbol */
  name: string
  /** More detail for this symbol (e.g., signature) */
  detail?: string
  /** The kind of this symbol */
  kind: SymbolKind
  /** The range of the entire symbol (including body) */
  range: DiskRange
  /** The range of the symbol's name */
  selectionRange: DiskRange
  /** Children of this symbol (e.g., methods in a class) */
  children?: DocumentSymbol[]
}

// ============================================================================
// Frontmatter Types
// ============================================================================

/**
 * Allowed values for frontmatter properties.
 */
export type FrontmatterValue =
  | string
  | string[]
  | number
  | number[]
  | boolean
  | boolean[]
  | Date
  | undefined

/**
 * A frontmatter object mapping property names to values.
 */
export type Frontmatter = { [key: string]: FrontmatterValue }

/**
 * A frontmatter property match from a structure query.
 */
export interface FrontmatterMatch {
  /** The path to the document containing the frontmatter */
  path: UnifiedUri
  /** The value of the frontmatter property */
  value: FrontmatterValue
}

// ============================================================================
// Graph/Link Types
// ============================================================================

/**
 * Represents a link between documents (e.g., wiki-style links, imports, references).
 */
export interface Link {
  /** The source URI where this link originates from */
  sourceUri: UnifiedUri
  /** The target URI this link points to */
  targetUri: UnifiedUri
  /** Optional subpath within the target (e.g., heading anchor like #section) */
  subpath?: string
  /** The display text of the link (if different from target) */
  displayText?: string
  /** Whether the link target has been resolved to an existing document */
  resolved: boolean
  /** 1-based line number where the link appears */
  line: number
  /** 1-based column where the link starts */
  column: number
}
