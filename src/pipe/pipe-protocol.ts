import { createInterface } from 'node:readline'
import type { Duplex } from 'node:stream'

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

export interface PipeTransportOptions {
  onRequest?: (method: string, params: unknown[]) => Promise<unknown>
  onNotification?: (method: string, params: unknown[]) => void
}

export class PipeTransport implements Disposable {
  private readonly stream: Duplex
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
  private disposed = false

  constructor(stream: Duplex, options?: PipeTransportOptions) {
    this.stream = stream
    this.requestHandler = options?.onRequest
    this.notificationHandler = options?.onNotification

    stream.on('close', () => {
      this.rejectAll(new Error('Connection closed'))
      this[Symbol.dispose]()
    })

    stream.on('error', (err: Error) => {
      this.rejectAll(err)
      this[Symbol.dispose]()
    })

    this.listen().catch((err) => {
      this.rejectAll(err instanceof Error ? err : new Error(String(err)))
      this[Symbol.dispose]()
    })
  }

  private async listen(): Promise<void> {
    const rl = createInterface({ input: this.stream, terminal: false })
    for await (const line of rl) {
      if (this.disposed) break
      const trimmed = line.replace(/\r$/, '')
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed) as PipeMessage
        this.dispatch(msg)
      } catch {}
    }
  }

  sendRequest(method: string, params: unknown[]): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject(new Error('Transport disposed'))
    }
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      const msg: PipeRequest = { type: 'request', id, method, params }
      this.stream.write(`${JSON.stringify(msg)}\n`)
    })
  }

  sendNotification(method: string, params: unknown[]): void {
    if (this.disposed) return
    const msg: PipeNotification = { type: 'notification', method, params }
    this.stream.write(`${JSON.stringify(msg)}\n`)
  }

  [Symbol.dispose](): void {
    if (this.disposed) return
    this.disposed = true
    this.rejectAll(new Error('Transport disposed'))
    this.stream.destroy()
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
              if (this.disposed) return
              const resp: PipeResponse = {
                type: 'response',
                id: msg.id,
                result,
              }
              this.stream.write(`${JSON.stringify(resp)}\n`)
            })
            .catch((err: unknown) => {
              if (this.disposed) return
              const resp: PipeResponse = {
                type: 'response',
                id: msg.id,
                error: {
                  message: err instanceof Error ? err.message : String(err),
                },
              }
              this.stream.write(`${JSON.stringify(resp)}\n`)
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
    for (const entry of this.pending.values()) {
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
    methods: ['readFile', 'readDirectory', 'isFile', 'isDirectory'],
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
