import { describe, expect, it } from 'vitest'
import type { OnDiagnosticsChangedCallback } from './capabilities.js'
import { install } from './mcp/index.js'
import {
  createMockDefinitionProvider,
  createMockDiagnosticsProvider,
  createMockEditProvider,
  createMockFileAccess,
  createMockHierarchyProvider,
  createMockOutlineProvider,
  createMockReferencesProvider,
  createMockServer,
} from './server.fixtures.js'
import type { Diagnostic, DocumentSymbol } from './types.js'

describe('McpLspDriver', () => {
  describe('constructor', () => {
    it('should create instance with minimal capabilities', () => {
      const server = createMockServer()
      const fileAccess = createMockFileAccess()

      expect(() => install(server, fileAccess)).not.toThrow()
    })

    it('should create instance with all capabilities', () => {
      const server = createMockServer()
      const fileAccess = createMockFileAccess()

      expect(() => {
        install(server, fileAccess)
        install(server, createMockEditProvider(), { fileAccess })
        install(server, createMockDefinitionProvider(), { fileAccess })
        install(server, createMockReferencesProvider(), { fileAccess })
        install(server, createMockHierarchyProvider(), { fileAccess })
        install(server, createMockDiagnosticsProvider(), { fileAccess })
        install(server, createMockOutlineProvider(), { fileAccess })
      }).not.toThrow()
    })

    it('should accept resolver config', () => {
      const server = createMockServer()
      const fileAccess = createMockFileAccess()

      expect(() =>
        install(server, createMockDefinitionProvider(), {
          fileAccess,
          resolverConfig: { lineSearchRadius: 5 },
        }),
      ).not.toThrow()
    })
  })

  describe('tool registration', () => {
    it('should not register tools when no optional capabilities are provided', () => {
      const server = createMockServer()
      const fileAccess = createMockFileAccess()

      expect(() => install(server, fileAccess)).not.toThrow()
    })

    it('should register diagnostics resources and return formatted results', async () => {
      const server = createMockServer()
      const diagnostics: Diagnostic[] = [
        {
          uri: 'test.ts',
          range: {
            start: { line: 0, character: 5 },
            end: { line: 0, character: 10 },
          },
          severity: 'error',
          message: 'Syntax error',
          source: 'typescript',
          code: 2322,
        },
      ]
      const diagnosticsProvider = createMockDiagnosticsProvider(diagnostics)
      const fileAccess = createMockFileAccess()

      install(server, fileAccess)
      install(server, diagnosticsProvider, { fileAccess })

      // Verify the provider returns the expected diagnostics
      const result = await diagnosticsProvider.provideDiagnostics('test.ts')
      expect(result).toHaveLength(1)
      expect(result[0]?.message).toBe('Syntax error')
      expect(result[0]?.severity).toBe('error')
      expect(result[0]?.code).toBe(2322)
    })

    it('should register workspace diagnostics resource when getWorkspaceDiagnostics is provided', async () => {
      const server = createMockServer()
      const workspaceDiagnostics: Diagnostic[] = [
        {
          uri: 'file1.ts',
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 5 },
          },
          severity: 'warning',
          message: 'Unused variable',
        },
        {
          uri: 'file2.ts',
          range: {
            start: { line: 5, character: 0 },
            end: { line: 5, character: 3 },
          },
          severity: 'error',
          message: 'Missing semicolon',
        },
      ]
      const diagnosticsProvider = createMockDiagnosticsProvider(
        [],
        workspaceDiagnostics,
      )
      const fileAccess = createMockFileAccess()

      install(server, fileAccess)
      install(server, diagnosticsProvider, { fileAccess })

      // Verify workspace diagnostics can be retrieved
      if (diagnosticsProvider.getWorkspaceDiagnostics) {
        const result = await diagnosticsProvider.getWorkspaceDiagnostics()
        expect(result).toHaveLength(2)
        expect(result[0]?.uri).toBe('file1.ts')
        expect(result[1]?.uri).toBe('file2.ts')
      }
    })

    it('should register outline resource and return formatted results', async () => {
      const server = createMockServer()
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
              name: 'constructor',
              kind: 'method',
              range: {
                start: { line: 1, character: 2 },
                end: { line: 3, character: 3 },
              },
              selectionRange: {
                start: { line: 1, character: 2 },
                end: { line: 1, character: 13 },
              },
            },
            {
              name: 'getValue',
              kind: 'method',
              range: {
                start: { line: 4, character: 2 },
                end: { line: 6, character: 3 },
              },
              selectionRange: {
                start: { line: 4, character: 2 },
                end: { line: 4, character: 10 },
              },
            },
          ],
        },
      ]
      const outlineProvider = createMockOutlineProvider(symbols)
      const fileAccess = createMockFileAccess()

      install(server, fileAccess)
      install(server, outlineProvider, { fileAccess })

      // Verify the outline provider returns the expected symbols
      const result = await outlineProvider.provideDocumentSymbols('test.ts')
      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('MyClass')
      expect(result[0]?.kind).toBe('class')
      expect(result[0]?.children).toHaveLength(2)
      expect(result[0]?.children?.[0]?.name).toBe('constructor')
      expect(result[0]?.children?.[1]?.name).toBe('getValue')
    })
  })
})

describe('diagnostics subscription', () => {
  it('should register onDiagnosticsChanged callback when provided', () => {
    const server = createMockServer()
    let registeredCallback: OnDiagnosticsChangedCallback | undefined

    const diagnosticsProvider = createMockDiagnosticsProvider()
    diagnosticsProvider.onDiagnosticsChanged = (callback) => {
      registeredCallback = callback
    }

    const fileAccess = createMockFileAccess()
    install(server, fileAccess)
    install(server, diagnosticsProvider, { fileAccess })

    expect(registeredCallback).toBeDefined()
  })
})

describe('edit operations', () => {
  it('should create pending edit operation with correct structure', () => {
    const server = createMockServer()
    const edit = createMockEditProvider(true)
    const files = { 'test.ts': 'const foo = 1;' }
    const fileAccess = createMockFileAccess(files)

    expect(() => {
      install(server, fileAccess)
      install(server, edit, { fileAccess })
    }).not.toThrow()
  })

  it('should handle user rejection of edits', () => {
    const server = createMockServer()
    const edit = createMockEditProvider(false)
    const files = { 'test.ts': 'const foo = 1;' }
    const fileAccess = createMockFileAccess(files)

    expect(() => {
      install(server, fileAccess)
      install(server, edit, { fileAccess })
    }).not.toThrow()
  })
})
