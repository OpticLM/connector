import { connect } from 'node:net'
import type {
  DefinitionProvider,
  DiagnosticsProvider,
  FrontmatterProvider,
  GlobalFindProvider,
  GraphProvider,
  HierarchyProvider,
  OutlineProvider,
  ReferencesProvider,
} from '../capabilities.js'
import type { EditProvider, FileAccessProvider } from '../interfaces.js'
import { PipeTransport, PROVIDER_METHODS, toPipePath } from './pipe-protocol.js'

export interface connectPipeOptions {
  pipeName: string
  connectTimeout?: number
  context?: unknown
}

export interface PipeConnection extends Disposable {
  readonly fileAccess?: FileAccessProvider
  readonly edit?: EditProvider
  readonly definition?: DefinitionProvider
  readonly references?: ReferencesProvider
  readonly hierarchy?: HierarchyProvider
  readonly diagnostics?: DiagnosticsProvider
  readonly outline?: OutlineProvider
  readonly globalFind?: GlobalFindProvider
  readonly graph?: GraphProvider
  readonly frontmatter?: FrontmatterProvider
  readonly availableMethods: string[]
  disconnect(): void
}

export function connectPipe(
  options: connectPipeOptions,
): Promise<PipeConnection> {
  const { pipeName, connectTimeout = 5000 } = options
  const pipePath = toPipePath(pipeName)

  return new Promise((resolve, reject) => {
    const socket = connect(pipePath)
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        socket.destroy()
        reject(new Error(`Connection timeout after ${connectTimeout}ms`))
      }
    }, connectTimeout)

    socket.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(err)
      }
    })

    socket.on('connect', () => {
      clearTimeout(timer)
      if (settled) return

      const transport = new PipeTransport(socket)

      // Perform handshake — send client context so server can create providers
      transport
        .sendRequest('_handshake', [options.context])
        .then((raw) => {
          if (settled) return
          const handshakeResult = raw as { methods: string[] }
          const availableMethods = handshakeResult.methods

          // Build proxy providers
          const built: Record<
            string,
            Record<string, (...args: unknown[]) => Promise<unknown>>
          > = {}

          for (const { providerKey, methods } of PROVIDER_METHODS) {
            const present = methods.filter((m) =>
              availableMethods.includes(`${providerKey}.${m}`),
            )
            if (present.length === 0) continue

            const provider: Record<
              string,
              (...args: unknown[]) => Promise<unknown>
            > = {}
            for (const method of present) {
              provider[method] = (...args: unknown[]) =>
                transport.sendRequest(`${providerKey}.${method}`, args)
            }

            built[providerKey] = provider
          }

          settled = true

          const pipeConnection: PipeConnection = {
            fileAccess: built.fileAccess as FileAccessProvider | undefined,
            edit: built.edit as EditProvider | undefined,
            definition: built.definition as DefinitionProvider | undefined,
            references: built.references as ReferencesProvider | undefined,
            hierarchy: built.hierarchy as HierarchyProvider | undefined,
            diagnostics: built.diagnostics as DiagnosticsProvider | undefined,
            outline: built.outline as OutlineProvider | undefined,
            globalFind: built.globalFind as GlobalFindProvider | undefined,
            graph: built.graph as GraphProvider | undefined,
            frontmatter: built.frontmatter as FrontmatterProvider | undefined,
            availableMethods,
            disconnect() {
              transport.destroy()
            },
            [Symbol.dispose]() {
              this.disconnect()
            },
          }

          resolve(pipeConnection)
        })
        .catch((err: unknown) => {
          if (!settled) {
            settled = true
            transport.destroy()
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        })
    })
  })
}
