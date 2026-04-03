import { describe, expect, it } from 'vitest'
import type { GlobalFindMatch } from './capabilities.js'
import { install } from './mcp/index.js'
import {
  createAndConnectMockClient,
  createMockFileAccess,
  createMockGlobalFindProvider,
  createMockServer,
} from './server.fixtures.js'

describe('global find and replace tools', () => {
  it('should register global_find tool when globalFind provider is available', () => {
    const server = createMockServer()
    const globalFindProvider = createMockGlobalFindProvider()
    const fileAccess = createMockFileAccess()

    expect(() => {
      install(server, fileAccess)
      install(server, globalFindProvider)
    }).not.toThrow()
  })

  it('should register global_find tool and return formatted results', async () => {
    const server = createMockServer()
    const matches: GlobalFindMatch[] = [
      {
        uri: 'src/index.ts',
        line: 10,
        column: 5,
        matchText: 'searchTerm',
        context: 'const searchTerm = "value"',
      },
      {
        uri: 'src/utils.ts',
        line: 25,
        column: 12,
        matchText: 'searchTerm',
        context: 'function searchTerm() {}',
      },
    ]
    const globalFindProvider = createMockGlobalFindProvider(matches)

    install(server, createMockFileAccess())
    install(server, globalFindProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'global_find',
      arguments: {
        query: 'searchTerm',
        case_sensitive: true,
        exact_match: false,
        regex_mode: false,
      },
    })
    expect(r.structuredContent).toStrictEqual({
      matches: [
        {
          uri: 'src/index.ts',
          line: 10,
          column: 5,
          matchText: 'searchTerm',
          context: 'const searchTerm = "value"',
        },
        {
          uri: 'src/utils.ts',
          line: 25,
          column: 12,
          matchText: 'searchTerm',
          context: 'function searchTerm() {}',
        },
      ],
      count: 2,
    })
  })

  it('should handle global_find with no matches', async () => {
    const server = createMockServer()
    const globalFindProvider = createMockGlobalFindProvider([])

    install(server, createMockFileAccess())
    install(server, globalFindProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'global_find',
      arguments: {
        query: 'nonexistent',
      },
    })
    expect(r.structuredContent).toStrictEqual({
      matches: [],
      count: 0,
    })
  })

  it('should use default values for optional global_find parameters', async () => {
    const server = createMockServer()
    const globalFindProvider = createMockGlobalFindProvider([])

    install(server, createMockFileAccess())
    install(server, globalFindProvider)

    const client = await createAndConnectMockClient(server)
    await client.callTool({
      name: 'global_find',
      arguments: {
        query: 'test',
        // Omit optional parameters to test defaults
      },
    })

    // Verify the provider was called with default options
    expect(globalFindProvider.globalFind).toHaveBeenCalledWith('test', {
      caseSensitive: false,
      exactMatch: false,
      regexMode: false,
    })
  })
})
