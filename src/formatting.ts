/**
 * Formatting utilities for converting LSP results to markdown.
 * @internal
 */

import type { Diagnostic, DocumentSymbol } from './types.js'

export const makeToolResult = <T extends { [x: string]: unknown }>(
  result: T,
): {
  content: [{ type: 'text'; text: string }]
  structuredContent: { [x: string]: unknown }
} => ({
  content: [{ type: 'text' as const, text: JSON.stringify(result ?? '') }],
  structuredContent: result,
})

/**
 * Normalizes a URI to handle Windows/Unix path separator differences.
 */
export function normalizeUri(uri: string): string {
  if (uri.includes('..')) {
    throw new Error('URI could not include ".." operator')
  }

  // Normalize backslashes to forward slashes for consistency
  return uri.replace(/\\/g, '/')
}

/**
 * Generates a unique ID for pending edit operations.
 */
export function generateEditId(): string {
  return `edit-${Date.now()}`
}

/**
 * Formats diagnostics as markdown for resource content.
 */
export function formatDiagnosticsAsMarkdown(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return 'No diagnostics found.'
  }

  return diagnostics
    .map((d) => {
      const line = d.range.start.line + 1
      const severity = d.severity.toUpperCase()
      const source = d.source ? ` [${d.source}]` : ''
      const code = d.code !== undefined ? ` (${d.code})` : ''
      return `- **${severity}**${source}${code} at line ${line}: ${d.message}`
    })
    .join('\n')
}

/**
 * Formats document symbols as markdown for resource content.
 */
export function formatSymbolsAsMarkdown(
  symbols: DocumentSymbol[],
  indent = 0,
): string {
  if (symbols.length === 0 && indent === 0) {
    return 'No symbols found.'
  }

  const prefix = '  '.repeat(indent)
  return symbols
    .map((s) => {
      const startLine = s.range.start.line + 1
      const endLine = s.range.end.line + 1
      const range =
        startLine === endLine
          ? `line ${startLine}`
          : `lines ${startLine}-${endLine}`
      const detail = s.detail ? ` - ${s.detail}` : ''
      const line = `${prefix}- **${s.kind}** \`${s.name}\`${detail} (${range})`

      if (s.children && s.children.length > 0) {
        return `${line}\n${formatSymbolsAsMarkdown(s.children, indent + 1)}`
      }
      return line
    })
    .join('\n')
}
