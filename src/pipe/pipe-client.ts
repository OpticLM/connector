import { once } from 'node:events'
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

export interface ConnectPipeOptions {
  pipeName: string
  connectTimeout?: number
  signal?: AbortSignal
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
}

export async function connectPipe(
  options: ConnectPipeOptions,
): Promise<PipeConnection> {
  const stack = new DisposableStack()

  const { pipeName, connectTimeout = 5000, signal, context } = options
  const pipePath = toPipePath(pipeName)

  const timeoutSignal = AbortSignal.timeout(connectTimeout)
  const abortSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal

  const socket = connect(pipePath)

  const onAbort = () => socket.destroy()
  abortSignal.addEventListener('abort', onAbort, { once: true })

  try {
    await once(socket, 'connect', { signal: abortSignal })
  } catch (err) {
    socket.destroy()
    throw err
  } finally {
    abortSignal.removeEventListener('abort', onAbort)
  }

  const transport = stack.use(new PipeTransport(socket))

  try {
    const handshakeResult = (await transport.sendRequest('_handshake', [
      context,
    ])) as { methods: string[] }
    const availableMethods = handshakeResult.methods

    const built: Record<
      string,
      Record<string, (...args: unknown[]) => Promise<unknown>>
    > = {}

    for (const { providerKey, methods } of PROVIDER_METHODS) {
      const present = methods.filter((m) =>
        availableMethods.includes(`${providerKey}.${m}`),
      )
      if (present.length === 0) continue

      const provider: Record<string, (...args: unknown[]) => Promise<unknown>> =
        {}
      for (const method of present) {
        provider[method] = (...args: unknown[]) =>
          transport.sendRequest(`${providerKey}.${method}`, args)
      }

      built[providerKey] = provider
    }

    return {
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
      [Symbol.dispose]() {
        stack.dispose()
      },
    }
  } catch (err) {
    stack.dispose()
    throw err
  }
}
