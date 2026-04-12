import { describe, expect, it } from 'vitest'
import type { CodeSnippet } from '../types.js'
import { install } from './index.js'
import {
  createAndConnectMockClient,
  createMockDefinitionProvider,
  createMockEditProvider,
  createMockFileAccess,
  createMockHierarchyProvider,
  createMockReferencesProvider,
  createMockServer,
  mockCodeSnippet,
} from './server.fixtures.js'

describe('tool registration', () => {
  it('should register goto_definition when definition provider is available', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess()
    const definitionProvider = createMockDefinitionProvider()

    install(server, fileAccess)
    install(server, definitionProvider, { fileAccess })

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

  it('should register goto_type_definition when typeDefinition provider is available', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess()
    const definitionProvider = createMockDefinitionProvider()

    install(server, fileAccess)
    install(server, definitionProvider, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'goto_type_definition',
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

  it('should not register goto_type_definition when provideTypeDefinition is absent', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess()

    install(server, fileAccess)
    install(
      server,
      { provideDefinition: async () => [mockCodeSnippet] },
      { fileAccess },
    )

    const client = await createAndConnectMockClient(server)

    const r = await client.callTool({
      name: 'goto_type_definition',
      arguments: { uri: mockCodeSnippet.uri, symbol_name: '', line_hint: 1 },
    })
    expect(r.isError).toBe(true)
  })

  it('should register find_references and return formatted results when called', async () => {
    const server = createMockServer()
    const referenceSnippets: CodeSnippet[] = [
      {
        uri: 'path/to/file1',
        range: {
          start: { line: 10, character: 5 },
          end: { line: 10, character: 10 },
        },
        content: 'someVariable',
      },
      {
        uri: 'path/to/file2',
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
      'path/to/file':
        'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nsomeVariable\nline11',
    }
    const fileAccess = createMockFileAccess(files)

    install(server, fileAccess)
    install(server, referencesProvider, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'find_references',
      arguments: {
        uri: 'path/to/file',
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
          uri: 'path/to/file1',
        },
        {
          content: 'someVariable = 42',
          endLine: 21,
          startLine: 21,
          uri: 'path/to/file2',
        },
      ],
    })
  })

  it('should register call_hierarchy and return formatted results when called', async () => {
    const server = createMockServer()
    const callHierarchySnippets: CodeSnippet[] = [
      {
        uri: 'path/to/caller1',
        range: {
          start: { line: 5, character: 0 },
          end: { line: 7, character: 1 },
        },
        content: 'function caller1() {\n  targetFunction()\n}',
      },
      {
        uri: 'path/to/caller2',
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
      'path/to/file':
        'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\ntargetFunction\nline11',
    }
    const fileAccess = createMockFileAccess(files)

    install(server, fileAccess)
    install(server, hierarchyProvider, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'call_hierarchy',
      arguments: {
        uri: 'path/to/file',
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
          uri: 'path/to/caller1',
        },
        {
          content: 'function caller2() {\n  x = targetFunction()\n}',
          endLine: 19,
          startLine: 16,
          uri: 'path/to/caller2',
        },
      ],
    })
  })

  it('should forward direction parameter for outgoing call hierarchy', async () => {
    const server = createMockServer()
    const callHierarchySnippets: CodeSnippet[] = [
      {
        uri: 'path/to/callee',
        range: {
          start: { line: 10, character: 0 },
          end: { line: 12, character: 1 },
        },
        content: 'function callee() {}',
      },
    ]
    const hierarchyProvider = createMockHierarchyProvider(callHierarchySnippets)
    const files = {
      'path/to/file':
        'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\ntargetFunction\nline11',
    }
    const fileAccess = createMockFileAccess(files)

    install(server, fileAccess)
    install(server, hierarchyProvider, { fileAccess })

    const client = await createAndConnectMockClient(server)
    await client.callTool({
      name: 'call_hierarchy',
      arguments: {
        uri: 'path/to/file',
        symbol_name: 'targetFunction',
        line_hint: 10,
        direction: 'outgoing',
      },
    })
    expect(hierarchyProvider.provideCallHierarchy).toHaveBeenCalledWith(
      'path/to/file',
      expect.any(Object),
      'outgoing',
    )
  })

  it('should register find_file_references when provideFileReferences is available', async () => {
    const server = createMockServer()
    const fileSnippets: CodeSnippet[] = [
      {
        uri: 'src/importer.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 26 },
        },
        content: "import { foo } from './foo'",
      },
    ]
    const referencesProvider = createMockReferencesProvider([], fileSnippets)
    const fileAccess = createMockFileAccess()

    install(server, fileAccess)
    install(server, referencesProvider, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'find_file_references',
      arguments: { uri: 'src/foo.ts' },
    })
    expect(r.structuredContent).toStrictEqual({
      snippets: [
        {
          content: "import { foo } from './foo'",
          endLine: 1,
          startLine: 1,
          uri: 'src/importer.ts',
        },
      ],
    })
  })

  it('should not register find_file_references when provideFileReferences is absent', async () => {
    const server = createMockServer()
    const referencesProvider = createMockReferencesProvider()
    const fileAccess = createMockFileAccess()

    install(server, fileAccess)
    install(server, referencesProvider, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'find_file_references',
      arguments: { uri: 'src/foo.ts' },
    })
    expect(r.isError).toBe(true)
  })

  it('should register apply_edit and return result when user approves', async () => {
    const server = createMockServer()
    const updated = 'const foo = 100; const bar = 2;'
    const edit = createMockEditProvider({ type: 'Approved', updated })
    const files = { 'test.ts': 'const foo = 1; const bar = 2;' }
    const fileAccess = createMockFileAccess(files)

    install(server, fileAccess)
    install(server, edit, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'apply_edit',
      arguments: {
        uri: 'test.ts',
        start_line: '1:4e|const foo = 1; const bar = 2;',
        replace_text: updated,
        description: 'Update foo value',
      },
    })
    expect(r.structuredContent).toStrictEqual({ type: 'Approved', updated })
  })

  it('should pass computed updated content to applyEdits', async () => {
    const server = createMockServer()
    const edit = createMockEditProvider({ type: 'Approved', updated: '' })
    // Three-line file; edit replaces line 2
    const files = { 'test.ts': 'line1\nline2\nline3' }
    const fileAccess = createMockFileAccess(files)

    install(server, fileAccess)
    install(server, edit, { fileAccess })

    const client = await createAndConnectMockClient(server)
    await client.callTool({
      name: 'apply_edit',
      arguments: {
        uri: 'test.ts',
        start_line: '2:fa|line2',
        replace_text: 'REPLACED',
        description: 'Replace line 2',
      },
    })
    expect(edit.applyEdits).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'test.ts',
        updated: 'line1\nREPLACED\nline3',
        description: 'Replace line 2',
      }),
    )
  })

  it('should register apply_edit and return rejection when user declines', async () => {
    const server = createMockServer()
    const edit = createMockEditProvider({ type: 'UserRejected' })
    const files = { 'test.ts': 'const foo = 1; const bar = 2;' }
    const fileAccess = createMockFileAccess(files)

    install(server, fileAccess)
    install(server, edit, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'apply_edit',
      arguments: {
        uri: 'test.ts',
        start_line: '1:4e|const foo = 1; const bar = 2;',
        replace_text: 'const foo = 100; const bar = 2;',
        description: 'Update foo value',
      },
    })
    expect(r.structuredContent).toStrictEqual({ type: 'UserRejected' })
  })

  it('should return error when symbol is not found in file', async () => {
    const server = createMockServer()
    const definitionProvider = createMockDefinitionProvider()
    const files = { 'test.ts': 'const foo = 1' }
    const fileAccess = createMockFileAccess(files)

    install(server, fileAccess)
    install(server, definitionProvider, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'goto_definition',
      arguments: { uri: 'test.ts', symbol_name: 'nonExistent', line_hint: 1 },
    })
    expect(r.isError).toBe(true)
  })

  it('should return error when definition provider throws', async () => {
    const server = createMockServer()
    const files = { 'test.ts': 'const foo = 1' }
    const fileAccess = createMockFileAccess(files)

    install(server, fileAccess)
    install(
      server,
      {
        provideDefinition: async () => {
          throw new Error('Provider crashed')
        },
      },
      { fileAccess },
    )

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'goto_definition',
      arguments: { uri: 'test.ts', symbol_name: 'foo', line_hint: 1 },
    })
    expect(r.isError).toBe(true)
    expect(r.structuredContent).toMatchObject({ error: expect.any(String) })
  })

  it('should return error when apply_edit hash does not match (stale read)', async () => {
    const server = createMockServer()
    const edit = createMockEditProvider()
    const files = { 'test.ts': 'const foo = 1;' }
    const fileAccess = createMockFileAccess(files)

    install(server, fileAccess)
    install(server, edit, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.callTool({
      name: 'apply_edit',
      arguments: {
        uri: 'test.ts',
        start_line: '1:00|a',
        replace_text: 'replacement',
        description: 'Test edit',
      },
    })
    expect(r.isError).toBe(true)
    expect(r.structuredContent).toMatchObject({ success: false })
  })
})
