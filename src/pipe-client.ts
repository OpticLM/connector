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
} from './capabilities.js'
import type { EditProvider, FileAccessProvider } from './interfaces.js'
import { PipeTransport, PROVIDER_METHODS, toPipePath } from './pipe-protocol.js'

export interface connectPipeOptions {
  pipeName: string
  connectTimeout?: number
}

export interface LspPipeConnection {
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
): Promise<LspPipeConnection> {
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

      let diagnosticsCallback: ((uri: string) => void) | undefined
      let fileChangedCallback: ((uri: string) => void) | undefined

      const transport = new PipeTransport(socket, {
        onNotification: (method, params) => {
          if (method === 'onDiagnosticsChanged' && diagnosticsCallback) {
            diagnosticsCallback(params[0] as string)
          }
          if (method === 'onFileChanged' && fileChangedCallback) {
            fileChangedCallback(params[0] as string)
          }
        },
      })

      // Perform handshake
      transport
        .sendRequest('_handshake', [])
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

            // Attach onDiagnosticsChanged to diagnostics provider
            if (
              providerKey === 'diagnostics' &&
              availableMethods.includes('onDiagnosticsChanged')
            ) {
              ;(provider as Record<string, unknown>).onDiagnosticsChanged = (
                callback: (uri: string) => void,
              ) => {
                diagnosticsCallback = callback
              }
            }

            // Attach onFileChanged to fileAccess provider
            if (
              providerKey === 'fileAccess' &&
              availableMethods.includes('onFileChanged')
            ) {
              ;(provider as Record<string, unknown>).onFileChanged = (
                callback: (uri: string) => void,
              ) => {
                fileChangedCallback = callback
              }
            }

            built[providerKey] = provider
          }

          settled = true
          resolve({
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
          })
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
