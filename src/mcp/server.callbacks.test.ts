import { describe, expect, it, vi } from 'vitest'
import type { FrontmatterMatch, Link } from '../types.js'
import { install } from '.'
import {
  createAndConnectMockClient,
  createMockDefinitionProvider,
  createMockEditProvider,
  createMockFileAccess,
  createMockFrontmatterProvider,
  createMockGlobalFindProvider,
  createMockGraphProvider,
  createMockHierarchyProvider,
  createMockReferencesProvider,
  createMockServer,
  mockCodeSnippet,
} from './server.fixtures.js'

const expectedSnippet = {
  uri: mockCodeSnippet.uri,
  startLine: mockCodeSnippet.range.start.line + 1,
  endLine: mockCodeSnippet.range.end.line + 1,
  content: mockCodeSnippet.content,
}

describe('tool callbacks', () => {
  describe('apply_edit', () => {
    const files = { 'test.ts': 'const foo = 1; const bar = 2;' }
    const validArgs = {
      uri: 'test.ts',
      start_hash: '1:4e',
      replace_text: 'new content',
      description: 'test edit',
    }

    it('calls onEditInput with raw params', async () => {
      const server = createMockServer()
      const onEditInput = vi.fn()

      install(server, createMockFileAccess(files))
      install(server, createMockEditProvider(true), {
        fileAccess: createMockFileAccess(files),
        onEditInput,
      })

      await (await createAndConnectMockClient(server)).callTool({
        name: 'apply_edit',
        arguments: validArgs,
      })

      expect(onEditInput).toHaveBeenCalledWith(validArgs)
    })

    it('calls onEditOutput with approved result', async () => {
      const server = createMockServer()
      const onEditOutput = vi.fn()

      install(server, createMockFileAccess(files))
      install(server, createMockEditProvider(true), {
        fileAccess: createMockFileAccess(files),
        onEditOutput,
      })

      await (await createAndConnectMockClient(server)).callTool({
        name: 'apply_edit',
        arguments: validArgs,
      })

      expect(onEditOutput).toHaveBeenCalledWith({
        success: true,
        message: 'Edit successfully applied and saved.',
      })
    })

    it('calls onEditOutput with rejection result', async () => {
      const server = createMockServer()
      const onEditOutput = vi.fn()

      install(server, createMockFileAccess(files))
      install(server, createMockEditProvider(false), {
        fileAccess: createMockFileAccess(files),
        onEditOutput,
      })

      await (await createAndConnectMockClient(server)).callTool({
        name: 'apply_edit',
        arguments: validArgs,
      })

      expect(onEditOutput).toHaveBeenCalledWith({
        success: false,
        message: 'Edit rejected by user.',
      })
    })

    it('does not call onEditOutput on error', async () => {
      const server = createMockServer()
      const onEditOutput = vi.fn()

      install(server, createMockFileAccess(files))
      install(server, createMockEditProvider(true), {
        fileAccess: createMockFileAccess(files),
        onEditOutput,
      })

      const r = await (await createAndConnectMockClient(server)).callTool({
        name: 'apply_edit',
        arguments: { ...validArgs, start_hash: '1:00' }, // wrong hash
      })

      expect(r.isError).toBe(true)
      expect(onEditOutput).not.toHaveBeenCalled()
    })
  })

  describe('goto_definition', () => {
    it('calls onDefinitionInput and onDefinitionOutput', async () => {
      const server = createMockServer()
      const onDefinitionInput = vi.fn()
      const onDefinitionOutput = vi.fn()
      const fileAccess = createMockFileAccess()

      install(server, fileAccess)
      install(server, createMockDefinitionProvider(), {
        fileAccess,
        onDefinitionInput,
        onDefinitionOutput,
      })

      const args = { uri: mockCodeSnippet.uri, symbol_name: '', line_hint: 1 }
      await (await createAndConnectMockClient(server)).callTool({
        name: 'goto_definition',
        arguments: args,
      })

      expect(onDefinitionInput).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: args.uri,
          symbol_name: args.symbol_name,
        }),
      )
      expect(onDefinitionOutput).toHaveBeenCalledWith({
        snippets: [expectedSnippet],
      })
    })

    it('does not call onDefinitionOutput on error', async () => {
      const server = createMockServer()
      const onDefinitionOutput = vi.fn()
      const fileAccess = createMockFileAccess({ 'test.ts': 'x' })

      install(server, fileAccess)
      install(
        server,
        {
          provideDefinition: async () => {
            throw new Error('fail')
          },
        },
        { fileAccess, onDefinitionOutput },
      )

      const r = await (await createAndConnectMockClient(server)).callTool({
        name: 'goto_definition',
        arguments: { uri: 'test.ts', symbol_name: 'x', line_hint: 1 },
      })

      expect(r.isError).toBe(true)
      expect(onDefinitionOutput).not.toHaveBeenCalled()
    })
  })

  describe('goto_type_definition', () => {
    it('calls onTypeDefinitionInput and onTypeDefinitionOutput', async () => {
      const server = createMockServer()
      const onTypeDefinitionInput = vi.fn()
      const onTypeDefinitionOutput = vi.fn()
      const fileAccess = createMockFileAccess()

      install(server, fileAccess)
      install(server, createMockDefinitionProvider(), {
        fileAccess,
        onTypeDefinitionInput,
        onTypeDefinitionOutput,
      })

      await (await createAndConnectMockClient(server)).callTool({
        name: 'goto_type_definition',
        arguments: { uri: mockCodeSnippet.uri, symbol_name: '', line_hint: 1 },
      })

      expect(onTypeDefinitionInput).toHaveBeenCalled()
      expect(onTypeDefinitionOutput).toHaveBeenCalledWith({
        snippets: [expectedSnippet],
      })
    })
  })

  describe('find_references', () => {
    it('calls onReferencesInput and onReferencesOutput', async () => {
      const server = createMockServer()
      const onReferencesInput = vi.fn()
      const onReferencesOutput = vi.fn()
      const files = {
        'path/to/file':
          'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nsomeVar\nline11',
      }
      const fileAccess = createMockFileAccess(files)

      install(server, fileAccess)
      install(server, createMockReferencesProvider([mockCodeSnippet]), {
        fileAccess,
        onReferencesInput,
        onReferencesOutput,
      })

      await (await createAndConnectMockClient(server)).callTool({
        name: 'find_references',
        arguments: {
          uri: 'path/to/file',
          symbol_name: 'someVar',
          line_hint: 10,
        },
      })

      expect(onReferencesInput).toHaveBeenCalledWith(
        expect.objectContaining({ symbol_name: 'someVar' }),
      )
      expect(onReferencesOutput).toHaveBeenCalledWith({
        snippets: [expectedSnippet],
      })
    })
  })

  describe('call_hierarchy', () => {
    it('calls onCallHierarchyInput and onCallHierarchyOutput', async () => {
      const server = createMockServer()
      const onCallHierarchyInput = vi.fn()
      const onCallHierarchyOutput = vi.fn()
      const files = {
        'path/to/file':
          'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nfoo\nline11',
      }
      const fileAccess = createMockFileAccess(files)

      install(server, fileAccess)
      install(server, createMockHierarchyProvider([mockCodeSnippet]), {
        fileAccess,
        onCallHierarchyInput,
        onCallHierarchyOutput,
      })

      await (await createAndConnectMockClient(server)).callTool({
        name: 'call_hierarchy',
        arguments: {
          uri: 'path/to/file',
          symbol_name: 'foo',
          line_hint: 10,
          direction: 'incoming',
        },
      })

      expect(onCallHierarchyInput).toHaveBeenCalledWith(
        expect.objectContaining({ direction: 'incoming' }),
      )
      expect(onCallHierarchyOutput).toHaveBeenCalledWith({
        snippets: [expectedSnippet],
      })
    })
  })

  describe('global_find', () => {
    it('calls onGlobalFindInput and onGlobalFindOutput', async () => {
      const server = createMockServer()
      const onGlobalFindInput = vi.fn()
      const onGlobalFindOutput = vi.fn()

      install(server, createMockFileAccess())
      install(server, createMockGlobalFindProvider([]), {
        onGlobalFindInput,
        onGlobalFindOutput,
      })

      await (await createAndConnectMockClient(server)).callTool({
        name: 'global_find',
        arguments: { query: 'foo' },
      })

      expect(onGlobalFindInput).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'foo' }),
      )
      expect(onGlobalFindOutput).toHaveBeenCalledWith({ matches: [], count: 0 })
    })
  })

  describe('get_link_structure', () => {
    it('calls onLinkStructureOutput', async () => {
      const server = createMockServer()
      const onLinkStructureOutput = vi.fn()
      const links: Link[] = [
        {
          sourceUri: 'a.md',
          targetUri: 'b.md',
          resolved: true,
          line: 1,
          column: 1,
        },
      ]

      install(server, createMockFileAccess())
      install(server, createMockGraphProvider(links), { onLinkStructureOutput })

      await (await createAndConnectMockClient(server)).callTool({
        name: 'get_link_structure',
        arguments: {},
      })

      expect(onLinkStructureOutput).toHaveBeenCalledWith({ links })
    })
  })

  describe('add_link', () => {
    it('calls onAddLinkInput and onAddLinkOutput', async () => {
      const server = createMockServer()
      const onAddLinkInput = vi.fn()
      const onAddLinkOutput = vi.fn()

      install(server, createMockFileAccess())
      install(server, createMockGraphProvider(), {
        onAddLinkInput,
        onAddLinkOutput,
      })

      await (await createAndConnectMockClient(server)).callTool({
        name: 'add_link',
        arguments: { path: 'a.md', pattern: 'foo', link_to: 'b.md' },
      })

      expect(onAddLinkInput).toHaveBeenCalledWith({
        path: 'a.md',
        pattern: 'foo',
        link_to: 'b.md',
      })
      expect(onAddLinkOutput).toHaveBeenCalledWith({
        success: true,
        message: 'Link added successfully.',
      })
    })
  })

  describe('get_frontmatter_structure', () => {
    it('calls onFrontmatterStructureInput and onFrontmatterStructureOutput', async () => {
      const server = createMockServer()
      const onFrontmatterStructureInput = vi.fn()
      const onFrontmatterStructureOutput = vi.fn()
      const matches: FrontmatterMatch[] = [{ path: 'a.md', value: 'tag1' }]

      install(server, createMockFileAccess())
      install(server, createMockFrontmatterProvider({}, matches), {
        onFrontmatterStructureInput,
        onFrontmatterStructureOutput,
      })

      await (await createAndConnectMockClient(server)).callTool({
        name: 'get_frontmatter_structure',
        arguments: { property: 'tags' },
      })

      expect(onFrontmatterStructureInput).toHaveBeenCalledWith(
        expect.objectContaining({ property: 'tags' }),
      )
      expect(onFrontmatterStructureOutput).toHaveBeenCalledWith({ matches })
    })
  })

  describe('set_frontmatter', () => {
    it('calls onSetFrontmatterInput and onSetFrontmatterOutput', async () => {
      const server = createMockServer()
      const onSetFrontmatterInput = vi.fn()
      const onSetFrontmatterOutput = vi.fn()

      install(server, createMockFileAccess())
      install(server, createMockFrontmatterProvider(), {
        onSetFrontmatterInput,
        onSetFrontmatterOutput,
      })

      await (await createAndConnectMockClient(server)).callTool({
        name: 'set_frontmatter',
        arguments: { path: 'a.md', property: 'title', value: 'Hello' },
      })

      expect(onSetFrontmatterInput).toHaveBeenCalledWith({
        path: 'a.md',
        property: 'title',
        value: 'Hello',
      })
      expect(onSetFrontmatterOutput).toHaveBeenCalledWith({
        success: true,
        message: 'Frontmatter updated successfully.',
      })
    })
  })
})
