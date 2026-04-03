import { describe, expect, it, vi } from 'vitest'
import {
  createAndConnectMockClient,
  createMockFileAccess,
  createMockOutlineProvider,
  createMockServer,
} from './server.fixtures.js'
import { install } from './mcp/index.js'

describe('resource template file completion', () => {
  it('should complete file paths from root directory', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess()

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)

    const result = await client.complete({
      ref: { type: 'ref/resource', uri: 'files://{+path}' },
      argument: { name: 'path', value: '' },
    })

    expect(result.completion.values).toEqual(['file1.ts', 'file2.ts', 'subdir'])
  })

  it('should filter entries by prefix', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess()

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)

    const result = await client.complete({
      ref: { type: 'ref/resource', uri: 'files://{+path}' },
      argument: { name: 'path', value: 'file' },
    })

    expect(result.completion.values).toEqual(['file1.ts', 'file2.ts'])
  })

  it('should complete subdirectory paths', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess()
    vi.mocked(fileAccess.readDirectory).mockImplementation(
      async (path: string) => {
        if (path === 'src') return ['index.ts', 'server.ts', 'utils']
        return ['file1.ts', 'file2.ts', 'src']
      },
    )

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)

    const result = await client.complete({
      ref: { type: 'ref/resource', uri: 'files://{+path}' },
      argument: { name: 'path', value: 'src/se' },
    })

    expect(result.completion.values).toEqual(['src/server.ts'])
  })

  it('should be case-insensitive', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess()
    vi.mocked(fileAccess.readDirectory).mockResolvedValue([
      'README.md',
      'readme.txt',
      'src',
    ])

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)

    const result = await client.complete({
      ref: { type: 'ref/resource', uri: 'files://{+path}' },
      argument: { name: 'path', value: 'read' },
    })

    expect(result.completion.values).toEqual(['README.md', 'readme.txt'])
  })

  it('should return empty array when readDirectory fails', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess()
    vi.mocked(fileAccess.readDirectory).mockRejectedValue(
      new Error('Directory not found'),
    )

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)

    const result = await client.complete({
      ref: { type: 'ref/resource', uri: 'files://{+path}' },
      argument: { name: 'path', value: 'nonexistent/' },
    })

    expect(result.completion.values).toEqual([])
  })

  it('should support completion on diagnostics resource template', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess()

    install(server, fileAccess)
    install(
      server,
      { provideDiagnostics: vi.fn(async () => []) },
      { fileAccess },
    )

    const client = await createAndConnectMockClient(server)

    const result = await client.complete({
      ref: { type: 'ref/resource', uri: 'diagnostics://{+path}' },
      argument: { name: 'path', value: 'file1' },
    })

    expect(result.completion.values).toEqual(['file1.ts'])
  })

  it('should support completion on outline resource template', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess()

    install(server, fileAccess)
    install(server, createMockOutlineProvider(), { fileAccess })

    const client = await createAndConnectMockClient(server)

    const result = await client.complete({
      ref: { type: 'ref/resource', uri: 'outline://{+path}' },
      argument: { name: 'path', value: 'sub' },
    })

    expect(result.completion.values).toEqual(['subdir'])
  })
})
