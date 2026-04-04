import { nanoid } from 'nanoid'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { install } from '../mcp/index.js'
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
} from '../mcp/server.fixtures.js'
import type { Diagnostic } from '../types.js'
import { connectPipe, type PipeConnection } from './pipe-client.js'
import { type PipeServer, type ProviderSet, servePipe } from './pipe-server.js'

function uniquePipeName(): string {
  return `mcp-lsp-test-${nanoid()}`
}

const servers: PipeServer[] = []
const connections: PipeConnection[] = []

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

async function setupPipe(providers: ProviderSet, context?: unknown) {
  const pipeName = uniquePipeName()
  const server = await servePipe({
    pipeName,
    createProviders: () => providers,
  })
  servers.push(server)
  const conn = await connectPipe({ pipeName, context })
  connections.push(conn)
  return { server, conn }
}

describe('Pipe IPC - Handshake', () => {
  it('minimal caps: only fileAccess methods', async () => {
    const { conn } = await setupPipe({ fileAccess: createMockFileAccess() })

    expect(conn.availableMethods).toContain('fileAccess.readFile')
    expect(conn.availableMethods).toContain('fileAccess.readDirectory')
    expect(
      conn.availableMethods.filter((m) => !m.startsWith('fileAccess.')),
    ).toHaveLength(0)
  })

  it('full caps: all methods present', async () => {
    const { conn } = await setupPipe({
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
    })

    expect(conn.availableMethods).toContain('fileAccess.readFile')
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

describe('Pipe IPC - Context', () => {
  it('createProviders receives the context sent by the client', async () => {
    const receivedContexts: unknown[] = []
    const pipeName = uniquePipeName()
    const server = await servePipe({
      pipeName,
      createProviders: (ctx) => {
        receivedContexts.push(ctx)
        return { fileAccess: createMockFileAccess() }
      },
    })
    servers.push(server)

    const conn = await connectPipe({
      pipeName,
      context: { workspacePath: '/home/user/project' },
    })
    connections.push(conn)

    expect(receivedContexts).toHaveLength(1)
    expect(receivedContexts[0]).toStrictEqual({
      workspacePath: '/home/user/project',
    })
  })

  it('different clients send different contexts and get independent providers', async () => {
    const receivedContexts: unknown[] = []
    const pipeName = uniquePipeName()
    const server = await servePipe({
      pipeName,
      createProviders: (ctx) => {
        receivedContexts.push(ctx)
        return { fileAccess: createMockFileAccess() }
      },
    })
    servers.push(server)

    const conn1 = await connectPipe({ pipeName, context: { user: 'alice' } })
    connections.push(conn1)
    const conn2 = await connectPipe({ pipeName, context: { user: 'bob' } })
    connections.push(conn2)

    expect(receivedContexts).toHaveLength(2)
    expect(receivedContexts[0]).toStrictEqual({ user: 'alice' })
    expect(receivedContexts[1]).toStrictEqual({ user: 'bob' })
  })

  it('context-aware providers return context-specific data', async () => {
    const pipeName = uniquePipeName()
    const server = await servePipe({
      pipeName,
      createProviders: (ctx) => {
        const { prefix } = ctx as { prefix: string }
        return {
          fileAccess: {
            readFile: async (uri: string) => `${prefix}:${uri}`,
            readDirectory: async () => [],
          },
        }
      },
    })
    servers.push(server)

    const conn1 = await connectPipe({ pipeName, context: { prefix: 'alpha' } })
    connections.push(conn1)
    const conn2 = await connectPipe({ pipeName, context: { prefix: 'beta' } })
    connections.push(conn2)

    expect(await conn1.fileAccess?.readFile('file.ts')).toBe('alpha:file.ts')
    expect(await conn2.fileAccess?.readFile('file.ts')).toBe('beta:file.ts')
  })

  it('undefined context is passed through', async () => {
    const receivedContexts: unknown[] = []
    const pipeName = uniquePipeName()
    const server = await servePipe({
      pipeName,
      createProviders: (ctx) => {
        receivedContexts.push(ctx)
        return { fileAccess: createMockFileAccess() }
      },
    })
    servers.push(server)

    const conn = await connectPipe({ pipeName })
    connections.push(conn)

    expect(receivedContexts).toHaveLength(1)
    // undefined serializes to null over JSON
    expect(receivedContexts[0]).toBeNull()
  })
})

describe('Pipe IPC - Round-trip', () => {
  it('fileAccess.readFile', async () => {
    const files = { 'test.txt': 'hello world' }
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(files),
    })

    const result = await conn.fileAccess?.readFile('test.txt')
    expect(result).toBe('hello world')
  })

  it('fileAccess.readDirectory', async () => {
    const { conn } = await setupPipe({ fileAccess: createMockFileAccess() })

    const result = await conn.fileAccess?.readDirectory('src')
    expect(result).toStrictEqual(['file1.ts', 'file2.ts', 'subdir'])
  })

  it('definition.provideDefinition', async () => {
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(),
      definition: createMockDefinitionProvider([mockCodeSnippet]),
    })

    const result = await conn.definition?.provideDefinition('path/to/file', {
      line: 0,
      character: 1,
    })
    expect(result).toStrictEqual([mockCodeSnippet])
  })

  it('references.provideReferences', async () => {
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(),
      references: createMockReferencesProvider([mockCodeSnippet]),
    })

    const result = await conn.references?.provideReferences('path/to/file', {
      line: 0,
      character: 1,
    })
    expect(result).toStrictEqual([mockCodeSnippet])
  })

  it('hierarchy.provideCallHierarchy', async () => {
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(),
      hierarchy: createMockHierarchyProvider([mockCodeSnippet]),
    })

    const result = await conn.hierarchy?.provideCallHierarchy(
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
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(),
      diagnostics: createMockDiagnosticsProvider([diag]),
    })

    const result = await conn.diagnostics?.provideDiagnostics('path/to/file')
    expect(result).toStrictEqual([diag])
  })

  it('outline.provideDocumentSymbols', async () => {
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(),
      outline: createMockOutlineProvider([]),
    })

    const result = await conn.outline?.provideDocumentSymbols('path/to/file')
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
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(),
      globalFind: createMockGlobalFindProvider(matches),
    })

    const result = await conn.globalFind?.globalFind('test', {
      caseSensitive: false,
      exactMatch: false,
      regexMode: false,
    })
    expect(result).toStrictEqual(matches)
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
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(),
      graph: createMockGraphProvider(links),
    })

    const result = await conn.graph?.getLinkStructure()
    expect(result).toStrictEqual(links)
  })

  it('frontmatter.getFrontmatter returns metadata', async () => {
    const fm = { title: 'Test', tags: ['a', 'b'] }
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(),
      frontmatter: createMockFrontmatterProvider(fm),
    })

    const result = await conn.frontmatter?.getFrontmatter('test.md')
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

    // Set up pipe server with the real providers
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(files),
      definition: createMockDefinitionProvider([mockCodeSnippet]),
    })

    // Set up MCP using proxy providers from the pipe connection
    const mcpServer = createMockServer()
    const fileAccess = conn.fileAccess ?? createMockFileAccess(files)
    install(mcpServer, fileAccess)
    if (conn.definition) install(mcpServer, conn.definition, { fileAccess })

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
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(),
      diagnostics: {
        provideDiagnostics: vi.fn(async () => []),
        onDiagnosticsChanged: (cb) => {
          serverBroadcast = cb
        },
      },
    })

    const received: string[] = []
    conn.diagnostics?.onDiagnosticsChanged?.((uri) => {
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

    const pipeName = uniquePipeName()
    const server = await servePipe({
      pipeName,
      createProviders: () => ({ fileAccess: createMockFileAccess(files) }),
    })
    servers.push(server)

    const conn1 = await connectPipe({ pipeName })
    connections.push(conn1)
    expect(server.connectionCount).toBe(1)

    const conn2 = await connectPipe({ pipeName })
    connections.push(conn2)
    expect(server.connectionCount).toBe(2)

    // Both get responses
    const [r1, r2] = await Promise.all([
      conn1.fileAccess?.readFile('test.txt'),
      conn2.fileAccess?.readFile('test.txt'),
    ])
    expect(r1).toBe('content-a')
    expect(r2).toBe('content-a')

    // One disconnects, other continues
    conn1.disconnect()
    connections.splice(connections.indexOf(conn1), 1)
    await new Promise((r) => setTimeout(r, 50))
    expect(server.connectionCount).toBe(1)

    const r3 = await conn2.fileAccess?.readFile('test.txt')
    expect(r3).toBe('content-a')
  })

  it('both clients receive notifications via shared subscriber set', async () => {
    // Simulate a shared event bus — this is the idiomatic pattern for
    // broadcasting when each connection gets its own provider instance.
    const subscribers = new Set<(uri: string) => void>()

    const pipeName = uniquePipeName()
    const server = await servePipe({
      pipeName,
      createProviders: () => ({
        fileAccess: createMockFileAccess(),
        diagnostics: {
          provideDiagnostics: vi.fn(async () => []),
          onDiagnosticsChanged: (cb) => {
            subscribers.add(cb)
          },
        },
      }),
    })
    servers.push(server)

    const conn1 = await connectPipe({ pipeName })
    connections.push(conn1)
    const conn2 = await connectPipe({ pipeName })
    connections.push(conn2)

    const received1: string[] = []
    const received2: string[] = []
    conn1.diagnostics?.onDiagnosticsChanged?.((uri) => received1.push(uri))
    conn2.diagnostics?.onDiagnosticsChanged?.((uri) => received2.push(uri))

    // Broadcast to all connections via the shared subscriber set
    for (const cb of subscribers) cb('file.ts')
    await new Promise((r) => setTimeout(r, 50))

    expect(received1).toStrictEqual(['file.ts'])
    expect(received2).toStrictEqual(['file.ts'])
  })
})

describe('Pipe IPC - Error propagation', () => {
  it('server handler throws: client gets rejected promise', async () => {
    const { conn } = await setupPipe({
      fileAccess: createMockFileAccess(), // readFile throws for unknown URIs
    })

    await expect(conn.fileAccess?.readFile('nonexistent.txt')).rejects.toThrow(
      'File not found: nonexistent.txt',
    )
  })
})

describe('Pipe IPC - Cleanup', () => {
  it('server.close() rejects pending client requests', async () => {
    // Create a slow handler to keep a request pending
    const pipeName = uniquePipeName()
    const server = await servePipe({
      pipeName,
      createProviders: () => ({
        fileAccess: {
          readFile: () =>
            new Promise((resolve) => setTimeout(() => resolve('late'), 5000)),
          readDirectory: vi.fn(async () => []),
        },
      }),
    })
    servers.push(server)

    const conn = await connectPipe({ pipeName })
    connections.push(conn)

    // Start a slow request
    const pending = conn.fileAccess?.readFile('slow.txt')

    // Close server while request is pending
    await server.close()

    await expect(pending).rejects.toThrow()
  })

  it('client.disconnect() rejects pending requests', async () => {
    const pipeName = uniquePipeName()
    const server = await servePipe({
      pipeName,
      createProviders: () => ({
        fileAccess: {
          readFile: () =>
            new Promise((resolve) => setTimeout(() => resolve('late'), 5000)),
          readDirectory: vi.fn(async () => []),
        },
      }),
    })
    servers.push(server)

    const conn = await connectPipe({ pipeName })
    // Don't push to connections array since we'll disconnect manually

    const pending = conn.fileAccess?.readFile('slow.txt')
    conn.disconnect()

    await expect(pending).rejects.toThrow()

    // Clean up
    await server.close()
  })
})

describe('Pipe IPC - Connection timeout', () => {
  it('connect to non-existent pipe with short timeout rejects', async () => {
    await expect(
      connectPipe({
        pipeName: `nonexistent-pipe-${nanoid()}`,
        connectTimeout: 200,
      }),
    ).rejects.toThrow()
  })
})
