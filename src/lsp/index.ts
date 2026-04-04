/**
 * LSP Client utilities
 *
 * Provides a ready-made LSP client that wraps a language server process and
 * exposes IDE capability providers, plus helpers for converting LSP types to
 * the SDK's own data models.
 *
 * @packageDocumentation
 */

// LSP Client
export type { LspClientOptions } from './lsp-client.js'
export { createLspClient, LspClient } from './lsp-client.js'

// LSP Converters
export {
  convertDiagnosticSeverity,
  convertLocationsToSnippets,
  convertLspDiagnostic,
  convertLspDocumentSymbol,
  convertLspPosition,
  convertLspRange,
  convertSymbolInformation,
  convertSymbolKind,
  guessLanguageId,
  lspUriToPath,
  pathToLspUri,
} from './lsp-converters.js'
