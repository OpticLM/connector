import { unlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import type { IdeCapabilities } from './capabilities.js'
import { PipeTransport, PROVIDER_METHODS, toPipePath } from './pipe-protocol.js'

export interface ServeLspPipeOptions {
  capabilities: IdeCapabilities
  pipeName: string
}

export interface LspPipeServer {
  readonly pipePath: string
  readonly connectionCount: number
  close(): Promise<void>
}

type MethodHandler = (...args: unknown[]) => Promise<unknown>

export function serveLspPipe(
  options: ServeLspPipeOptions,
): Promise<LspPipeServer> {
  const { capabilities, pipeName } = options
  const pipePath = toPipePath(pipeName)

  // Build method dispatch registry from capabilities
  const registry = new Map<string, MethodHandler>()

  for (const { providerKey, methods } of PROVIDER_METHODS) {
    const provider = capabilities[providerKey]
    if (!provider) continue
    for (const method of methods) {
      const fn = (provider as Record<string, unknown>)[method]
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
  if (capabilities.onDiagnosticsChanged) {
    availableMethods.push('onDiagnosticsChanged')
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
  if (capabilities.onDiagnosticsChanged) {
    capabilities.onDiagnosticsChanged((uri) => {
      for (const transport of connections) {
        transport.sendNotification('onDiagnosticsChanged', [uri])
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
