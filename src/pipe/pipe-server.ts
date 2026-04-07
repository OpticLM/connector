import { once } from 'node:events'
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
  signal?: AbortSignal
  createProviders: (context: unknown) => ProviderSet | Promise<ProviderSet>
}

export interface PipeServer extends AsyncDisposable {
  readonly pipePath: string
  readonly connectionCount: number
}

type MethodHandler = (...args: unknown[]) => Promise<unknown>

export async function servePipe(
  options: ServePipeOptions,
): Promise<PipeServer> {
  const stack = new AsyncDisposableStack()

  const { pipeName, signal } = options
  const pipePath = toPipePath(pipeName)

  const connections = new Set<PipeTransport>()

  const server = createServer((socket) => {
    let registry: Map<string, MethodHandler> | null = null

    const transport = stack.use(
      new PipeTransport(socket, {
        onRequest: async (method, params) => {
          if (method === '_handshake') {
            const context = params[0]
            const providers = await options.createProviders(context)

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

            return { methods: [...registry.keys()] }
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
      }),
    )

    connections.add(transport)
    socket.on('close', () => connections.delete(transport))
  })

  if (process.platform !== 'win32') {
    try {
      unlinkSync(pipePath)
    } catch {}
  }

  server.listen(pipePath)

  const onAbort = () => server.close()
  if (signal) {
    signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    await once(server, 'listening', { signal })
  } catch (err) {
    server.close()
    throw err
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
  }

  const ps: PipeServer = {
    get pipePath() {
      return pipePath
    },
    get connectionCount() {
      return connections.size
    },
    async [Symbol.asyncDispose]() {
      await stack.disposeAsync()
      connections.clear()
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
      if (process.platform !== 'win32') {
        try {
          unlinkSync(pipePath)
        } catch {}
      }
    },
  }

  return ps
}
