/**
 * Unit tests for formatting utilities.
 */

import { describe, expect, it } from 'vitest'
import {
  formatDiagnosticsAsMarkdown,
  formatSymbolsAsMarkdown,
  normalizeUri,
} from './formatting.js'
import type { Diagnostic, DocumentSymbol } from './types.js'

describe('normalizeUri', () => {
  it('should handle Windows-style paths', () => {
    const result = normalizeUri('C:\\Users\\test\\file.ts')
    expect(result).toBe('C:/Users/test/file.ts')
  })

  it('should throw error when URI contains ".." (path traversal)', () => {
    expect(() => normalizeUri('../parent/file.ts')).toThrow(
      'URI could not include ".." operator',
    )
    expect(() => normalizeUri('src/../file.ts')).toThrow(
      'URI could not include ".." operator',
    )
  })

  it('should allow single dots in paths', () => {
    const result = normalizeUri('./current/file.ts')
    expect(result).toBe('./current/file.ts')
  })
})

describe('formatDiagnosticsAsMarkdown', () => {
  it('should format various diagnostic severities', () => {
    const diagnostics: Diagnostic[] = [
      {
        uri: 'test.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        severity: 'error',
        message: 'Test error',
      },
      {
        uri: 'test.ts',
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 5 },
        },
        severity: 'warning',
        message: 'Test warning',
      },
    ]

    const result = formatDiagnosticsAsMarkdown(diagnostics)
    expect(result).toContain('**ERROR**')
    expect(result).toContain('**WARNING**')
    expect(result).toContain('Test error')
    expect(result).toContain('Test warning')
  })

  it('should include source and code when provided', () => {
    const diagnostics: Diagnostic[] = [
      {
        uri: 'test.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        severity: 'error',
        message: 'Test error',
        source: 'typescript',
        code: 2322,
      },
    ]

    const result = formatDiagnosticsAsMarkdown(diagnostics)
    expect(result).toContain('[typescript]')
    expect(result).toContain('(2322)')
    expect(result).toContain('Test error')
  })

  it('should return "No diagnostics found" for empty list', () => {
    const result = formatDiagnosticsAsMarkdown([])
    expect(result).toBe('No diagnostics found.')
  })
})

describe('formatSymbolsAsMarkdown', () => {
  it('should format document symbols with various kinds', () => {
    const symbols: DocumentSymbol[] = [
      {
        name: 'MyClass',
        kind: 'class',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 1 },
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 13 },
        },
        children: [
          {
            name: 'myMethod',
            kind: 'method',
            range: {
              start: { line: 2, character: 2 },
              end: { line: 5, character: 3 },
            },
            selectionRange: {
              start: { line: 2, character: 2 },
              end: { line: 2, character: 10 },
            },
          },
        ],
      },
    ]

    const result = formatSymbolsAsMarkdown(symbols)
    expect(result).toContain('**class**')
    expect(result).toContain('`MyClass`')
    expect(result).toContain('**method**')
    expect(result).toContain('`myMethod`')
  })

  it('should handle empty outline', () => {
    const result = formatSymbolsAsMarkdown([])
    expect(result).toBe('No symbols found.')
  })

  it('should handle symbols with details', () => {
    const symbols: DocumentSymbol[] = [
      {
        name: 'myFunction',
        detail: '(param: string): void',
        kind: 'function',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 3, character: 1 },
        },
        selectionRange: {
          start: { line: 0, character: 9 },
          end: { line: 0, character: 19 },
        },
      },
    ]

    const result = formatSymbolsAsMarkdown(symbols)
    expect(result).toContain('`myFunction`')
    expect(result).toContain('(param: string): void')
  })

  it('should format nested symbols with proper indentation', () => {
    const symbols: DocumentSymbol[] = [
      {
        name: 'MyNamespace',
        kind: 'namespace',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 20, character: 1 },
        },
        selectionRange: {
          start: { line: 0, character: 10 },
          end: { line: 0, character: 21 },
        },
        children: [
          {
            name: 'MyClass',
            kind: 'class',
            range: {
              start: { line: 2, character: 2 },
              end: { line: 15, character: 3 },
            },
            selectionRange: {
              start: { line: 2, character: 8 },
              end: { line: 2, character: 15 },
            },
            children: [
              {
                name: 'constructor',
                kind: 'method',
                range: {
                  start: { line: 4, character: 4 },
                  end: { line: 6, character: 5 },
                },
                selectionRange: {
                  start: { line: 4, character: 4 },
                  end: { line: 4, character: 15 },
                },
              },
            ],
          },
        ],
      },
    ]

    const result = formatSymbolsAsMarkdown(symbols)
    expect(result).toContain('- **namespace** `MyNamespace`')
    expect(result).toContain('  - **class** `MyClass`')
    expect(result).toContain('    - **method** `constructor`')
  })
})
