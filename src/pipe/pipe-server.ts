import { unlinkSync } from 'node:fs'
import { createServer } from 'node:net'
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

export interface ProviderSet {
  fileAccess: FileAccessProvider
  edit?: EditProvider
  definition?: DefinitionProvider
  references?: ReferencesProvider
  hierarchy?: HierarchyProvider
  diagnostics?: DiagnosticsProvider
  outline?: OutlineProvider
  globalFind?: GlobalFindProvider
  graph?: GraphProvider
  frontmatter?: FrontmatterProvider
}

export interface ServePipeOptions {
  pipeName: string
  createProviders: (context: unknown) => ProviderSet | Promise<ProviderSet>
}

export interface PipeServer extends AsyncDisposable {
  readonly pipePath: string
  readonly connectionCount: number
  close(): Promise<void>
}

type MethodHandler = (...args: unknown[]) => Promise<unknown>

export function servePipe(options: ServePipeOptions): Promise<PipeServer> {
  const { pipeName } = options
  const pipePath = toPipePath(pipeName)

  const connections = new Set<PipeTransport>()

  const server = createServer((socket) => {
    let registry: Map<string, MethodHandler> | null = null

    const transport = new PipeTransport(socket, {
      onRequest: async (method, params) => {
        if (method === '_handshake') {
          const context = params[0]
          const providers = await options.createProviders(context)

          // Build method dispatch registry from providers
          registry = new Map<string, MethodHandler>()
          for (const { providerKey, methods } of PROVIDER_METHODS) {
            const provider = providers[providerKey as keyof ProviderSet] as
              | Record<string, unknown>
              | undefined
            if (!provider) continue
            for (const m of methods) {
              const fn = provider[m]
              if (typeof fn === 'function') {
                registry.set(`${providerKey}.${m}`, (...args: unknown[]) =>
                  (fn as (...a: unknown[]) => Promise<unknown>).apply(
                    provider,
                    args,
                  ),
                )
              }
            }
          }

          const availableMethods = [...registry.keys()]
          return { methods: availableMethods }
        }

        if (!registry) {
          throw new Error('Handshake not completed')
        }
        const handler = registry.get(method)
        if (!handler) {
          throw new Error(`Unknown method: ${method}`)
        }
        return handler(...params)
      },
    })
    connections.add(transport)
    socket.on('close', () => connections.delete(transport))
  })

  return new Promise((resolve, reject) => {
    // On Unix, unlink stale socket before listening
    if (process.platform !== 'win32') {
      try {
        unlinkSync(pipePath)
      } catch {
        // ignore if file doesn't exist
      }
    }

    server.on('error', reject)
    server.listen(pipePath, () => {
      server.removeListener('error', reject)

      const pipeServer: PipeServer = {
        get pipePath() {
          return pipePath
        },
        get connectionCount() {
          return connections.size
        },
        async close() {
          for (const transport of connections) {
            transport.destroy()
          }
          connections.clear()
          await new Promise<void>((res, rej) => {
            server.close((err) => {
              if (err) rej(err)
              else res()
            })
          })
          if (process.platform !== 'win32') {
            try {
              unlinkSync(pipePath)
            } catch {
              // ignore
            }
          }
        },
        async [Symbol.asyncDispose]() {
          await this.close()
        },
      }

      resolve(pipeServer)
    })
  })
}
