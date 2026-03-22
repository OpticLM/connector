import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IdeCapabilities } from './capabilities.js'
import { mergeCapabilities } from './merge.js'
import { connectLspPipe, type LspPipeConnection } from './pipe-client.js'
import { type LspPipeServer, serveLspPipe } from './pipe-server.js'
import {
  createAndConnectMockClient,
  createMockDefinitionProvider,
  createMockDiagnosticsProvider,
  createMockEditProvider,
  createMockFileAccess,
  createMockFrontmatterProvider,
  createMockGlobalFindProvider,
  createMockGraphProvider,
  createMockHierarchyProvider,
  createMockOutlineProvider,
  createMockReferencesProvider,
  createMockServer,
  mockCodeSnippet,
} from './server.fixtures.js'
import { installMcpLspDriver } from './server.js'
import type { Diagnostic } from './types.js'

function uniquePipeName(): string {
  return `mcp-lsp-test-${randomUUID()}`
}

const servers: LspPipeServer[] = []
const connections: LspPipeConnection[] = []

afterEach(async () => {
  for (const c of connections) {
    c.disconnect()
  }
  connections.length = 0
  for (const s of servers) {
    await s.close().catch(() => {})
  }
  servers.length = 0
})

async function setupPipe(capabilities: IdeCapabilities) {
  const pipeName = uniquePipeName()
  const server = await serveLspPipe({ capabilities, pipeName })
  servers.push(server)
  const conn = await connectLspPipe({ pipeName })
  connections.push(conn)
  return { server, conn }
}

describe('Pipe IPC - Handshake', () => {
  it('minimal caps: only fileAccess methods', async () => {
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
    }
    const { conn } = await setupPipe(capabilities)

    expect(conn.availableMethods).toContain('fileAccess.readFile')
    expect(conn.availableMethods).toContain('fileAccess.readDirectory')
    expect(
      conn.availableMethods.filter((m) => !m.startsWith('fileAccess.')),
    ).toHaveLength(0)
  })

  it('full caps: all methods present', async () => {
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      edit: createMockEditProvider(),
      definition: createMockDefinitionProvider(),
      references: createMockReferencesProvider(),
      hierarchy: createMockHierarchyProvider(),
      diagnostics: {
        ...createMockDiagnosticsProvider(),
        onDiagnosticsChanged: (_cb: (uri: string) => void) => {},
      },
      outline: createMockOutlineProvider(),
      globalFind: createMockGlobalFindProvider(),
      graph: createMockGraphProvider(),
      frontmatter: createMockFrontmatterProvider(),
      onDiagnosticsChanged: (_cb: (uri: string) => void) => {},
    }
    const { conn } = await setupPipe(capabilities)

    expect(conn.availableMethods).toContain('fileAccess.readFile')
    expect(conn.availableMethods).toContain('edit.previewAndApplyEdits')
    expect(conn.availableMethods).toContain('definition.provideDefinition')
    expect(conn.availableMethods).toContain('references.provideReferences')
    expect(conn.availableMethods).toContain('hierarchy.provideCallHierarchy')
    expect(conn.availableMethods).toContain('diagnostics.provideDiagnostics')
    expect(conn.availableMethods).toContain('outline.provideDocumentSymbols')
    expect(conn.availableMethods).toContain('globalFind.globalFind')
    expect(conn.availableMethods).toContain('graph.getLinkStructure')
    expect(conn.availableMethods).toContain('graph.resolveOutlinks')
    expect(conn.availableMethods).toContain('graph.resolveBacklinks')
    expect(conn.availableMethods).toContain('graph.addLink')
    expect(conn.availableMethods).toContain(
      'frontmatter.getFrontmatterStructure',
    )
    expect(conn.availableMethods).toContain('frontmatter.getFrontmatter')
    expect(conn.availableMethods).toContain('frontmatter.setFrontmatter')
    expect(conn.availableMethods).toContain('onDiagnosticsChanged')
  })
})

describe('Pipe IPC - Round-trip', () => {
  it('fileAccess.readFile', async () => {
    const files = { 'test.txt': 'hello world' }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
    }
    const { conn } = await setupPipe(capabilities)

    const result = await conn.capabilities.fileAccess?.readFile('test.txt')
    expect(result).toBe('hello world')
  })

  it('fileAccess.readDirectory', async () => {
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
    }
    const { conn } = await setupPipe(capabilities)

    const result = await conn.capabilities.fileAccess?.readDirectory('src')
    expect(result).toStrictEqual(['file1.ts', 'file2.ts', 'subdir'])
  })

  it('definition.provideDefinition', async () => {
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      definition: createMockDefinitionProvider([mockCodeSnippet]),
    }
    const { conn } = await setupPipe(capabilities)

    const result = await conn.capabilities.definition?.provideDefinition(
      'path/to/file',
      { line: 0, character: 1 },
    )
    expect(result).toStrictEqual([mockCodeSnippet])
  })

  it('references.provideReferences', async () => {
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      references: createMockReferencesProvider([mockCodeSnippet]),
    }
    const { conn } = await setupPipe(capabilities)

    const result = await conn.capabilities.references?.provideReferences(
      'path/to/file',
      { line: 0, character: 1 },
    )
    expect(result).toStrictEqual([mockCodeSnippet])
  })

  it('hierarchy.provideCallHierarchy', async () => {
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      hierarchy: createMockHierarchyProvider([mockCodeSnippet]),
    }
    const { conn } = await setupPipe(capabilities)

    const result = await conn.capabilities.hierarchy?.provideCallHierarchy(
      'path/to/file',
      { line: 0, character: 1 },
      'incoming',
    )
    expect(result).toStrictEqual([mockCodeSnippet])
  })

  it('diagnostics.provideDiagnostics', async () => {
    const diag: Diagnostic = {
      uri: 'path/to/file',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
      severity: 'error',
      message: 'test error',
    }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      diagnostics: createMockDiagnosticsProvider([diag]),
    }
    const { conn } = await setupPipe(capabilities)

    const result =
      await conn.capabilities.diagnostics?.provideDiagnostics('path/to/file')
    expect(result).toStrictEqual([diag])
  })

  it('outline.provideDocumentSymbols', async () => {
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      outline: createMockOutlineProvider([]),
    }
    const { conn } = await setupPipe(capabilities)

    const result =
      await conn.capabilities.outline?.provideDocumentSymbols('path/to/file')
    expect(result).toStrictEqual([])
  })

  it('globalFind.globalFind returns matches', async () => {
    const matches = [
      {
        uri: 'path/to/file',
        line: 1,
        column: 1,
        matchText: 'test',
        context: 'test line',
      },
    ]
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      globalFind: createMockGlobalFindProvider(matches),
    }
    const { conn } = await setupPipe(capabilities)

    const result = await conn.capabilities.globalFind?.globalFind('test', {
      caseSensitive: false,
      exactMatch: false,
      regexMode: false,
    })
    expect(result).toStrictEqual(matches)
  })

  it('edit.previewAndApplyEdits returns boolean', async () => {
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      edit: createMockEditProvider(true),
    }
    const { conn } = await setupPipe(capabilities)

    const result = await conn.capabilities.edit?.previewAndApplyEdits?.({
      id: 'test-edit',
      uri: 'path/to/file',
      edits: [],
    })
    expect(result).toBe(true)
  })

  it('graph.getLinkStructure returns links', async () => {
    const links = [
      {
        sourceUri: 'a.md',
        targetUri: 'b.md',
        resolved: true,
        line: 1,
        column: 1,
      },
    ]
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      graph: createMockGraphProvider(links),
    }
    const { conn } = await setupPipe(capabilities)

    const result = await conn.capabilities.graph?.getLinkStructure()
    expect(result).toStrictEqual(links)
  })

  it('frontmatter.getFrontmatter returns metadata', async () => {
    const fm = { title: 'Test', tags: ['a', 'b'] }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      frontmatter: createMockFrontmatterProvider(fm),
    }
    const { conn } = await setupPipe(capabilities)

    const result =
      await conn.capabilities.frontmatter?.getFrontmatter('test.md')
    expect(result).toStrictEqual(fm)
  })
})

// ============================================================================
// End-to-end with MCP
// ============================================================================

describe('Pipe IPC - End-to-end with MCP', () => {
  it('goto_definition flows through pipe', async () => {
    const files = {
      'path/to/file': 'MockFileContent',
    }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      definition: createMockDefinitionProvider([mockCodeSnippet]),
    }

    // Set up pipe
    const { conn } = await setupPipe(capabilities)

    // Set up MCP with proxy capabilities merged via mergeCapabilities
    const mcpServer = createMockServer()
    const { success } = installMcpLspDriver({
      server: mcpServer,
      capabilities: mergeCapabilities(
        [conn.capabilities],
        createMockFileAccess(files),
      ),
    })
    expect(success).toBeTruthy()

    // Connect MCP client
    const mcpClient = await createAndConnectMockClient(mcpServer)
    const r = await mcpClient.callTool({
      name: 'goto_definition',
      arguments: {
        uri: 'path/to/file',
        symbol_name: '',
        line_hint: 1,
      },
    })

    expect(r.structuredContent).toStrictEqual({
      snippets: [
        {
          content: mockCodeSnippet.content,
          endLine: mockCodeSnippet.range.end.line + 1,
          startLine: mockCodeSnippet.range.start.line + 1,
          uri: mockCodeSnippet.uri,
        },
      ],
    })
  })
})

describe('Pipe IPC - Push notifications', () => {
  it('onDiagnosticsChanged fires on client', async () => {
    let serverBroadcast: ((uri: string) => void) | undefined
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      diagnostics: {
        provideDiagnostics: vi.fn(async () => []),
        onDiagnosticsChanged: (cb) => {
          serverBroadcast = cb
        },
      },
    }
    const { conn } = await setupPipe(capabilities)

    const received: string[] = []
    conn.capabilities.diagnostics?.onDiagnosticsChanged?.((uri) => {
      received.push(uri)
    })

    // Trigger notification from server side
    serverBroadcast?.('path/to/changed-file')

    // Allow async propagation
    await new Promise((r) => setTimeout(r, 50))

    expect(received).toStrictEqual(['path/to/changed-file'])
  })
})

describe('Pipe IPC - Multiple clients', () => {
  it('two clients connected simultaneously', async () => {
    const files = { 'test.txt': 'content-a' }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
    }

    const pipeName = uniquePipeName()
    const server = await serveLspPipe({ capabilities, pipeName })
    servers.push(server)

    const conn1 = await connectLspPipe({ pipeName })
    connections.push(conn1)
    expect(server.connectionCount).toBe(1)

    const conn2 = await connectLspPipe({ pipeName })
    connections.push(conn2)
    expect(server.connectionCount).toBe(2)

    // Both get responses
    const [r1, r2] = await Promise.all([
      conn1.capabilities.fileAccess?.readFile('test.txt'),
      conn2.capabilities.fileAccess?.readFile('test.txt'),
    ])
    expect(r1).toBe('content-a')
    expect(r2).toBe('content-a')

    // One disconnects, other continues
    conn1.disconnect()
    connections.splice(connections.indexOf(conn1), 1)
    await new Promise((r) => setTimeout(r, 50))
    expect(server.connectionCount).toBe(1)

    const r3 = await conn2.capabilities.fileAccess?.readFile('test.txt')
    expect(r3).toBe('content-a')
  })

  it('both clients receive notifications', async () => {
    let serverBroadcast: ((uri: string) => void) | undefined
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      diagnostics: {
        provideDiagnostics: vi.fn(async () => []),
        onDiagnosticsChanged: (cb) => {
          serverBroadcast = cb
        },
      },
    }

    const pipeName = uniquePipeName()
    const server = await serveLspPipe({ capabilities, pipeName })
    servers.push(server)

    const conn1 = await connectLspPipe({ pipeName })
    connections.push(conn1)
    const conn2 = await connectLspPipe({ pipeName })
    connections.push(conn2)

    const received1: string[] = []
    const received2: string[] = []
    conn1.capabilities.diagnostics?.onDiagnosticsChanged?.((uri) =>
      received1.push(uri),
    )
    conn2.capabilities.diagnostics?.onDiagnosticsChanged?.((uri) =>
      received2.push(uri),
    )

    serverBroadcast?.('file.ts')
    await new Promise((r) => setTimeout(r, 50))

    expect(received1).toStrictEqual(['file.ts'])
    expect(received2).toStrictEqual(['file.ts'])
  })
})

describe('Pipe IPC - Error propagation', () => {
  it('server handler throws: client gets rejected promise', async () => {
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(), // readFile throws for unknown URIs
    }
    const { conn } = await setupPipe(capabilities)

    await expect(
      conn.capabilities.fileAccess?.readFile('nonexistent.txt'),
    ).rejects.toThrow('File not found: nonexistent.txt')
  })
})

describe('Pipe IPC - Cleanup', () => {
  it('server.close() rejects pending client requests', async () => {
    // Create a slow handler to keep a request pending
    const slowCapabilities: IdeCapabilities = {
      fileAccess: {
        readFile: () =>
          new Promise((resolve) => setTimeout(() => resolve('late'), 5000)),
        readDirectory: vi.fn(async () => []),
      },
    }

    const pipeName = uniquePipeName()
    const server = await serveLspPipe({
      capabilities: slowCapabilities,
      pipeName,
    })
    servers.push(server)

    const conn = await connectLspPipe({ pipeName })
    connections.push(conn)

    // Start a slow request
    const pending = conn.capabilities.fileAccess?.readFile('slow.txt')

    // Close server while request is pending
    await server.close()

    await expect(pending).rejects.toThrow()
  })

  it('client.disconnect() rejects pending requests', async () => {
    const slowCapabilities: IdeCapabilities = {
      fileAccess: {
        readFile: () =>
          new Promise((resolve) => setTimeout(() => resolve('late'), 5000)),
        readDirectory: vi.fn(async () => []),
      },
    }

    const pipeName = uniquePipeName()
    const server = await serveLspPipe({
      capabilities: slowCapabilities,
      pipeName,
    })
    servers.push(server)

    const conn = await connectLspPipe({ pipeName })
    // Don't push to connections array since we'll disconnect manually

    const pending = conn.capabilities.fileAccess?.readFile('slow.txt')
    conn.disconnect()

    await expect(pending).rejects.toThrow()

    // Clean up
    await server.close()
  })
})

describe('Pipe IPC - Connection timeout', () => {
  it('connect to non-existent pipe with short timeout rejects', async () => {
    await expect(
      connectLspPipe({
        pipeName: `nonexistent-pipe-${randomUUID()}`,
        connectTimeout: 200,
      }),
    ).rejects.toThrow()
  })
})
