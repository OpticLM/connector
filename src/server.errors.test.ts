import { describe, expect, it, vi } from 'vitest'
import type { DefinitionProvider, IdeCapabilities } from './capabilities.js'
import {
  createMockDefinitionProvider,
  createMockFileAccess,
  createMockServer,
} from './server.fixtures.js'
import { installMcpLspDriver } from './server.js'

describe('error handling', () => {
  it('should handle SymbolResolutionError gracefully', () => {
    const server = createMockServer()
    const definitionProvider = createMockDefinitionProvider()
    const files = { 'test.ts': 'const foo = 1;' }

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      definition: definitionProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })

  it('should handle file read errors', () => {
    const server = createMockServer()
    const definitionProvider = createMockDefinitionProvider()

    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess({}), // No files
      definition: definitionProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })

  it('should handle provider errors', () => {
    const server = createMockServer()
    const definitionProvider: DefinitionProvider = {
      provideDefinition: vi.fn(async () => {
        throw new Error('Provider error')
      }),
    }

    const files = { 'test.ts': 'const foo = 1;' }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      definition: definitionProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })
})
