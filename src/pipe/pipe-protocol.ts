import type { Socket } from 'node:net'

// ============================================================================
// Message Types
// ============================================================================

interface PipeRequest {
  type: 'request'
  id: number
  method: string
  params: unknown[]
}

interface PipeResponse {
  type: 'response'
  id: number
  result?: unknown
  error?: { message: string; code?: string }
}

interface PipeNotification {
  type: 'notification'
  method: string
  params: unknown[]
}

type PipeMessage = PipeRequest | PipeResponse | PipeNotification

interface PipeTransportOptions {
  onRequest?: (method: string, params: unknown[]) => Promise<unknown>
  onNotification?: (method: string, params: unknown[]) => void
}

export class PipeTransport {
  private readonly socket: Socket
  private readonly requestHandler?: (
    method: string,
    params: unknown[],
  ) => Promise<unknown>
  private readonly notificationHandler?: (
    method: string,
    params: unknown[],
  ) => void
  private nextId = 1
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private buffer = ''
  private destroyed = false

  constructor(socket: Socket, options?: PipeTransportOptions) {
    this.socket = socket
    this.requestHandler = options?.onRequest
    this.notificationHandler = options?.onNotification

    socket.on('data', (chunk: Buffer) => this.handleData(chunk))
    socket.on('close', () => this.rejectAll(new Error('Connection closed')))
    socket.on('error', (err: Error) => this.rejectAll(err))
  }

  sendRequest(method: string, params: unknown[]): Promise<unknown> {
    if (this.destroyed) {
      return Promise.reject(new Error('Transport destroyed'))
    }
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      const msg: PipeRequest = { type: 'request', id, method, params }
      this.socket.write(`${JSON.stringify(msg)}\n`)
    })
  }

  sendNotification(method: string, params: unknown[]): void {
    if (this.destroyed) return
    const msg: PipeNotification = { type: 'notification', method, params }
    this.socket.write(`${JSON.stringify(msg)}\n`)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.rejectAll(new Error('Transport destroyed'))
    this.socket.destroy()
  }

  private handleData(chunk: Buffer): void {
    this.buffer += chunk.toString()
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.replace(/\r$/, '')
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed) as PipeMessage
        this.dispatch(msg)
      } catch {
        // ignore malformed JSON lines
      }
    }
  }

  private dispatch(msg: PipeMessage): void {
    switch (msg.type) {
      case 'response': {
        const entry = this.pending.get(msg.id)
        if (entry) {
          this.pending.delete(msg.id)
          if (msg.error) {
            entry.reject(new Error(msg.error.message))
          } else {
            entry.resolve(msg.result)
          }
        }
        break
      }
      case 'request': {
        if (this.requestHandler) {
          this.requestHandler(msg.method, msg.params)
            .then((result) => {
              if (this.destroyed) return
              const resp: PipeResponse = {
                type: 'response',
                id: msg.id,
                result,
              }
              this.socket.write(`${JSON.stringify(resp)}\n`)
            })
            .catch((err: unknown) => {
              if (this.destroyed) return
              const resp: PipeResponse = {
                type: 'response',
                id: msg.id,
                error: {
                  message: err instanceof Error ? err.message : String(err),
                },
              }
              this.socket.write(`${JSON.stringify(resp)}\n`)
            })
        }
        break
      }
      case 'notification': {
        this.notificationHandler?.(msg.method, msg.params)
        break
      }
    }
  }

  private rejectAll(error: Error): void {
    for (const [, entry] of this.pending) {
      entry.reject(error)
    }
    this.pending.clear()
  }
}

export function toPipePath(pipeName: string): string {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\${pipeName}`
    : `/tmp/${pipeName}.sock`
}

export type PipeProviderKey =
  | 'fileAccess'
  | 'edit'
  | 'definition'
  | 'references'
  | 'hierarchy'
  | 'diagnostics'
  | 'outline'
  | 'globalFind'
  | 'graph'
  | 'frontmatter'

export type ProviderMethodEntry = {
  providerKey: PipeProviderKey
  methods: string[]
}

export const PROVIDER_METHODS: ProviderMethodEntry[] = [
  {
    providerKey: 'fileAccess',
    methods: ['readFile', 'readDirectory'],
  },
  {
    providerKey: 'edit',
    methods: ['applyEdits'],
  },
  { providerKey: 'definition', methods: ['provideDefinition'] },
  { providerKey: 'references', methods: ['provideReferences'] },
  { providerKey: 'hierarchy', methods: ['provideCallHierarchy'] },
  {
    providerKey: 'diagnostics',
    methods: ['provideDiagnostics', 'getWorkspaceDiagnostics'],
  },
  { providerKey: 'outline', methods: ['provideDocumentSymbols'] },
  { providerKey: 'globalFind', methods: ['globalFind'] },
  {
    providerKey: 'graph',
    methods: [
      'getLinkStructure',
      'resolveOutlinks',
      'resolveBacklinks',
      'addLink',
    ],
  },
  {
    providerKey: 'frontmatter',
    methods: ['getFrontmatterStructure', 'getFrontmatter', 'setFrontmatter'],
  },
]
