import { describe, expect, it, vi } from 'vitest'
import type { GraphProvider } from './capabilities.js'
import { install } from './mcp/index.js'
import {
  createAndConnectMockClient,
  createMockFileAccess,
  createMockGraphProvider,
  createMockServer,
} from './server.fixtures.js'
import type { Link } from './types.js'

describe('graph capability', () => {
  const mockLinks: Link[] = [
    {
      sourceUri: 'notes/index.md',
      targetUri: 'notes/topic-a.md',
      subpath: undefined,
      displayText: 'Topic A',
      resolved: true,
      line: 5,
      column: 10,
    },
    {
      sourceUri: 'notes/index.md',
      targetUri: 'notes/topic-b.md',
      subpath: '#section-1',
      displayText: 'Topic B Section 1',
      resolved: true,
      line: 8,
      column: 3,
    },
    {
      sourceUri: 'notes/topic-a.md',
      targetUri: 'notes/index.md',
      subpath: undefined,
      displayText: undefined,
      resolved: true,
      line: 12,
      column: 1,
    },
    {
      sourceUri: 'notes/draft.md',
      targetUri: 'notes/nonexistent.md',
      subpath: undefined,
      displayText: 'Missing Note',
      resolved: false,
      line: 2,
      column: 5,
    },
  ]

  it('should register graph tools when graph provider is available', () => {
    const server = createMockServer()
    const graphProvider = createMockGraphProvider()

    expect(() => {
      install(server, createMockFileAccess())
      install(server, graphProvider)
    }).not.toThrow()
  })

  it('should register get_link_structure tool and return all links', async () => {
    const server = createMockServer()
    const graphProvider = createMockGraphProvider(mockLinks)

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'get_link_structure',
      arguments: {},
    })

    expect(r.structuredContent).toStrictEqual({
      links: mockLinks,
    })
    expect(graphProvider.getLinkStructure).toHaveBeenCalled()
  })

  it('should handle get_link_structure with empty links', async () => {
    const server = createMockServer()
    const graphProvider = createMockGraphProvider([])

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'get_link_structure',
      arguments: {},
    })

    expect(r.structuredContent).toStrictEqual({
      links: [],
    })
  })

  it('should register add_link tool and return success when link is added', async () => {
    const server = createMockServer()
    const graphProvider = createMockGraphProvider([])

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'add_link',
      arguments: {
        path: 'notes/draft.md',
        pattern: 'topic A',
        link_to: 'notes/topic-a.md',
      },
    })

    expect(r.structuredContent).toStrictEqual({
      success: true,
      message: 'Link added successfully.',
    })
    expect(graphProvider.addLink).toHaveBeenCalledWith(
      'notes/draft.md',
      'topic A',
      'notes/topic-a.md',
    )
  })

  it('should return error when add_link cannot find pattern', async () => {
    const server = createMockServer()
    const graphProvider = createMockGraphProvider(
      [],
      new Error('Pattern not found in document'),
    )

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'add_link',
      arguments: {
        path: 'notes/draft.md',
        pattern: 'nonexistent pattern',
        link_to: 'notes/topic-a.md',
      },
    })

    expect(r.isError).toBe(true)
    expect(r.structuredContent).toStrictEqual({
      success: false,
      message: 'Error: Pattern not found in document',
    })
  })

  it('should register and access outlinks resource', async () => {
    const server = createMockServer()
    const outlinks: Link[] = [
      {
        sourceUri: 'notes/index.md',
        targetUri: 'notes/topic-a.md',
        subpath: undefined,
        displayText: 'Topic A',
        resolved: true,
        line: 5,
        column: 10,
      },
      {
        sourceUri: 'notes/index.md',
        targetUri: 'notes/topic-b.md',
        subpath: '#section-1',
        displayText: 'Topic B Section 1',
        resolved: true,
        line: 8,
        column: 3,
      },
    ]
    const graphProvider = createMockGraphProvider(outlinks)

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'outlinks://notes/index.md',
    })

    expect(r.contents).toHaveLength(1)
    const content = r.contents[0]
    expect(content.mimeType).toBe('application/json')
    expect(content).toHaveProperty('text')
    if (!('text' in content)) {
      throw new Error('Unexpected')
    }

    const links = JSON.parse(content.text ?? '[]')
    expect(links).toHaveLength(2)
    expect(links[0].targetUri).toBe('notes/topic-a.md')
    expect(links[1].targetUri).toBe('notes/topic-b.md')
    expect(graphProvider.resolveOutlinks).toHaveBeenCalled()
  })

  it('should register and access backlinks resource', async () => {
    const server = createMockServer()
    const backlinks: Link[] = [
      {
        sourceUri: 'notes/topic-a.md',
        targetUri: 'notes/index.md',
        subpath: undefined,
        displayText: undefined,
        resolved: true,
        line: 12,
        column: 1,
      },
    ]
    const graphProvider = createMockGraphProvider(backlinks)

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'backlinks://notes/index.md',
    })

    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]?.mimeType).toBe('application/json')
    if (!('text' in r.contents[0])) {
      throw new Error('Unexpected')
    }

    const links = JSON.parse(r.contents[0]?.text ?? '[]')
    expect(links).toHaveLength(1)
    expect(links[0].sourceUri).toBe('notes/topic-a.md')
    expect(graphProvider.resolveBacklinks).toHaveBeenCalled()
  })

  it('should handle outlinks resource with no outgoing links', async () => {
    const server = createMockServer()
    const graphProvider = createMockGraphProvider([])

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'outlinks://notes/nonexistent.md',
    })

    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toHaveProperty('text')
    if (!('text' in r.contents[0])) {
      throw new Error('Unexpected')
    }
    const links = JSON.parse(r.contents[0]?.text ?? '[]')
    expect(links).toHaveLength(0)
  })

  it('should handle backlinks resource with no incoming links', async () => {
    const server = createMockServer()
    const graphProvider = createMockGraphProvider([])

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'backlinks://notes/draft.md',
    })

    expect(r.contents).toHaveLength(1)
    if (!('text' in r.contents[0])) {
      throw new Error('Unexpected')
    }
    const links = JSON.parse(r.contents[0]?.text ?? '[]')
    expect(links).toHaveLength(0)
  })

  it('should handle get_link_structure provider error gracefully', async () => {
    const server = createMockServer()
    const graphProvider: GraphProvider = {
      getLinkStructure: vi.fn(async () => {
        throw new Error('Provider error')
      }),
      resolveOutlinks: vi.fn(async () => []),
      resolveBacklinks: vi.fn(async () => []),
      addLink: vi.fn(async () => {}),
    }

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'get_link_structure',
      arguments: {},
    })

    expect(r.isError).toBe(true)
    expect(r.structuredContent).toStrictEqual({
      error: 'Error: Provider error',
    })
  })

  it('should handle add_link provider error gracefully', async () => {
    const server = createMockServer()
    const graphProvider: GraphProvider = {
      getLinkStructure: vi.fn(async () => []),
      resolveOutlinks: vi.fn(async () => []),
      resolveBacklinks: vi.fn(async () => []),
      addLink: vi.fn(async () => {
        throw new Error('Failed to write file')
      }),
    }

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'add_link',
      arguments: {
        path: 'notes/draft.md',
        pattern: 'test',
        link_to: 'notes/target.md',
      },
    })

    expect(r.isError).toBe(true)
    expect(r.structuredContent).toStrictEqual({
      success: false,
      message: 'Error: Failed to write file',
    })
  })

  it('should handle outlinks resource provider error gracefully', async () => {
    const server = createMockServer()
    const graphProvider: GraphProvider = {
      getLinkStructure: vi.fn(async () => []),
      resolveOutlinks: vi.fn(async () => {
        throw new Error('Failed to resolve outlinks')
      }),
      resolveBacklinks: vi.fn(async () => []),
      addLink: vi.fn(async () => {}),
    }

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'outlinks://notes/index.md',
    })

    expect(r.contents).toHaveLength(1)
    if (!('text' in r.contents[0])) {
      throw new Error('Unexpected')
    }
    const content = JSON.parse(r.contents[0]?.text ?? '{}')
    expect(content.error).toBe('Error: Failed to resolve outlinks')
  })

  it('should handle backlinks resource provider error gracefully', async () => {
    const server = createMockServer()
    const graphProvider: GraphProvider = {
      getLinkStructure: vi.fn(async () => []),
      resolveOutlinks: vi.fn(async () => []),
      resolveBacklinks: vi.fn(async () => {
        throw new Error('Failed to resolve backlinks')
      }),
      addLink: vi.fn(async () => {}),
    }

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'backlinks://notes/index.md',
    })

    expect(r.contents).toHaveLength(1)
    if (!('text' in r.contents[0])) {
      throw new Error('Unexpected')
    }
    const content = JSON.parse(r.contents[0]?.text ?? '{}')
    expect(content.error).toBe('Error: Failed to resolve backlinks')
  })

  it('should include graph provider in instance with all capabilities', () => {
    const server = createMockServer()

    expect(() => {
      install(server, createMockFileAccess())
      install(server, createMockGlobalFindProvider())
      install(server, createMockGraphProvider())
    }).not.toThrow()
  })

  it('should preserve link properties including subpath and resolved status', async () => {
    const server = createMockServer()
    const linksWithSubpath: Link[] = [
      {
        sourceUri: 'notes/index.md',
        targetUri: 'notes/topic.md',
        subpath: '#heading-1',
        displayText: 'Topic Heading',
        resolved: true,
        line: 10,
        column: 5,
      },
      {
        sourceUri: 'notes/index.md',
        targetUri: 'notes/missing.md',
        subpath: undefined,
        displayText: 'Missing',
        resolved: false,
        line: 15,
        column: 3,
      },
    ]
    const graphProvider = createMockGraphProvider(linksWithSubpath)

    install(server, createMockFileAccess())
    install(server, graphProvider)

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'get_link_structure',
      arguments: {},
    })

    const content = r.structuredContent as { links: Link[] }
    expect(content.links).toHaveLength(2)
    expect(content.links[0]?.subpath).toBe('#heading-1')
    expect(content.links[0]?.resolved).toBe(true)
    expect(content.links[1]?.subpath).toBeUndefined()
    expect(content.links[1]?.resolved).toBe(false)
  })
})

// Helper function for graph provider tests
function createMockGlobalFindProvider() {
  return {
    globalFind: vi.fn(async () => []),
  }
}
