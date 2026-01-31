import { describe, expect, it } from 'vitest'
import type { IdeCapabilities } from './capabilities.js'
import { installMcpLspDriver } from './server.js'
import {
  createMockFileAccess,
  createMockServer,
  createMockDefinitionProvider,
  createMockReferencesProvider,
  createMockHierarchyProvider,
  createMockUserInteraction,
  mockCodeSnippet,
  createAndConnectMockClient,
} from './server.fixtures.js'
import type { CodeSnippet } from './types.js'

describe('tool registration', () => {
  it('should register goto_definition when definition provider is available', async () => {
    const server = createMockServer()
    const definitionProvider = createMockDefinitionProvider()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      definition: definitionProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'goto_definition',
      arguments: { uri: mockCodeSnippet.uri, symbol_name: '', line_hint: 1 },
    })
    expect(r.structuredContent).toStrictEqual({
      snippets: [
        {
          content: mockCodeSnippet.content,
          endLine: mockCodeSnippet.range.end.line + 1,
          startLine: mockCodeSnippet.range.start.line + 1,
          uri: mockCodeSnippet.uri,
        },
      ],
    })
  })

  it('should register find_references when references provider is available', () => {
    const server = createMockServer()
    const referencesProvider = createMockReferencesProvider()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      references: referencesProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })

  it('should register find_references and return formatted results when called', async () => {
    const server = createMockServer()
    const referenceSnippets: CodeSnippet[] = [
      {
        uri: 'file:///path/to/file1',
        range: {
          start: { line: 10, character: 5 },
          end: { line: 10, character: 10 },
        },
        content: 'someVariable',
      },
      {
        uri: 'file:///path/to/file2',
        range: {
          start: { line: 20, character: 0 },
          end: { line: 20, character: 12 },
        },
        content: 'someVariable = 42',
      },
    ]
    const referencesProvider = createMockReferencesProvider(referenceSnippets)
    // File content with someVariable at line 10
    const files = {
      'file:///path/to/file':
        'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nsomeVariable\nline11',
    }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      references: referencesProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'find_references',
      arguments: {
        uri: 'file:///path/to/file',
        symbol_name: 'someVariable',
        line_hint: 10,
      },
    })
    expect(r.structuredContent).toStrictEqual({
      snippets: [
        {
          content: 'someVariable',
          endLine: 11,
          startLine: 11,
          uri: 'file:///path/to/file1',
        },
        {
          content: 'someVariable = 42',
          endLine: 21,
          startLine: 21,
          uri: 'file:///path/to/file2',
        },
      ],
    })
  })

  it('should register call_hierarchy when hierarchy provider is available', () => {
    const server = createMockServer()
    const hierarchyProvider = createMockHierarchyProvider()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      hierarchy: hierarchyProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })

  it('should register call_hierarchy and return formatted results when called', async () => {
    const server = createMockServer()
    const callHierarchySnippets: CodeSnippet[] = [
      {
        uri: 'file:///path/to/caller1',
        range: {
          start: { line: 5, character: 0 },
          end: { line: 7, character: 1 },
        },
        content: 'function caller1() {\n  targetFunction()\n}',
      },
      {
        uri: 'file:///path/to/caller2',
        range: {
          start: { line: 15, character: 0 },
          end: { line: 18, character: 1 },
        },
        content: 'function caller2() {\n  x = targetFunction()\n}',
      },
    ]
    const hierarchyProvider = createMockHierarchyProvider(callHierarchySnippets)
    // File content with targetFunction at line 10
    const files = {
      'file:///path/to/file':
        'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\ntargetFunction\nline11',
    }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      hierarchy: hierarchyProvider,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'call_hierarchy',
      arguments: {
        uri: 'file:///path/to/file',
        symbol_name: 'targetFunction',
        line_hint: 10,
        direction: 'incoming',
      },
    })
    expect(r.structuredContent).toStrictEqual({
      snippets: [
        {
          content: 'function caller1() {\n  targetFunction()\n}',
          endLine: 8,
          startLine: 6,
          uri: 'file:///path/to/caller1',
        },
        {
          content: 'function caller2() {\n  x = targetFunction()\n}',
          endLine: 19,
          startLine: 16,
          uri: 'file:///path/to/caller2',
        },
      ],
    })
  })

  it('should register apply_edit when userInteraction provider is available', () => {
    const server = createMockServer()
    const userInteraction = createMockUserInteraction()
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(),
      userInteraction,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()
  })

  it('should register apply_edit and return result when user approves', async () => {
    const server = createMockServer()
    const userInteraction = createMockUserInteraction(true)
    const files = { 'file:///test.ts': 'const foo = 1; const bar = 2;' }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      userInteraction,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'apply_edit',
      arguments: {
        uri: 'file:///test.ts',
        search_text: 'const foo = 1;',
        replace_text: 'const foo = 100;',
        description: 'Update foo value',
      },
    })
    expect(r.structuredContent).toStrictEqual({
      success: true,
      message: 'Edit successfully applied and saved.',
    })
  })

  it('should register apply_edit and return rejection when user declines', async () => {
    const server = createMockServer()
    const userInteraction = createMockUserInteraction(false)
    const files = { 'file:///test.ts': 'const foo = 1; const bar = 2;' }
    const capabilities: IdeCapabilities = {
      fileAccess: createMockFileAccess(files),
      userInteraction,
    }

    const { success } = installMcpLspDriver({ server, capabilities })
    expect(success).toBeTruthy()

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'apply_edit',
      arguments: {
        uri: 'file:///test.ts',
        search_text: 'const foo = 1;',
        replace_text: 'const foo = 100;',
        description: 'Update foo value',
      },
    })
    expect(r.structuredContent).toStrictEqual({
      success: false,
      message: 'Edit rejected by user.',
    })
  })
})
