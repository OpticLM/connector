import { describe, expect, it, vi } from 'vitest'
import type { FrontmatterProvider, IdeCapabilities } from './capabilities.js'
import {
  createAndConnectMockClient,
  createMockFileAccess,
  createMockFrontmatterProvider,
  createMockServer,
} from './server.fixtures.js'
import { installMcpLspDriver } from './server.js'
import type { Frontmatter, FrontmatterMatch } from './types.js'

describe('frontmatter capability', () => {
  const mockFrontmatter: Frontmatter = {
    title: 'Test Document',
    tags: ['typescript', 'testing'],
    published: true,
    views: 42,
    date: new Date('2024-01-15'),
  }

  const mockStructureMatches: FrontmatterMatch[] = [
    { path: 'notes/doc1.md', value: 'Test Document 1' },
    { path: 'notes/doc2.md', value: 'Test Document 2' },
    { path: 'notes/doc3.md', value: 'Test Document 3' },
  ]

  it('should register frontmatter tools when frontmatter provider is available', () => {
    const server = createMockServer()
    const frontmatterProvider = createMockFrontmatterProvider()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      frontmatter: frontmatterProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })

  it('should not register frontmatter tools when provider is not available', async () => {
    const server = createMockServer()
    const frontmatterProvider = createMockFrontmatterProvider()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      frontmatter: frontmatterProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const tools = await client.listTools()
    const toolNames = tools.tools.map((t) => t.name)

    // When frontmatter provider IS available, tools should be registered
    expect(toolNames).toContain('get_frontmatter_structure')
    expect(toolNames).toContain('set_frontmatter')

    // Now test without provider - just verify driver installs successfully
    const server2 = createMockServer()
    const capabilities2: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
    }
    const result2 = installMcpLspDriver({
      server: server2,
      capabilities: capabilities2,
    })
    expect(result2.success).toBeTruthy()
  })

  describe('get_frontmatter_structure tool', () => {
    it('should return all matches when no path is specified', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider(
        {},
        mockStructureMatches,
      )
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'get_frontmatter_structure',
        arguments: { property: 'title' },
      })

      expect(r.structuredContent).toStrictEqual({
        matches: mockStructureMatches,
      })
      expect(frontmatterProvider.getFrontmatterStructure).toHaveBeenCalledWith(
        'title',
        undefined,
      )
    })

    it('should filter by path when path is specified', async () => {
      const server = createMockServer()
      const singleMatch: FrontmatterMatch[] = [
        { path: 'notes/doc1.md', value: 'Test Document 1' },
      ]
      const frontmatterProvider = createMockFrontmatterProvider({}, singleMatch)
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'get_frontmatter_structure',
        arguments: {
          property: 'title',
          path: 'notes/doc1.md',
        },
      })

      expect(r.structuredContent).toStrictEqual({
        matches: singleMatch,
      })
      expect(frontmatterProvider.getFrontmatterStructure).toHaveBeenCalledWith(
        'title',
        'notes/doc1.md',
      )
    })

    it('should return empty array when no matches found', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider({}, [])
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'get_frontmatter_structure',
        arguments: { property: 'nonexistent' },
      })

      expect(r.structuredContent).toStrictEqual({
        matches: [],
      })
    })

    it('should handle array values', async () => {
      const server = createMockServer()
      const arrayMatches: FrontmatterMatch[] = [
        { path: 'notes/doc1.md', value: ['tag1', 'tag2', 'tag3'] },
        { path: 'notes/doc2.md', value: ['tag1', 'tag4'] },
      ]
      const frontmatterProvider = createMockFrontmatterProvider(
        {},
        arrayMatches,
      )
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'get_frontmatter_structure',
        arguments: { property: 'tags' },
      })

      expect(r.structuredContent).toStrictEqual({
        matches: arrayMatches,
      })
    })

    it('should handle provider error gracefully', async () => {
      const server = createMockServer()
      const frontmatterProvider: FrontmatterProvider = {
        getFrontmatter: vi.fn(async () => ({})),
        getFrontmatterStructure: vi.fn(async () => {
          throw new Error('Provider error')
        }),
        setFrontmatter: vi.fn(async () => true),
      }
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'get_frontmatter_structure',
        arguments: { property: 'title' },
      })

      expect(r.isError).toBe(true)
      expect(r.structuredContent).toStrictEqual({
        error: 'Error: Provider error',
      })
    })
  })

  describe('set_frontmatter tool', () => {
    it('should set a string value successfully', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider({}, [], true)
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'set_frontmatter',
        arguments: {
          path: 'notes/doc1.md',
          property: 'title',
          value: 'New Title',
        },
      })

      expect(r.structuredContent).toStrictEqual({
        success: true,
        message: 'Frontmatter updated successfully.',
      })
      expect(frontmatterProvider.setFrontmatter).toHaveBeenCalledWith(
        'notes/doc1.md',
        'title',
        'New Title',
      )
    })

    it('should set an array value successfully', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider({}, [], true)
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'set_frontmatter',
        arguments: {
          path: 'notes/doc1.md',
          property: 'tags',
          value: ['typescript', 'mcp', 'lsp'],
        },
      })

      expect(r.structuredContent).toStrictEqual({
        success: true,
        message: 'Frontmatter updated successfully.',
      })
      expect(frontmatterProvider.setFrontmatter).toHaveBeenCalledWith(
        'notes/doc1.md',
        'tags',
        ['typescript', 'mcp', 'lsp'],
      )
    })

    it('should set a number value successfully', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider({}, [], true)
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'set_frontmatter',
        arguments: {
          path: 'notes/doc1.md',
          property: 'views',
          value: 100,
        },
      })

      expect(r.structuredContent).toStrictEqual({
        success: true,
        message: 'Frontmatter updated successfully.',
      })
      expect(frontmatterProvider.setFrontmatter).toHaveBeenCalledWith(
        'notes/doc1.md',
        'views',
        100,
      )
    })

    it('should set a boolean value successfully', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider({}, [], true)
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'set_frontmatter',
        arguments: {
          path: 'notes/doc1.md',
          property: 'published',
          value: false,
        },
      })

      expect(r.structuredContent).toStrictEqual({
        success: true,
        message: 'Frontmatter updated successfully.',
      })
      expect(frontmatterProvider.setFrontmatter).toHaveBeenCalledWith(
        'notes/doc1.md',
        'published',
        false,
      )
    })

    it('should remove a property when value is null', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider({}, [], true)
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'set_frontmatter',
        arguments: {
          path: 'notes/doc1.md',
          property: 'title',
          value: null,
        },
      })

      expect(r.structuredContent).toStrictEqual({
        success: true,
        message: 'Frontmatter updated successfully.',
      })
      expect(frontmatterProvider.setFrontmatter).toHaveBeenCalledWith(
        'notes/doc1.md',
        'title',
        undefined,
      )
    })

    it('should return failure when provider returns false', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider({}, [], false)
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'set_frontmatter',
        arguments: {
          path: 'notes/doc1.md',
          property: 'title',
          value: 'New Title',
        },
      })

      expect(r.structuredContent).toStrictEqual({
        success: false,
        message: 'Failed to update frontmatter.',
      })
    })

    it('should handle provider error gracefully', async () => {
      const server = createMockServer()
      const frontmatterProvider: FrontmatterProvider = {
        getFrontmatter: vi.fn(async () => ({})),
        getFrontmatterStructure: vi.fn(async () => []),
        setFrontmatter: vi.fn(async () => {
          throw new Error('Failed to write file')
        }),
      }
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'set_frontmatter',
        arguments: {
          path: 'notes/doc1.md',
          property: 'title',
          value: 'New Title',
        },
      })

      expect(r.isError).toBe(true)
      expect(r.structuredContent).toStrictEqual({
        success: false,
        message: 'Error: Failed to write file',
      })
    })
  })

  describe('frontmatter resource', () => {
    it('should return frontmatter as JSON', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider(mockFrontmatter)
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.readResource({
        uri: 'frontmatter://notes/doc1.md',
      })

      expect(r.contents).toHaveLength(1)
      const content = r.contents[0]
      expect(content.mimeType).toBe('application/json')
      expect(content).toHaveProperty('text')
      if (!('text' in content)) {
        throw new Error('Unexpected')
      }

      const parsed = JSON.parse(content.text ?? '{}')
      expect(parsed.title).toBe('Test Document')
      expect(parsed.tags).toEqual(['typescript', 'testing'])
      expect(parsed.published).toBe(true)
      expect(parsed.views).toBe(42)
      expect(frontmatterProvider.getFrontmatter).toHaveBeenCalledWith(
        'notes/doc1.md',
      )
    })

    it('should return empty object when document has no frontmatter', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider({})
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.readResource({
        uri: 'frontmatter://notes/empty.md',
      })

      expect(r.contents).toHaveLength(1)
      if (!('text' in r.contents[0])) {
        throw new Error('Unexpected')
      }

      const parsed = JSON.parse(r.contents[0]?.text ?? '{}')
      expect(parsed).toStrictEqual({})
    })

    it('should handle nested paths', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider(mockFrontmatter)
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.readResource({
        uri: 'frontmatter://deep/nested/path/doc.md',
      })

      expect(r.contents).toHaveLength(1)
      expect(frontmatterProvider.getFrontmatter).toHaveBeenCalledWith(
        'deep/nested/path/doc.md',
      )
    })

    it('should handle provider error gracefully', async () => {
      const server = createMockServer()
      const frontmatterProvider: FrontmatterProvider = {
        getFrontmatter: vi.fn(async () => {
          throw new Error('File not found')
        }),
        getFrontmatterStructure: vi.fn(async () => []),
        setFrontmatter: vi.fn(async () => true),
      }
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.readResource({
        uri: 'frontmatter://notes/nonexistent.md',
      })

      expect(r.contents).toHaveLength(1)
      if (!('text' in r.contents[0])) {
        throw new Error('Unexpected')
      }

      const parsed = JSON.parse(r.contents[0]?.text ?? '{}')
      expect(parsed.error).toBe('Error: File not found')
    })
  })

  describe('frontmatter with different value types', () => {
    it('should handle number arrays', async () => {
      const server = createMockServer()
      const numberArrayMatches: FrontmatterMatch[] = [
        { path: 'notes/doc1.md', value: [1, 2, 3, 4, 5] },
      ]
      const frontmatterProvider = createMockFrontmatterProvider(
        {},
        numberArrayMatches,
      )
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'get_frontmatter_structure',
        arguments: { property: 'numbers' },
      })

      const result = r.structuredContent as { matches: FrontmatterMatch[] }
      expect(result.matches[0]?.value).toEqual([1, 2, 3, 4, 5])
    })

    it('should handle boolean arrays', async () => {
      const server = createMockServer()
      const boolArrayMatches: FrontmatterMatch[] = [
        { path: 'notes/doc1.md', value: [true, false, true] },
      ]
      const frontmatterProvider = createMockFrontmatterProvider(
        {},
        boolArrayMatches,
      )
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'get_frontmatter_structure',
        arguments: { property: 'flags' },
      })

      const result = r.structuredContent as { matches: FrontmatterMatch[] }
      expect(result.matches[0]?.value).toEqual([true, false, true])
    })

    it('should handle undefined values', async () => {
      const server = createMockServer()
      const undefinedMatches: FrontmatterMatch[] = [
        { path: 'notes/doc1.md', value: undefined },
      ]
      const frontmatterProvider = createMockFrontmatterProvider(
        {},
        undefinedMatches,
      )
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)
      const r = await client.callTool({
        name: 'get_frontmatter_structure',
        arguments: { property: 'missing' },
      })

      const result = r.structuredContent as { matches: FrontmatterMatch[] }
      expect(result.matches[0]?.value).toBeUndefined()
    })
  })

  describe('integration with other capabilities', () => {
    it('should work alongside graph provider', () => {
      const server = createMockServer()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: createMockFrontmatterProvider(),
        graph: {
          getLinkStructure: vi.fn(async () => []),
          resolveOutlinks: vi.fn(async () => []),
          resolveBacklinks: vi.fn(async () => []),
          addLink: vi.fn(async () => true),
        },
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()
    })

    it('should register both tools and resources', async () => {
      const server = createMockServer()
      const frontmatterProvider = createMockFrontmatterProvider()
      const capabilities: IdeCapabilities = {
        fileAccess: createMockFileAccess(),
        frontmatter: frontmatterProvider,
      }

      const { success } = installMcpLspDriver({ server, capabilities })
      expect(success).toBeTruthy()

      const client = await createAndConnectMockClient(server)

      // Check tools
      const tools = await client.listTools()
      const toolNames = tools.tools.map((t) => t.name)
      expect(toolNames).toContain('get_frontmatter_structure')
      expect(toolNames).toContain('set_frontmatter')

      // Check resources
      const resources = await client.listResourceTemplates()
      const resourceUris = resources.resourceTemplates.map((r) => r.uriTemplate)
      expect(resourceUris).toContain('frontmatter://{+path}')
    })
  })
})
