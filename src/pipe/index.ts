/**
 * Pipe entry point for passing providers between processes.
 *
 * @packageDocumentation
 */

export type {
  ConnectPipeOptions,
  PipeConnection,
} from './pipe-client.js'
export { connectPipe } from './pipe-client.js'
export type {
  PipeServer,
  ProviderSet,
  ServePipeOptions as servePipeOptions,
} from './pipe-server.js'
export { servePipe } from './pipe-server.js'
