import { type ChildProcess, spawn } from 'node:child_process'
import {
  type BaseSymbolInformation,
  type CallHierarchyIncomingCall,
  type CallHierarchyItem,
  type CallHierarchyOutgoingCall,
  CancellationTokenSource,
  type ClientCapabilities,
  createProtocolConnection,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  type DocumentSymbol,
  ExitNotification,
  InitializedNotification,
  InitializeRequest,
  type Location,
  type LocationLink,
  type MessageReader,
  type MessageWriter,
  type ProtocolConnection,
  type PublishDiagnosticsParams,
  type ServerCapabilities,
  ShutdownRequest,
  StreamMessageReader,
  StreamMessageWriter,
  type SymbolInformation,
} from 'vscode-languageserver-protocol/node.js'
import type {
  DefinitionProvider,
  DiagnosticsProvider,
  HierarchyProvider,
  OutlineProvider,
  ReferencesProvider,
} from '../capabilities.js'
import type {
  CodeSnippet,
  Diagnostic,
  ExactPosition,
  UnifiedUri,
} from '../types.js'
import {
  convertLocationsToSnippets,
  convertLspDiagnostic,
  convertLspDocumentSymbol,
  convertSymbolInformation,
  guessLanguageId,
  lspUriToPath,
  pathToLspUri,
} from './lsp-converters.js'

export interface LspClientOptions {
  command: string
  args?: string[]
  workspacePath: string
  readFile: (path: string) => Promise<string>
  env?: Record<string, string>
  initializationOptions?: unknown
  documentIdleTimeout?: number
  requestTimeout?: number
}

export type LspClientState = 'idle' | 'starting' | 'running' | 'dead'

interface OpenDocument {
  uri: string
  version: number
  closeTimer: ReturnType<typeof setTimeout> | null
}

export class LspClient implements AsyncDisposable {
  private state: LspClientState = 'idle'
  private process: ChildProcess | null = null
  private connection: ProtocolConnection | null = null
  private openDocuments = new Map<string, OpenDocument>()
  private diagnosticsCache = new Map<string, Diagnostic[]>()

  readonly definition: DefinitionProvider | undefined
  readonly references: ReferencesProvider | undefined
  readonly hierarchy: HierarchyProvider | undefined
  readonly outline: OutlineProvider | undefined
  readonly diagnostics: DiagnosticsProvider | undefined

  private readonly options: Required<
    Pick<LspClientOptions, 'documentIdleTimeout' | 'requestTimeout'>
  > &
    LspClientOptions

  constructor(options: LspClientOptions) {
    this.options = {
      documentIdleTimeout: 30_000,
      requestTimeout: 30_000,
      ...options,
    }

    // Providers are set up in start() based on server capabilities.
    // Define them as stubs that will be replaced.
    this.definition = undefined
    this.references = undefined
    this.hierarchy = undefined
    this.outline = undefined
    this.diagnostics = undefined
  }

  getState(): LspClientState {
    return this.state
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start: client is in "${this.state}" state`)
    }
    this.state = 'starting'

    try {
      const connection = this.spawnAndConnect()
      this.connection = connection

      connection.onClose(() => {
        if (this.state === 'running' || this.state === 'starting') {
          this.transitionToDead()
        }
      })

      connection.listen()

      const initResult = await this.sendInitialize()
      const caps = initResult.capabilities

      this.setupProviders(caps)

      await connection.sendNotification(InitializedNotification.type, {})
      this.state = 'running'
    } catch (err) {
      this.transitionToDead()
      throw err
    }
  }

  async stop(): Promise<void> {
    if (this.state !== 'running') return

    // Close all open documents
    const closePromises = [...this.openDocuments.keys()].map((uri) =>
      this.closeDocument(uri),
    )
    await Promise.all(closePromises)

    try {
      await this.connection?.sendRequest(ShutdownRequest.type)
      await this.connection?.sendNotification(ExitNotification.type)
    } catch {
      // Server may have already exited
    }

    this.cleanup()
  }

  async [Symbol.asyncDispose]() {
    await this.stop()
  }

  async notifyFileChanged(sdkPath: string): Promise<void> {
    if (this.state !== 'running') return

    const lspUri = pathToLspUri(this.options.workspacePath, sdkPath)
    const doc = this.openDocuments.get(lspUri)
    if (!doc) return

    // Close and reopen with fresh content
    await this.closeDocument(lspUri)
    await this.ensureDocumentOpen(lspUri)
  }

  // --- Internal methods ---

  /** @internal Exposed for testing with mock connections */
  startWithConnection(
    connection: ProtocolConnection,
    process: ChildProcess | null,
  ): void {
    this.connection = connection
    this.process = process
  }

  /** @internal Runs initialize handshake and sets up providers */
  async initializeConnection(): Promise<void> {
    const connection = this.connection
    if (!connection) throw new Error('Connection not set')
    this.state = 'starting'

    connection.onClose(() => {
      if (this.state === 'running' || this.state === 'starting') {
        this.transitionToDead()
      }
    })

    connection.listen()

    const initResult = await this.sendInitialize()
    const caps = initResult.capabilities

    this.setupProviders(caps)

    connection.onNotification(
      'textDocument/publishDiagnostics',
      (params: PublishDiagnosticsParams) => {
        const sdkPath = lspUriToPath(this.options.workspacePath, params.uri)
        const diagnostics = params.diagnostics.map((d) =>
          convertLspDiagnostic(this.options.workspacePath, params.uri, d),
        )
        this.diagnosticsCache.set(sdkPath, diagnostics)
      },
    )

    await connection.sendNotification(InitializedNotification.type, {})
    this.state = 'running'
  }

  private spawnAndConnect(): ProtocolConnection {
    const proc = spawn(this.options.command, this.options.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.options.env
        ? { ...process.env, ...this.options.env }
        : process.env,
    })

    this.process = proc

    proc.on('exit', () => {
      if (this.state === 'running' || this.state === 'starting') {
        this.transitionToDead()
      }
    })

    const reader: MessageReader = new StreamMessageReader(proc.stdout)
    const writer: MessageWriter = new StreamMessageWriter(proc.stdin)

    return createProtocolConnection(reader, writer)
  }

  private async sendInitialize() {
    if (!this.connection) throw new Error('No connection')

    const clientCapabilities: ClientCapabilities = {
      textDocument: {
        synchronization: {
          dynamicRegistration: false,
          didSave: true,
        },
        definition: { dynamicRegistration: false },
        references: { dynamicRegistration: false },
        callHierarchy: { dynamicRegistration: false },
        documentSymbol: {
          dynamicRegistration: false,
          hierarchicalDocumentSymbolSupport: true,
        },
        publishDiagnostics: {
          relatedInformation: true,
        },
      },
    }

    const result = await this.connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      capabilities: clientCapabilities,
      rootUri: pathToLspUri(this.options.workspacePath, '.'),
      initializationOptions: this.options.initializationOptions ?? null,
    })

    return result
  }

  private setupProviders(caps: ServerCapabilities): void {
    if (caps.definitionProvider) {
      ;(this as { definition: DefinitionProvider | undefined }).definition = {
        provideDefinition: (uri, position) =>
          this.provideDefinition(uri, position),
        provideTypeDefinition: (uri, position) =>
          this.provideTypeDefinition(uri, position),
      }
    }

    if (caps.referencesProvider) {
      ;(this as { references: ReferencesProvider | undefined }).references = {
        provideReferences: (uri, position) =>
          this.provideReferences(uri, position),
        provideFileReferences: (uri) => this.provideFileReferences(uri),
      }
    }

    if (caps.callHierarchyProvider) {
      ;(this as { hierarchy: HierarchyProvider | undefined }).hierarchy = {
        provideCallHierarchy: (uri, position, direction) =>
          this.provideCallHierarchy(uri, position, direction),
      }
    }

    if (caps.documentSymbolProvider) {
      ;(this as { outline: OutlineProvider | undefined }).outline = {
        provideDocumentSymbols: (uri) => this.provideDocumentSymbols(uri),
      }
    }

    ;(this as { diagnostics: DiagnosticsProvider | undefined }).diagnostics = {
      provideDiagnostics: (uri) => this.provideDiagnostics(uri),
      getWorkspaceDiagnostics: () => this.getWorkspaceDiagnostics(),
    }
  }

  private assertRunning(): ProtocolConnection {
    if (this.state !== 'running') {
      throw new Error(`Client is not running (state: "${this.state}")`)
    }
    if (!this.connection) {
      throw new Error('No connection')
    }
    return this.connection
  }

  private createTimeout(): {
    token: CancellationTokenSource
    promise: Promise<never>
    clear: () => void
  } {
    const cts = new CancellationTokenSource()
    let timer: ReturnType<typeof setTimeout> | undefined
    const promise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        cts.cancel()
        reject(new Error('LSP request timed out'))
      }, this.options.requestTimeout)
    })
    return {
      token: cts,
      promise,
      clear: () => {
        if (timer) clearTimeout(timer)
      },
    }
  }

  private async sendRequest<R>(method: string, params: unknown): Promise<R> {
    const conn = this.assertRunning()
    const timeout = this.createTimeout()
    try {
      const result = await Promise.race([
        conn.sendRequest<R>(method, params, timeout.token.token),
        timeout.promise,
      ])
      return result
    } finally {
      timeout.clear()
    }
  }

  async ensureDocumentOpen(lspUri: string): Promise<void> {
    const existing = this.openDocuments.get(lspUri)
    if (existing) {
      // Reset idle timer
      if (existing.closeTimer) clearTimeout(existing.closeTimer)
      existing.closeTimer = this.scheduleDocumentClose(lspUri)
      return
    }

    const sdkPath = lspUriToPath(this.options.workspacePath, lspUri)
    const content = await this.options.readFile(sdkPath)
    const languageId = guessLanguageId(sdkPath)

    const doc: OpenDocument = {
      uri: lspUri,
      version: 1,
      closeTimer: this.scheduleDocumentClose(lspUri),
    }

    this.openDocuments.set(lspUri, doc)

    await this.connection?.sendNotification(
      DidOpenTextDocumentNotification.type,
      {
        textDocument: {
          uri: lspUri,
          languageId,
          version: doc.version,
          text: content,
        },
      },
    )
  }

  private scheduleDocumentClose(lspUri: string): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      this.closeDocument(lspUri)
    }, this.options.documentIdleTimeout)
  }

  private async closeDocument(lspUri: string): Promise<void> {
    const doc = this.openDocuments.get(lspUri)
    if (!doc) return

    if (doc.closeTimer) clearTimeout(doc.closeTimer)
    this.openDocuments.delete(lspUri)

    if (this.connection && this.state === 'running') {
      try {
        await this.connection.sendNotification(
          DidCloseTextDocumentNotification.type,
          {
            textDocument: { uri: lspUri },
          },
        )
      } catch {
        // Connection may be closed
      }
    }
  }

  // --- Provider implementations ---

  private async provideDefinition(
    uri: UnifiedUri,
    position: ExactPosition,
  ): Promise<CodeSnippet[]> {
    const lspUri = pathToLspUri(this.options.workspacePath, uri)
    await this.ensureDocumentOpen(lspUri)

    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri: lspUri },
      position: { line: position.line, character: position.character },
    })

    return convertLocationsToSnippets(
      this.options.workspacePath,
      result as Location | Location[] | LocationLink[] | null,
      this.options.readFile,
    )
  }

  private async provideTypeDefinition(
    uri: UnifiedUri,
    position: ExactPosition,
  ): Promise<CodeSnippet[]> {
    const lspUri = pathToLspUri(this.options.workspacePath, uri)
    await this.ensureDocumentOpen(lspUri)

    const result = await this.sendRequest('textDocument/typeDefinition', {
      textDocument: { uri: lspUri },
      position: { line: position.line, character: position.character },
    })

    return convertLocationsToSnippets(
      this.options.workspacePath,
      result as Location | Location[] | LocationLink[] | null,
      this.options.readFile,
    )
  }

  private async provideReferences(
    uri: UnifiedUri,
    position: ExactPosition,
  ): Promise<CodeSnippet[]> {
    const lspUri = pathToLspUri(this.options.workspacePath, uri)
    await this.ensureDocumentOpen(lspUri)

    const result = await this.sendRequest('textDocument/references', {
      textDocument: { uri: lspUri },
      position: { line: position.line, character: position.character },
      context: { includeDeclaration: true },
    })

    return convertLocationsToSnippets(
      this.options.workspacePath,
      result as Location[] | null,
      this.options.readFile,
    )
  }

  private async provideFileReferences(uri: UnifiedUri): Promise<CodeSnippet[]> {
    const lspUri = pathToLspUri(this.options.workspacePath, uri)
    await this.ensureDocumentOpen(lspUri)

    const result = await this.sendRequest('textDocument/references', {
      textDocument: { uri: lspUri },
      position: { line: 0, character: 0 },
      context: { includeDeclaration: false },
    })

    return convertLocationsToSnippets(
      this.options.workspacePath,
      result as Location[] | null,
      this.options.readFile,
    )
  }

  private async provideCallHierarchy(
    uri: UnifiedUri,
    position: ExactPosition,
    direction: 'incoming' | 'outgoing',
  ): Promise<CodeSnippet[]> {
    const lspUri = pathToLspUri(this.options.workspacePath, uri)
    await this.ensureDocumentOpen(lspUri)

    const items = await this.sendRequest<CallHierarchyItem[] | null>(
      'textDocument/prepareCallHierarchy',
      {
        textDocument: { uri: lspUri },
        position: { line: position.line, character: position.character },
      },
    )

    if (!items || items.length === 0) return []

    const item = items[0]
    const method =
      direction === 'incoming'
        ? 'callHierarchy/incomingCalls'
        : 'callHierarchy/outgoingCalls'

    const calls = await this.sendRequest<
      CallHierarchyIncomingCall[] | CallHierarchyOutgoingCall[] | null
    >(method, { item })

    if (!calls || calls.length === 0) return []

    const locations: Location[] = calls.map((call) => {
      const target =
        'from' in call
          ? (call as CallHierarchyIncomingCall).from
          : (call as CallHierarchyOutgoingCall).to
      return {
        uri: target.uri,
        range: target.selectionRange,
      }
    })

    return convertLocationsToSnippets(
      this.options.workspacePath,
      locations,
      this.options.readFile,
    )
  }

  private async provideDocumentSymbols(uri: UnifiedUri) {
    const lspUri = pathToLspUri(this.options.workspacePath, uri)
    await this.ensureDocumentOpen(lspUri)

    const result = await this.sendRequest<
      DocumentSymbol[] | BaseSymbolInformation[] | null
    >('textDocument/documentSymbol', {
      textDocument: { uri: lspUri },
    })

    if (!result || result.length === 0) return []

    // Distinguish DocumentSymbol[] vs SymbolInformation[]
    const first = result[0]
    if (first && 'range' in first && 'selectionRange' in first) {
      return (result as DocumentSymbol[]).map(convertLspDocumentSymbol)
    }
    return (result as SymbolInformation[]).map((si) =>
      convertSymbolInformation(this.options.workspacePath, si),
    )
  }

  private async provideDiagnostics(uri: UnifiedUri): Promise<Diagnostic[]> {
    this.assertRunning()

    const lspUri = pathToLspUri(this.options.workspacePath, uri)
    await this.ensureDocumentOpen(lspUri)

    // Give the server a moment to publish diagnostics if not cached
    const cached = this.diagnosticsCache.get(uri)
    if (cached) return cached

    // Wait briefly for diagnostics to arrive
    await new Promise((resolve) => setTimeout(resolve, 200))
    return this.diagnosticsCache.get(uri) ?? []
  }

  private async getWorkspaceDiagnostics(): Promise<Diagnostic[]> {
    this.assertRunning()
    const all: Diagnostic[] = []
    for (const diagnostics of this.diagnosticsCache.values()) {
      all.push(...diagnostics)
    }
    return all
  }

  private transitionToDead(): void {
    this.state = 'dead'
    this.cleanup()
  }

  private cleanup(): void {
    for (const doc of this.openDocuments.values()) {
      if (doc.closeTimer) clearTimeout(doc.closeTimer)
    }
    this.openDocuments.clear()

    if (this.connection) {
      try {
        this.connection.dispose()
      } catch {
        // ignore
      }
      this.connection = null
    }

    if (this.process) {
      try {
        this.process.kill()
      } catch {
        // ignore
      }
      this.process = null
    }

    this.state = 'dead'
  }
}

export function createLspClient(options: LspClientOptions): LspClient {
  return new LspClient(options)
}
