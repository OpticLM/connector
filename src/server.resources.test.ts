import { describe, expect, it } from 'vitest'
import type { IdeCapabilities } from './capabilities.js'
import {
  createAndConnectMockClient,
  createMockDiagnosticsProvider,
  createMockFileAccess,
  createMockOutlineProvider,
  createMockServer,
} from './server.fixtures.js'
import { installMcpLspDriver } from './server.js'
import type { Diagnostic, DocumentSymbol } from './types.js'

describe('resource integration', () => {
  it('should register and access file diagnostics resource', async () => {
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

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'diagnostics://test.ts' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: '- **ERROR** [typescript] (2322) at line 1: Syntax error',
      uri: 'diagnostics://test.ts',
    })
  })

  it('should register and access workspace diagnostics resource', async () => {
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

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'diagnostics://workspace' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: `## file1.ts
- **WARNING** at line 2: Unused variable

## file2.ts
- **ERROR** at line 6: Missing semicolon`,
      uri: 'diagnostics://workspace',
    })
  })

  it('should register and access outline resource', async () => {
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
    const outlineProvider = createMockOutlineProvider(symbols)
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      outline: outlineProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'outline://test.ts' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: `- **class** \`MyClass\` (lines 1-11)
  - **method** \`myMethod\` (lines 3-6)`,
      uri: 'outline://test.ts',
    })
  })

  it('should handle outline with nested symbols', async () => {
    const server = createMockServer()
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
    const outlineProvider = createMockOutlineProvider(symbols)
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      outline: outlineProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'outline://test.ts' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: `- **namespace** \`MyNamespace\` (lines 1-21)
  - **class** \`MyClass\` (lines 3-16)
    - **method** \`constructor\` (lines 5-7)`,
      uri: 'outline://test.ts',
    })
  })

  it('should register and access filesystem resource for directory listing', async () => {
    const server = createMockServer()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess({}), // No files, so it falls back to readDirectory
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'files://src' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'application/json',
      text: '["file1.ts","file2.ts","subdir"]',
      uri: 'files://src',
    })
  })

  it('should read file content via filesystem resource', async () => {
    const server = createMockServer()
    const fileContent = 'line1\nline2\nline3\nline4\nline5'
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess({
        'src/test.ts': fileContent,
      }),
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'files://src/test.ts',
    })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/plain',
      text: fileContent,
      uri: 'files://src/test.ts',
    })
  })

  it('should read specific line from file via filesystem resource', async () => {
    const server = createMockServer()
    const fileContent = 'line1\nline2\nline3\nline4\nline5'
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess({
        'src/test.ts': fileContent,
      }),
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'files://src/test.ts#L3',
    })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/plain',
      text: 'line3',
      uri: 'files://src/test.ts#L3',
    })
  })

  it('should read line range from file via filesystem resource', async () => {
    const server = createMockServer()
    const fileContent = 'line1\nline2\nline3\nline4\nline5'
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess({
        'src/test.ts': fileContent,
      }),
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'files://src/test.ts#L2-L4',
    })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/plain',
      text: 'line2\nline3\nline4',
      uri: 'files://src/test.ts#L2-L4',
    })
  })

  it('should fallback to readDirectory when file read fails on files://', async () => {
    const server = createMockServer()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess({}), // No files, readFile will fail
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'files://src' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'application/json',
      text: '["file1.ts","file2.ts","subdir"]',
      uri: 'files://src',
    })
  })
})
