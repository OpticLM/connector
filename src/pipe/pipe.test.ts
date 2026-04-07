import { nanoid } from 'nanoid'
import { describe, expect, it, vi } from 'vitest'
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
import { connectPipe } from './pipe-client.js'
import { type ProviderSet, servePipe } from './pipe-server.js'

function uniquePipeName(): string {
  return `mcp-lsp-test-${nanoid()}`
}

async function setupPipe(providers: ProviderSet, context?: unknown) {
  const pipeName = uniquePipeName()
  const server = await servePipe({
    pipeName,
    createProviders: () => providers,
  })
  const conn = await connectPipe({ pipeName, context })

  return {
    server,
    conn,
    async [Symbol.asyncDispose]() {
      conn[Symbol.dispose]()
      await server[Symbol.asyncDispose]()
    },
  }
}

describe('Pipe IPC - Handshake', () => {
  it('minimal caps: only fileAccess methods', async () => {
    await using sys = await setupPipe({ fileAccess: createMockFileAccess() })
    const { conn } = sys

    expect(conn.availableMethods).toContain('fileAccess.readFile')
    expect(conn.availableMethods).toContain('fileAccess.readDirectory')
    expect(
      conn.availableMethods.filter((m) => !m.startsWith('fileAccess.')),
    ).toHaveLength(0)
  })

  it('full caps: all methods present', async () => {
    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(),
      edit: createMockEditProvider(),
      definition: createMockDefinitionProvider(),
      references: createMockReferencesProvider(),
      hierarchy: createMockHierarchyProvider(),
      diagnostics: createMockDiagnosticsProvider(),
      outline: createMockOutlineProvider(),
      globalFind: createMockGlobalFindProvider(),
      graph: createMockGraphProvider(),
      frontmatter: createMockFrontmatterProvider(),
    })
    const { conn } = sys

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
  })
})

describe('Pipe IPC - Context', () => {
  it('createProviders receives the context sent by the client', async () => {
    const receivedContexts: unknown[] = []
    const pipeName = uniquePipeName()

    await using _server = await servePipe({
      pipeName,
      createProviders: (ctx) => {
        receivedContexts.push(ctx)
        return { fileAccess: createMockFileAccess() }
      },
    })

    using _conn = await connectPipe({
      pipeName,
      context: { workspacePath: '/home/user/project' },
    })

    expect(receivedContexts).toHaveLength(1)
    expect(receivedContexts[0]).toStrictEqual({
      workspacePath: '/home/user/project',
    })
  })

  it('different clients send different contexts and get independent providers', async () => {
    const receivedContexts: unknown[] = []
    const pipeName = uniquePipeName()

    await using _server = await servePipe({
      pipeName,
      createProviders: (ctx) => {
        receivedContexts.push(ctx)
        return { fileAccess: createMockFileAccess() }
      },
    })

    using _conn1 = await connectPipe({ pipeName, context: { user: 'alice' } })
    using _conn2 = await connectPipe({ pipeName, context: { user: 'bob' } })

    expect(receivedContexts).toHaveLength(2)
    expect(receivedContexts[0]).toStrictEqual({ user: 'alice' })
    expect(receivedContexts[1]).toStrictEqual({ user: 'bob' })
  })

  it('context-aware providers return context-specific data', async () => {
    const pipeName = uniquePipeName()

    await using _server = await servePipe({
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

    using conn1 = await connectPipe({ pipeName, context: { prefix: 'alpha' } })
    using conn2 = await connectPipe({ pipeName, context: { prefix: 'beta' } })

    expect(await conn1.fileAccess?.readFile('file.ts')).toBe('alpha:file.ts')
    expect(await conn2.fileAccess?.readFile('file.ts')).toBe('beta:file.ts')
  })

  it('undefined context is passed through', async () => {
    const receivedContexts: unknown[] = []
    const pipeName = uniquePipeName()

    await using _server = await servePipe({
      pipeName,
      createProviders: (ctx) => {
        receivedContexts.push(ctx)
        return { fileAccess: createMockFileAccess() }
      },
    })

    using _conn = await connectPipe({ pipeName })

    expect(receivedContexts).toHaveLength(1)
    expect(receivedContexts[0]).toBeNull()
  })
})

describe('Pipe IPC - Round-trip', () => {
  it('fileAccess.readFile', async () => {
    const files = { 'test.txt': 'hello world' }
    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(files),
    })

    const result = await sys.conn.fileAccess?.readFile('test.txt')
    expect(result).toBe('hello world')
  })

  it('fileAccess.readDirectory', async () => {
    await using sys = await setupPipe({ fileAccess: createMockFileAccess() })

    const result = await sys.conn.fileAccess?.readDirectory('src')
    expect(result).toStrictEqual(['file1.ts', 'file2.ts', 'subdir'])
  })

  it('definition.provideDefinition', async () => {
    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(),
      definition: createMockDefinitionProvider([mockCodeSnippet]),
    })

    const result = await sys.conn.definition?.provideDefinition(
      'path/to/file',
      {
        line: 0,
        character: 1,
      },
    )
    expect(result).toStrictEqual([mockCodeSnippet])
  })

  it('references.provideReferences', async () => {
    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(),
      references: createMockReferencesProvider([mockCodeSnippet]),
    })

    const result = await sys.conn.references?.provideReferences(
      'path/to/file',
      {
        line: 0,
        character: 1,
      },
    )
    expect(result).toStrictEqual([mockCodeSnippet])
  })

  it('hierarchy.provideCallHierarchy', async () => {
    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(),
      hierarchy: createMockHierarchyProvider([mockCodeSnippet]),
    })

    const result = await sys.conn.hierarchy?.provideCallHierarchy(
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
    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(),
      diagnostics: createMockDiagnosticsProvider([diag]),
    })

    const result =
      await sys.conn.diagnostics?.provideDiagnostics('path/to/file')
    expect(result).toStrictEqual([diag])
  })

  it('outline.provideDocumentSymbols', async () => {
    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(),
      outline: createMockOutlineProvider([]),
    })

    const result =
      await sys.conn.outline?.provideDocumentSymbols('path/to/file')
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
    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(),
      globalFind: createMockGlobalFindProvider(matches),
    })

    const result = await sys.conn.globalFind?.globalFind('test', {
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
    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(),
      graph: createMockGraphProvider(links),
    })

    const result = await sys.conn.graph?.getLinkStructure()
    expect(result).toStrictEqual(links)
  })

  it('frontmatter.getFrontmatter returns metadata', async () => {
    const fm = { title: 'Test', tags: ['a', 'b'] }
    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(),
      frontmatter: createMockFrontmatterProvider(fm),
    })

    const result = await sys.conn.frontmatter?.getFrontmatter('test.md')
    expect(result).toStrictEqual(fm)
  })
})

describe('Pipe IPC - End-to-end with MCP', () => {
  it('goto_definition flows through pipe', async () => {
    const files = {
      'path/to/file': 'MockFileContent',
    }

    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(files),
      definition: createMockDefinitionProvider([mockCodeSnippet]),
    })

    const mcpServer = createMockServer()
    const fileAccess = sys.conn.fileAccess ?? createMockFileAccess(files)
    install(mcpServer, fileAccess)
    if (sys.conn.definition)
      install(mcpServer, sys.conn.definition, { fileAccess })

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

describe('Pipe IPC - Multiple clients', () => {
  it('two clients connected simultaneously', async () => {
    const files = { 'test.txt': 'content-a' }
    const pipeName = uniquePipeName()

    await using server = await servePipe({
      pipeName,
      createProviders: () => ({ fileAccess: createMockFileAccess(files) }),
    })

    const conn1 = await connectPipe({ pipeName })
    expect(server.connectionCount).toBe(1)

    using conn2 = await connectPipe({ pipeName })
    expect(server.connectionCount).toBe(2)

    const [r1, r2] = await Promise.all([
      conn1.fileAccess?.readFile('test.txt'),
      conn2.fileAccess?.readFile('test.txt'),
    ])
    expect(r1).toBe('content-a')
    expect(r2).toBe('content-a')

    conn1[Symbol.dispose]()
    await new Promise((r) => setTimeout(r, 50))
    expect(server.connectionCount).toBe(1)

    const r3 = await conn2.fileAccess?.readFile('test.txt')
    expect(r3).toBe('content-a')
  })
})

describe('Pipe IPC - Error propagation', () => {
  it('server handler throws: client gets rejected promise', async () => {
    await using sys = await setupPipe({
      fileAccess: createMockFileAccess(),
    })

    await expect(
      sys.conn.fileAccess?.readFile('nonexistent.txt'),
    ).rejects.toThrow('File not found: nonexistent.txt')
  })
})

describe('Pipe IPC - Cleanup', () => {
  it('server disposal rejects pending client requests', async () => {
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

    using conn = await connectPipe({ pipeName })
    const pending = conn.fileAccess?.readFile('slow.txt')

    await (server as AsyncDisposable)[Symbol.asyncDispose]()

    await expect(pending).rejects.toThrow()
  })

  it('client disposal rejects pending requests', async () => {
    const pipeName = uniquePipeName()

    await using _server = await servePipe({
      pipeName,
      createProviders: () => ({
        fileAccess: {
          readFile: () =>
            new Promise((resolve) => setTimeout(() => resolve('late'), 5000)),
          readDirectory: vi.fn(async () => []),
        },
      }),
    })

    const conn = await connectPipe({ pipeName })
    const pending = conn.fileAccess?.readFile('slow.txt')

    conn[Symbol.dispose]()

    await expect(pending).rejects.toThrow()
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
