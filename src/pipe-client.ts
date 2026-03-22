import { connect } from 'node:net'
import type { PartialIdeCapabilities } from './capabilities.js'
import { PipeTransport, PROVIDER_METHODS, toPipePath } from './pipe-protocol.js'

export interface ConnectLspPipeOptions {
  pipeName: string
  connectTimeout?: number
}

export interface LspPipeConnection {
  readonly capabilities: PartialIdeCapabilities
  readonly availableMethods: string[]
  disconnect(): void
}

export function connectLspPipe(
  options: ConnectLspPipeOptions,
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

          // Build proxy capabilities
          const capabilities: PartialIdeCapabilities = {}

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

            ;(capabilities as unknown as Record<string, unknown>)[providerKey] =
              provider
          }

          settled = true
          resolve({
            capabilities,
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
