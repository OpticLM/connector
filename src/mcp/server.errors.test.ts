import { describe, expect, it, vi } from 'vitest'
import type { DefinitionProvider } from '../capabilities.js'
import { install } from './index.js'
import {
  createMockDefinitionProvider,
  createMockFileAccess,
  createMockServer,
} from './server.fixtures.js'

describe('error handling', () => {
  it('should handle SymbolResolutionError gracefully', () => {
    const server = createMockServer()
    const definitionProvider = createMockDefinitionProvider()
    const files = { 'test.ts': 'const foo = 1;' }
    const fileAccess = createMockFileAccess(files)

    expect(() => {
      install(server, fileAccess)
      install(server, definitionProvider, { fileAccess })
    }).not.toThrow()
  })

  it('should handle file read errors', () => {
    const server = createMockServer()
    const definitionProvider = createMockDefinitionProvider()
    const fileAccess = createMockFileAccess({}) // No files

    expect(() => {
      install(server, fileAccess)
      install(server, definitionProvider, { fileAccess })
    }).not.toThrow()
  })

  it('should handle provider errors', () => {
    const server = createMockServer()
    const definitionProvider: DefinitionProvider = {
      provideDefinition: vi.fn(async () => {
        throw new Error('Provider error')
      }),
    }

    const files = { 'test.ts': 'const foo = 1;' }
    const fileAccess = createMockFileAccess(files)

    expect(() => {
      install(server, fileAccess)
      install(server, definitionProvider, { fileAccess })
    }).not.toThrow()
  })
})
