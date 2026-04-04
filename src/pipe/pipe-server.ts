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

export interface servePipeOptions {
  pipeName: string
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

export interface PipeServer {
  readonly pipePath: string
  readonly connectionCount: number
  close(): Promise<void>
}

type MethodHandler = (...args: unknown[]) => Promise<unknown>

export function servePipe(options: servePipeOptions): Promise<PipeServer> {
  const { pipeName } = options
  const pipePath = toPipePath(pipeName)

  // Build method dispatch registry from providers
  const registry = new Map<string, MethodHandler>()

  for (const { providerKey, methods } of PROVIDER_METHODS) {
    const provider = options[providerKey as keyof servePipeOptions] as
      | Record<string, unknown>
      | undefined
    if (!provider) continue
    for (const method of methods) {
      const fn = provider[method]
      if (typeof fn === 'function') {
        const wireMethod = `${providerKey}.${method}`
        registry.set(wireMethod, (...args: unknown[]) =>
          (fn as (...a: unknown[]) => Promise<unknown>).apply(provider, args),
        )
      }
    }
  }

  // Pre-compute handshake response
  const availableMethods = [...registry.keys()]
  if (options.diagnostics?.onDiagnosticsChanged) {
    availableMethods.push('onDiagnosticsChanged')
  }
  if (options.fileAccess.onFileChanged) {
    availableMethods.push('onFileChanged')
  }

  const connections = new Set<PipeTransport>()

  const server = createServer((socket) => {
    const transport = new PipeTransport(socket, {
      onRequest: async (method, params) => {
        if (method === '_handshake') {
          return { methods: availableMethods }
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

  // Register diagnostics push notifications
  if (options.diagnostics?.onDiagnosticsChanged) {
    options.diagnostics.onDiagnosticsChanged((uri) => {
      for (const transport of connections) {
        transport.sendNotification('onDiagnosticsChanged', [uri])
      }
    })
  }

  // Register file change push notifications
  if (options.fileAccess.onFileChanged) {
    options.fileAccess.onFileChanged((uri) => {
      for (const transport of connections) {
        transport.sendNotification('onFileChanged', [uri])
      }
    })
  }

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

      resolve({
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
      })
    })
  })
}
