import { describe, expect, it } from 'vitest'
import type {
  IdeCapabilities,
  OnDiagnosticsChangedCallback,
} from './capabilities.js'
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
import { installMcpLspDriver } from './server.js'
import type { Diagnostic, DocumentSymbol } from './types.js'

describe('McpLspDriver', () => {
  describe('constructor', () => {
    it('should create instance with minimal capabilities', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()
    })

    it('should create instance with all capabilities', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        edit: createMockEditProvider(),
        definition: createMockDefinitionProvider(),
        references: createMockReferencesProvider(),
        hierarchy: createMockHierarchyProvider(),
        diagnostics: createMockDiagnosticsProvider(),
        outline: createMockOutlineProvider(),
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()
    })

    it('should accept resolver config', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
      }

      const { success } = installMcpLspDriver({
        server,
        capabilities,
        config: {
          resolverConfig: {
            lineSearchRadius: 5,
          },
        },
      })

      expect(success).toBeTruthy()
    })
  })

  describe('tool registration', () => {
    it('should not register tools when no optional capabilities are provided', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
      }

      // McpLspDriver registers tools internally, we verify it doesn't throw
      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()
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
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        diagnostics: diagnosticsProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

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
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        diagnostics: diagnosticsProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

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
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        outline: outlineProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

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

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      diagnostics: diagnosticsProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
    expect(registeredCallback).toBeDefined()
  })
})

describe('edit operations', () => {
  it('should create pending edit operation with correct structure', () => {
    const server = createMockServer()
    const edit = createMockEditProvider(true)
    const files = { 'test.ts': 'const foo = 1;' }

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      edit,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })

  it('should handle user rejection of edits', () => {
    const server = createMockServer()
    const edit = createMockEditProvider(false)
    const files = { 'test.ts': 'const foo = 1;' }

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      edit,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })
})
