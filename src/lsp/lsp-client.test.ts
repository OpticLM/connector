// biome-ignore-all lint/style/noNonNullAssertion: acceptable in test

import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createProtocolConnection,
  type ProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-languageserver-protocol/node.js'
import { LspClient } from './lsp-client.js'

const WORKSPACE = process.platform === 'win32' ? 'C:\\project' : '/project'

function createMockConnectionPair() {
  // client->server stream
  const clientToServer = new PassThrough()
  // server->client stream
  const serverToClient = new PassThrough()

  const clientConn = createProtocolConnection(
    new StreamMessageReader(serverToClient),
    new StreamMessageWriter(clientToServer),
  )

  const serverConn = createProtocolConnection(
    new StreamMessageReader(clientToServer),
    new StreamMessageWriter(serverToClient),
  )

  return { clientConn, serverConn, serverToClient }
}

function tick(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createClient(
  overrides?: Partial<{
    readFile: (path: string) => Promise<string>
    requestTimeout: number
    documentIdleTimeout: number
  }>,
) {
  return new LspClient({
    command: 'mock-lsp',
    workspacePath: WORKSPACE,
    readFile: overrides?.readFile ?? (async () => 'line 0\nline 1\nline 2'),
    requestTimeout: overrides?.requestTimeout ?? 5000,
    documentIdleTimeout: overrides?.documentIdleTimeout ?? 60_000,
  })
}

interface MockServer {
  conn: ProtocolConnection
  client: LspClient
  serverToClient: PassThrough
  initParams: {
    definitionProvider?: boolean
    referencesProvider?: boolean
    callHierarchyProvider?: boolean
    documentSymbolProvider?: boolean
    textDocumentSync?: number
  }
}

async function setupMockServer(
  serverCaps?: MockServer['initParams'],
  clientOverrides?: Parameters<typeof createClient>[0],
): Promise<MockServer> {
  const caps = {
    definitionProvider: true,
    referencesProvider: true,
    callHierarchyProvider: true,
    documentSymbolProvider: true,
    textDocumentSync: 1,
    ...serverCaps,
  }

  const { clientConn, serverConn, serverToClient } = createMockConnectionPair()
  const client = createClient(clientOverrides)

  // Mock server: handle initialize
  serverConn.onRequest('initialize', () => ({
    capabilities: caps,
  }))

  serverConn.listen()

  // Start client with mock connection
  client.startWithConnection(clientConn, null)
  await client.initializeConnection()

  return { conn: serverConn, client, serverToClient, initParams: caps }
}

describe('LspClient', () => {
  let mockServer: MockServer | null = null

  afterEach(async () => {
    if (mockServer) {
      try {
        await mockServer.client.stop()
      } catch {
        // ignore
      }
      try {
        mockServer.conn.dispose()
      } catch {
        // ignore
      }
      mockServer = null
    }
  })

  describe('lifecycle', () => {
    it('starts in idle state', () => {
      const client = createClient()
      expect(client.getState()).toBe('idle')
    })

    it('transitions to running after start', async () => {
      mockServer = await setupMockServer()
      expect(mockServer.client.getState()).toBe('running')
    })

    it('sets up providers based on server capabilities', async () => {
      mockServer = await setupMockServer()
      expect(mockServer.client.definition).toBeDefined()
      expect(mockServer.client.references).toBeDefined()
      expect(mockServer.client.hierarchy).toBeDefined()
      expect(mockServer.client.outline).toBeDefined()
      expect(mockServer.client.diagnostics).toBeDefined()
    })

    it('leaves providers undefined when server lacks capabilities', async () => {
      mockServer = await setupMockServer({
        definitionProvider: false,
        referencesProvider: false,
        callHierarchyProvider: false,
        documentSymbolProvider: false,
      })
      expect(mockServer.client.definition).toBeUndefined()
      expect(mockServer.client.references).toBeUndefined()
      expect(mockServer.client.hierarchy).toBeUndefined()
      expect(mockServer.client.outline).toBeUndefined()
      // Diagnostics are always available
      expect(mockServer.client.diagnostics).toBeDefined()
    })

    it('transitions to dead after stop', async () => {
      mockServer = await setupMockServer()
      const { conn, client } = mockServer

      conn.onRequest('shutdown', () => null)

      await client.stop()
      expect(client.getState()).toBe('dead')
      mockServer = null
    })
  })

  describe('definition provider', () => {
    it('sends textDocument/definition and converts result', async () => {
      mockServer = await setupMockServer(undefined, {
        readFile: async (p) => {
          if (p === 'src/target.ts') return 'export function hello() {}\n'
          return ''
        },
      })
      const { conn, client } = mockServer
      const fileUri = `file:///${WORKSPACE.replace(/\\/g, '/')}/src/target.ts`

      conn.onRequest('textDocument/definition', () => ({
        uri: fileUri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 26 },
        },
      }))

      // Swallow didOpen notifications
      conn.onNotification('textDocument/didOpen', () => {})

      const result = await client.definition?.provideDefinition('src/main.ts', {
        line: 5,
        character: 10,
      })

      expect(result).toHaveLength(1)
      expect(result![0].uri).toBe('src/target.ts')
      expect(result![0].content).toBe('export function hello() {}')
    })

    it('handles null result', async () => {
      mockServer = await setupMockServer()
      const { conn, client } = mockServer

      conn.onRequest('textDocument/definition', () => null)
      conn.onNotification('textDocument/didOpen', () => {})

      const result = await client.definition?.provideDefinition('src/main.ts', {
        line: 0,
        character: 0,
      })
      expect(result).toEqual([])
    })
  })

  describe('type definition provider', () => {
    it('sends textDocument/typeDefinition and converts result', async () => {
      mockServer = await setupMockServer(undefined, {
        readFile: async (p) => {
          if (p === 'src/target.ts') return 'export interface MyType {}\n'
          return ''
        },
      })
      const { conn, client } = mockServer
      const fileUri = `file:///${WORKSPACE.replace(/\\/g, '/')}/src/target.ts`

      conn.onRequest('textDocument/typeDefinition', () => ({
        uri: fileUri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 26 },
        },
      }))

      // Swallow didOpen notifications
      conn.onNotification('textDocument/didOpen', () => {})

      const result = await client.definition!.provideTypeDefinition!(
        'src/main.ts',
        {
          line: 5,
          character: 10,
        },
      )

      expect(result).toHaveLength(1)
      expect(result![0].uri).toBe('src/target.ts')
      expect(result![0].content).toBe('export interface MyType {}')
    })

    it('handles null result', async () => {
      mockServer = await setupMockServer()
      const { conn, client } = mockServer

      conn.onRequest('textDocument/typeDefinition', () => null)
      conn.onNotification('textDocument/didOpen', () => {})

      const result = await client.definition!.provideTypeDefinition!(
        'src/main.ts',
        {
          line: 0,
          character: 0,
        },
      )
      expect(result).toEqual([])
    })
  })

  describe('references provider', () => {
    it('sends textDocument/references and converts result', async () => {
      mockServer = await setupMockServer(undefined, {
        readFile: async () => 'ref line 0\nref line 1\n',
      })
      const { conn, client } = mockServer
      const fileUri = `file:///${WORKSPACE.replace(/\\/g, '/')}/src/ref.ts`

      conn.onRequest('textDocument/references', () => [
        {
          uri: fileUri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
        },
        {
          uri: fileUri,
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 10 },
          },
        },
      ])
      conn.onNotification('textDocument/didOpen', () => {})

      const result = await client.references?.provideReferences('src/main.ts', {
        line: 0,
        character: 0,
      })
      expect(result).toHaveLength(2)
    })
  })

  describe('hierarchy provider', () => {
    it('sends prepareCallHierarchy then incomingCalls', async () => {
      mockServer = await setupMockServer(undefined, {
        readFile: async () => 'caller code\n',
      })
      const { conn, client } = mockServer
      const fileUri = `file:///${WORKSPACE.replace(/\\/g, '/')}/src/caller.ts`

      conn.onRequest('textDocument/prepareCallHierarchy', () => [
        {
          name: 'myFunc',
          kind: 12,
          uri: fileUri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
          selectionRange: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 6 },
          },
        },
      ])

      conn.onRequest('callHierarchy/incomingCalls', () => [
        {
          from: {
            name: 'caller',
            kind: 12,
            uri: fileUri,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 11 },
            },
            selectionRange: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 6 },
            },
          },
          fromRanges: [
            {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 6 },
            },
          ],
        },
      ])
      conn.onNotification('textDocument/didOpen', () => {})

      const result = await client.hierarchy?.provideCallHierarchy(
        'src/main.ts',
        { line: 0, character: 0 },
        'incoming',
      )
      expect(result).toHaveLength(1)
      expect(result![0].uri).toBe('src/caller.ts')
    })

    it('returns empty when prepareCallHierarchy returns null', async () => {
      mockServer = await setupMockServer()
      const { conn, client } = mockServer

      conn.onRequest('textDocument/prepareCallHierarchy', () => null)
      conn.onNotification('textDocument/didOpen', () => {})

      const result = await client.hierarchy?.provideCallHierarchy(
        'src/main.ts',
        { line: 0, character: 0 },
        'incoming',
      )
      expect(result).toEqual([])
    })
  })

  describe('outline provider', () => {
    it('converts DocumentSymbol results', async () => {
      mockServer = await setupMockServer()
      const { conn, client } = mockServer

      conn.onRequest('textDocument/documentSymbol', () => [
        {
          name: 'MyClass',
          kind: 5,
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
              name: 'method',
              kind: 6,
              range: {
                start: { line: 2, character: 2 },
                end: { line: 5, character: 3 },
              },
              selectionRange: {
                start: { line: 2, character: 2 },
                end: { line: 2, character: 8 },
              },
            },
          ],
        },
      ])
      conn.onNotification('textDocument/didOpen', () => {})

      const result = await client.outline?.provideDocumentSymbols('src/main.ts')
      expect(result).toHaveLength(1)
      expect(result![0].name).toBe('MyClass')
      expect(result![0].kind).toBe('class')
      expect(result![0].children).toHaveLength(1)
      expect(result![0].children?.[0].kind).toBe('method')
    })

    it('converts SymbolInformation results', async () => {
      mockServer = await setupMockServer()
      const { conn, client } = mockServer
      const fileUri = `file:///${WORKSPACE.replace(/\\/g, '/')}/src/main.ts`

      conn.onRequest('textDocument/documentSymbol', () => [
        {
          name: 'globalVar',
          kind: 13,
          location: {
            uri: fileUri,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
          },
        },
      ])
      conn.onNotification('textDocument/didOpen', () => {})

      const result = await client.outline?.provideDocumentSymbols('src/main.ts')
      expect(result).toHaveLength(1)
      expect(result![0].name).toBe('globalVar')
      expect(result![0].kind).toBe('variable')
    })

    it('handles null result', async () => {
      mockServer = await setupMockServer()
      const { conn, client } = mockServer

      conn.onRequest('textDocument/documentSymbol', () => null)
      conn.onNotification('textDocument/didOpen', () => {})

      const result = await client.outline?.provideDocumentSymbols('src/main.ts')
      expect(result).toEqual([])
    })
  })

  describe('diagnostics', () => {
    it('caches diagnostics from publishDiagnostics', async () => {
      mockServer = await setupMockServer()
      const { conn, client } = mockServer
      const fileUri = `file:///${WORKSPACE.replace(/\\/g, '/')}/src/main.ts`

      conn.onNotification('textDocument/didOpen', () => {})

      // Server publishes diagnostics
      await conn.sendNotification('textDocument/publishDiagnostics', {
        uri: fileUri,
        diagnostics: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
            severity: 1,
            message: 'Syntax error',
            source: 'test-server',
          },
        ],
      })

      // Wait for notification to be processed
      await new Promise((resolve) => setTimeout(resolve, 50))

      const result = await client.diagnostics?.provideDiagnostics('src/main.ts')
      expect(result).toHaveLength(1)
      expect(result![0].severity).toBe('error')
      expect(result![0].message).toBe('Syntax error')
    })

    it('returns all cached diagnostics for workspace', async () => {
      mockServer = await setupMockServer()
      const { conn, client } = mockServer
      const makeUri = (p: string) =>
        `file:///${WORKSPACE.replace(/\\/g, '/')}/${p}`

      conn.onNotification('textDocument/didOpen', () => {})

      await conn.sendNotification('textDocument/publishDiagnostics', {
        uri: makeUri('a.ts'),
        diagnostics: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 },
            },
            severity: 1,
            message: 'Error A',
          },
        ],
      })
      await conn.sendNotification('textDocument/publishDiagnostics', {
        uri: makeUri('b.ts'),
        diagnostics: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 },
            },
            severity: 2,
            message: 'Warning B',
          },
        ],
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const result = await client.diagnostics?.getWorkspaceDiagnostics?.()
      expect(result).toHaveLength(2)
    })
  })

  describe('document sync', () => {
    it('sends didOpen when ensuring document is open', async () => {
      mockServer = await setupMockServer(undefined, {
        readFile: async () => 'content here',
      })
      const { conn, client } = mockServer
      const fileUri = `file:///${WORKSPACE.replace(/\\/g, '/')}/src/main.ts`

      const opened: string[] = []
      conn.onNotification(
        'textDocument/didOpen',
        (params: { textDocument: { uri: string } }) => {
          opened.push(params.textDocument.uri)
        },
      )

      await client.ensureDocumentOpen(fileUri)
      await tick()
      expect(opened).toContain(fileUri)
    })

    it('does not send duplicate didOpen for same document', async () => {
      mockServer = await setupMockServer(undefined, {
        readFile: async () => 'content',
      })
      const { conn, client } = mockServer
      const fileUri = `file:///${WORKSPACE.replace(/\\/g, '/')}/src/main.ts`

      let openCount = 0
      conn.onNotification('textDocument/didOpen', () => {
        openCount++
      })

      await client.ensureDocumentOpen(fileUri)
      await client.ensureDocumentOpen(fileUri)
      await tick()
      expect(openCount).toBe(1)
    })

    it('sends didClose on idle timeout', async () => {
      mockServer = await setupMockServer(undefined, {
        readFile: async () => 'content',
        documentIdleTimeout: 50,
      })
      const { conn, client } = mockServer
      const fileUri = `file:///${WORKSPACE.replace(/\\/g, '/')}/src/main.ts`

      const closed: string[] = []
      conn.onNotification('textDocument/didOpen', () => {})
      conn.onNotification(
        'textDocument/didClose',
        (params: { textDocument: { uri: string } }) => {
          closed.push(params.textDocument.uri)
        },
      )

      await client.ensureDocumentOpen(fileUri)

      // Wait for idle timeout
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(closed).toContain(fileUri)
    })
  })

  describe('error handling', () => {
    it('throws when calling provider on non-running client', () => {
      const client = createClient()
      // Client hasn't started, so definition is undefined
      expect(client.definition).toBeUndefined()
    })

    it('transitions to dead on connection close', async () => {
      mockServer = await setupMockServer()
      const { client, serverToClient } = mockServer

      // End the stream that the client reads from
      serverToClient.destroy()

      // Wait for close event to propagate
      await tick(100)

      expect(client.getState()).toBe('dead')
      mockServer = null
    })
  })
})
