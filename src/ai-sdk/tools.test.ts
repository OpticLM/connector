import { describe, expect, it, vi } from 'vitest'
import {
  createMockDefinitionProvider,
  createMockDiagnosticsProvider,
  createMockEditProvider,
  createMockFileAccess,
  createMockFrontmatterProvider,
  createMockGlobalFindProvider,
  createMockGraphProvider,
  createMockHierarchyProvider,
  createMockOutlineProvider,
  createMockReferencesProvider,
  mockCodeSnippet,
} from '../mcp/server.fixtures.js'
import { SymbolResolver } from '../resolver.js'
import type { CodeSnippet, Diagnostic, DocumentSymbol, Link } from '../types.js'
import {
  addLink,
  applyEdit,
  callHierarchy,
  findFileReferences,
  findReferences,
  getBacklinks,
  getDiagnostics,
  getFrontmatter,
  getFrontmatterStructure,
  getLinkStructure,
  getOutline,
  getOutlinks,
  getWorkspaceDiagnostics,
  globalFind,
  gotoDefinition,
  gotoTypeDefinition,
  requestFile,
  setFrontmatter,
} from './tools.js'

async function exec(t: { execute?: (...args: any[]) => any }, params: unknown) {
  return t.execute!(params, {})
}

describe('gotoDefinition', () => {
  it('returns snippets on success', async () => {
    const provider = createMockDefinitionProvider()
    const fileAccess = createMockFileAccess()
    const resolver = new SymbolResolver(fileAccess)
    const t = gotoDefinition(provider, resolver)

    const result = await exec(t, {
      uri: mockCodeSnippet.uri,
      symbol_name: '',
      line_hint: 1,
      order_hint: 0,
    })

    expect(result).toStrictEqual({
      snippets: [
        {
          uri: mockCodeSnippet.uri,
          startLine: mockCodeSnippet.range.start.line + 1,
          endLine: mockCodeSnippet.range.end.line + 1,
          content: mockCodeSnippet.content,
        },
      ],
    })
  })

  it('returns error when symbol not found', async () => {
    const provider = createMockDefinitionProvider()
    const fileAccess = createMockFileAccess({ 'test.ts': 'const foo = 1' })
    const resolver = new SymbolResolver(fileAccess)
    const t = gotoDefinition(provider, resolver)

    const result = await exec(t, {
      uri: 'test.ts',
      symbol_name: 'nonExistent',
      line_hint: 1,
      order_hint: 0,
    })

    expect(result).toHaveProperty('error')
  })

  it('returns error when provider throws', async () => {
    const provider = {
      provideDefinition: vi.fn(async () => {
        throw new Error('Provider crashed')
      }),
    }
    const fileAccess = createMockFileAccess({ 'test.ts': 'const foo = 1' })
    const resolver = new SymbolResolver(fileAccess)
    const t = gotoDefinition(provider, resolver)

    const result = await exec(t, {
      uri: 'test.ts',
      symbol_name: 'foo',
      line_hint: 1,
      order_hint: 0,
    })

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('Provider crashed')
  })
})

describe('gotoTypeDefinition', () => {
  it('returns snippets on success', async () => {
    const provider = createMockDefinitionProvider()
    const fileAccess = createMockFileAccess()
    const resolver = new SymbolResolver(fileAccess)
    const t = gotoTypeDefinition(provider.provideTypeDefinition!, resolver)

    const result = await exec(t, {
      uri: mockCodeSnippet.uri,
      symbol_name: '',
      line_hint: 1,
      order_hint: 0,
    })

    expect(result).toStrictEqual({
      snippets: [
        {
          uri: mockCodeSnippet.uri,
          startLine: mockCodeSnippet.range.start.line + 1,
          endLine: mockCodeSnippet.range.end.line + 1,
          content: mockCodeSnippet.content,
        },
      ],
    })
  })
})

describe('findReferences', () => {
  it('returns mapped snippets', async () => {
    const snippets: CodeSnippet[] = [
      {
        uri: 'src/file1.ts',
        range: {
          start: { line: 9, character: 0 },
          end: { line: 9, character: 11 },
        },
        content: 'someVariable',
      },
    ]
    const provider = createMockReferencesProvider(snippets)
    const fileAccess = createMockFileAccess({
      'src/file.ts':
        'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nsomeVariable',
    })
    const resolver = new SymbolResolver(fileAccess)
    const t = findReferences(provider, resolver)

    const result = await exec(t, {
      uri: 'src/file.ts',
      symbol_name: 'someVariable',
      line_hint: 10,
      order_hint: 0,
    })

    expect(result).toStrictEqual({
      snippets: [
        {
          uri: 'src/file1.ts',
          startLine: 10,
          endLine: 10,
          content: 'someVariable',
        },
      ],
    })
  })
})

describe('callHierarchy', () => {
  it('returns snippets with correct 1-based line numbers', async () => {
    const snippets: CodeSnippet[] = [
      {
        uri: 'caller.ts',
        range: {
          start: { line: 4, character: 0 },
          end: { line: 6, character: 1 },
        },
        content: 'function caller() {}',
      },
    ]
    const provider = createMockHierarchyProvider(snippets)
    const fileAccess = createMockFileAccess({
      'file.ts':
        'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\ntargetFn',
    })
    const resolver = new SymbolResolver(fileAccess)
    const t = callHierarchy(provider, resolver)

    const result = await exec(t, {
      uri: 'file.ts',
      symbol_name: 'targetFn',
      line_hint: 10,
      order_hint: 0,
      direction: 'incoming',
    })

    expect(result).toStrictEqual({
      snippets: [
        {
          uri: 'caller.ts',
          startLine: 5,
          endLine: 7,
          content: 'function caller() {}',
        },
      ],
    })
    expect(provider.provideCallHierarchy).toHaveBeenCalledWith(
      'file.ts',
      expect.any(Object),
      'incoming',
    )
  })

  it('forwards direction parameter', async () => {
    const provider = createMockHierarchyProvider([])
    const fileAccess = createMockFileAccess({ 'file.ts': 'fn' })
    const resolver = new SymbolResolver(fileAccess)
    const t = callHierarchy(provider, resolver)

    await exec(t, {
      uri: 'file.ts',
      symbol_name: 'fn',
      line_hint: 1,
      order_hint: 0,
      direction: 'outgoing',
    })

    expect(provider.provideCallHierarchy).toHaveBeenCalledWith(
      'file.ts',
      expect.any(Object),
      'outgoing',
    )
  })
})

describe('findFileReferences', () => {
  it('returns mapped file reference snippets', async () => {
    const snippets: CodeSnippet[] = [
      {
        uri: 'src/importer.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 26 },
        },
        content: "import { foo } from './foo'",
      },
    ]
    const provider = createMockReferencesProvider([], snippets)
    const t = findFileReferences(provider.provideFileReferences!)

    const result = await exec(t, { uri: 'src/foo.ts' })

    expect(result).toStrictEqual({
      snippets: [
        {
          uri: 'src/importer.ts',
          startLine: 1,
          endLine: 1,
          content: "import { foo } from './foo'",
        },
      ],
    })
  })
})

// ─── Apply Edit ───────────────────────────────────────────────────────────────

describe('applyEdit', () => {
  it('returns Approved result when user approves', async () => {
    const updated = 'const foo = 100; const bar = 2;'
    const provider = createMockEditProvider({ type: 'Approved', updated })
    const fileAccess = createMockFileAccess({
      'test.ts': 'const foo = 1; const bar = 2;',
    })
    const t = applyEdit(provider, fileAccess)

    const result = await exec(t, {
      uri: 'test.ts',
      start_line: '1:4e|const foo = 1; const bar = 2;',
      replace_text: updated,
      description: 'Update foo value',
    })

    expect(result).toStrictEqual({ type: 'Approved', updated })
  })

  it('returns UserRejected when user declines', async () => {
    const provider = createMockEditProvider({ type: 'UserRejected' })
    const fileAccess = createMockFileAccess({
      'test.ts': 'const foo = 1; const bar = 2;',
    })
    const t = applyEdit(provider, fileAccess)

    const result = await exec(t, {
      uri: 'test.ts',
      start_line: '1:4e|const foo = 1; const bar = 2;',
      replace_text: 'const foo = 100; const bar = 2;',
      description: 'Update foo value',
    })

    expect(result).toStrictEqual({ type: 'UserRejected' })
  })

  it('passes correctly computed updated content to applyEdits', async () => {
    const provider = createMockEditProvider({ type: 'Approved', updated: '' })
    const fileAccess = createMockFileAccess({
      'test.ts': 'line1\nline2\nline3',
    })
    const t = applyEdit(provider, fileAccess)

    await exec(t, {
      uri: 'test.ts',
      start_line: '2:fa|line2',
      replace_text: 'REPLACED',
      description: 'Replace line 2',
    })

    expect(provider.applyEdits).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'test.ts',
        updated: 'line1\nREPLACED\nline3',
        description: 'Replace line 2',
      }),
    )
  })

  it('supports multi-line range edit', async () => {
    const provider = createMockEditProvider({ type: 'Approved', updated: '' })
    const fileAccess = createMockFileAccess({
      'test.ts': 'line1\nline2\nline3\nline4',
    })
    const t = applyEdit(provider, fileAccess)

    await exec(t, {
      uri: 'test.ts',
      start_line: '2:fa|line2',
      end_line: '3:db|line3',
      replace_text: 'REPLACED',
      description: 'Replace lines 2-3',
    })

    expect(provider.applyEdits).toHaveBeenCalledWith(
      expect.objectContaining({ updated: 'line1\nREPLACED\nline4' }),
    )
  })

  it('returns error on hash mismatch (stale read)', async () => {
    const provider = createMockEditProvider()
    const fileAccess = createMockFileAccess({ 'test.ts': 'const foo = 1;' })
    const t = applyEdit(provider, fileAccess)

    const result = await exec(t, {
      uri: 'test.ts',
      start_line: '1:00|abc',
      replace_text: 'replacement',
      description: 'Test edit',
    })

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('Hash mismatch')
  })

  it('returns error when line is out of range', async () => {
    const provider = createMockEditProvider()
    const fileAccess = createMockFileAccess({ 'test.ts': 'line1' })
    const t = applyEdit(provider, fileAccess)

    const result = await exec(t, {
      uri: 'test.ts',
      start_line: '5:00|abc',
      replace_text: 'replacement',
      description: 'Test edit',
    })

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('out of range')
  })
})

// ─── Diagnostics ─────────────────────────────────────────────────────────────

describe('getDiagnostics', () => {
  it('returns diagnostics for a file', async () => {
    const diagnostics: Diagnostic[] = [
      {
        uri: 'test.ts',
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 10 },
        },
        severity: 'error',
        message: 'Syntax error',
        source: 'typescript',
        code: 2322,
      },
    ]
    const provider = createMockDiagnosticsProvider(diagnostics)
    const t = getDiagnostics(provider)

    const result = await exec(t, { path: 'test.ts' })

    expect(result).toStrictEqual({ diagnostics })
    expect(provider.provideDiagnostics).toHaveBeenCalledWith('test.ts')
  })

  it('returns empty diagnostics array when file is clean', async () => {
    const provider = createMockDiagnosticsProvider([])
    const t = getDiagnostics(provider)

    const result = await exec(t, { path: 'clean.ts' })

    expect(result).toStrictEqual({ diagnostics: [] })
  })

  it('returns error when provider throws', async () => {
    const provider = {
      provideDiagnostics: vi.fn(async () => {
        throw new Error('Failed to get diagnostics')
      }),
    }
    const t = getDiagnostics(provider)

    const result = await exec(t, { path: 'test.ts' })

    expect(result).toHaveProperty('error')
  })
})

describe('getWorkspaceDiagnostics', () => {
  it('returns all workspace diagnostics', async () => {
    const diagnostics: Diagnostic[] = [
      {
        uri: 'file1.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        severity: 'warning',
        message: 'Unused variable',
      },
    ]
    const provider = createMockDiagnosticsProvider([], diagnostics)
    const t = getWorkspaceDiagnostics(provider.getWorkspaceDiagnostics!)

    const result = await exec(t, {})

    expect(result).toStrictEqual({ diagnostics })
  })
})

// ─── Outline ──────────────────────────────────────────────────────────────────

describe('getOutline', () => {
  it('returns document symbols', async () => {
    const symbols: DocumentSymbol[] = [
      {
        name: 'MyClass',
        kind: 'class',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 1 },
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 13 },
        },
        children: [
          {
            name: 'myMethod',
            kind: 'method',
            range: {
              start: { line: 2, character: 2 },
              end: { line: 5, character: 3 },
            },
            selectionRange: {
              start: { line: 2, character: 2 },
              end: { line: 2, character: 10 },
            },
          },
        ],
      },
    ]
    const provider = createMockOutlineProvider(symbols)
    const t = getOutline(provider)

    const result = await exec(t, { path: 'src/MyClass.ts' })

    expect(result).toStrictEqual({ symbols })
    expect(provider.provideDocumentSymbols).toHaveBeenCalledWith(
      'src/MyClass.ts',
    )
  })
})

// ─── Request File ─────────────────────────────────────────────────────────────

describe('requestFile', () => {
  it('returns hashline-formatted file content', async () => {
    const fileAccess = createMockFileAccess({
      'src/test.ts': 'line1\nline2\nline3',
    })
    const t = requestFile(fileAccess)

    const result = await exec(t, { path: 'src/test.ts' })

    expect(result).toStrictEqual({
      type: 'file',
      content: '1:99|line1\n2:fa|line2\n3:db|line3',
    })
  })

  it('filters by start_line / end_line', async () => {
    const fileAccess = createMockFileAccess({
      'src/test.ts': 'line1\nline2\nline3\nline4\nline5',
    })
    const t = requestFile(fileAccess)

    const result = await exec(t, {
      path: 'src/test.ts',
      start_line: 2,
      end_line: 4,
    })

    expect(result).toStrictEqual({
      type: 'file',
      content: '2:fa|line2\n3:db|line3\n4:3c|line4',
    })
  })

  it('defaults end_line to start_line for single-line range', async () => {
    const fileAccess = createMockFileAccess({
      'src/test.ts': 'line1\nline2\nline3',
    })
    const t = requestFile(fileAccess)

    const result = await exec(t, { path: 'src/test.ts', start_line: 2 })

    expect(result).toStrictEqual({ type: 'file', content: '2:fa|line2' })
  })

  it('filters by regex pattern', async () => {
    const fileAccess = createMockFileAccess({
      'src/test.ts':
        'import { foo } from "bar"\nconst x = 1\nimport { baz } from "qux"',
    })
    const t = requestFile(fileAccess)

    const result = await exec(t, { path: 'src/test.ts', pattern: '^import' })

    expect(result).toStrictEqual({
      type: 'file',
      content: '1:0b|import { foo } from "bar"\n3:d7|import { baz } from "qux"',
    })
  })

  it('combines line range and pattern filters', async () => {
    const fileAccess = createMockFileAccess({
      'src/test.ts': 'line1\nline2 match\nline3\nline4 match\nline5',
    })
    const t = requestFile(fileAccess)

    const result = await exec(t, {
      path: 'src/test.ts',
      pattern: 'match',
      start_line: 2,
      end_line: 4,
    })

    expect(result).toStrictEqual({
      type: 'file',
      content: '2:9d|line2 match\n4:b8|line4 match',
    })
  })

  it('falls back to directory listing when path is a directory', async () => {
    const fileAccess = createMockFileAccess({}, false, true)
    const t = requestFile(fileAccess)

    const result = await exec(t, { path: 'src' })

    expect(result).toStrictEqual({
      type: 'directory',
      entries: ['file1.ts', 'file2.ts', 'subdir'],
    })
  })

  it('throws when URI does not point to a file or directory', async () => {
    const fileAccess = createMockFileAccess({}, false, false)
    const t = requestFile(fileAccess)

    const result = await exec(t, { path: 'src' })

    expect(result).toStrictEqual({
      error:
        'The URI does not point to a file or a directory, so it cannot be accessed.',
    })
  })
})

// ─── Graph Tools ──────────────────────────────────────────────────────────────

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
]

describe('getLinkStructure', () => {
  it('returns all workspace links', async () => {
    const provider = createMockGraphProvider(mockLinks)
    const t = getLinkStructure(provider)

    const result = await exec(t, {})

    expect(result).toStrictEqual({ links: mockLinks })
    expect(provider.getLinkStructure).toHaveBeenCalled()
  })

  it('returns empty array when no links', async () => {
    const provider = createMockGraphProvider([])
    const t = getLinkStructure(provider)

    const result = await exec(t, {})

    expect(result).toStrictEqual({ links: [] })
  })

  it('returns error when provider throws', async () => {
    const provider = createMockGraphProvider()
    vi.mocked(provider.getLinkStructure).mockRejectedValue(
      new Error('Provider error'),
    )
    const t = getLinkStructure(provider)

    const result = await exec(t, {})

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('Provider error')
  })
})

describe('getOutlinks', () => {
  it('returns outgoing links for a file', async () => {
    const provider = createMockGraphProvider(mockLinks)
    const t = getOutlinks(provider)

    const result = await exec(t, { path: 'notes/index.md' })

    expect(result).toStrictEqual({ links: mockLinks })
    expect(provider.resolveOutlinks).toHaveBeenCalledWith('notes/index.md')
  })
})

describe('getBacklinks', () => {
  it('returns incoming links for a file', async () => {
    const provider = createMockGraphProvider(mockLinks)
    const t = getBacklinks(provider)

    const result = await exec(t, { path: 'notes/topic-a.md' })

    expect(result).toStrictEqual({ links: mockLinks })
    expect(provider.resolveBacklinks).toHaveBeenCalledWith('notes/topic-a.md')
  })
})

describe('addLink', () => {
  it('returns success when link is added', async () => {
    const provider = createMockGraphProvider([])
    const t = addLink(provider)

    const result = await exec(t, {
      path: 'notes/draft.md',
      pattern: 'topic A',
      link_to: 'notes/topic-a.md',
    })

    expect(result).toStrictEqual({
      success: true,
      message: 'Link added successfully.',
    })
    expect(provider.addLink).toHaveBeenCalledWith(
      'notes/draft.md',
      'topic A',
      'notes/topic-a.md',
    )
  })

  it('returns error when pattern is not found', async () => {
    const provider = createMockGraphProvider([], new Error('Pattern not found'))
    const t = addLink(provider)

    const result = await exec(t, {
      path: 'notes/draft.md',
      pattern: 'nonexistent',
      link_to: 'notes/topic-a.md',
    })

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Pattern not found'),
    })
  })
})

// ─── Frontmatter ──────────────────────────────────────────────────────────────

describe('getFrontmatter', () => {
  it('returns frontmatter for a file', async () => {
    const frontmatter = { title: 'My Note', tags: ['typescript'] }
    const provider = createMockFrontmatterProvider(frontmatter)
    const t = getFrontmatter(provider)

    const result = await exec(t, { path: 'notes/my-note.md' })

    expect(result).toStrictEqual({ frontmatter })
    expect(provider.getFrontmatter).toHaveBeenCalledWith('notes/my-note.md')
  })
})

describe('getFrontmatterStructure', () => {
  it('returns matching frontmatter across documents', async () => {
    const matches = [
      { path: 'notes/doc1.md', value: 'value1' },
      { path: 'notes/doc2.md', value: 'value2' },
    ]
    const provider = createMockFrontmatterProvider({}, matches)
    const t = getFrontmatterStructure(provider)

    const result = await exec(t, { property: 'title' })

    expect(result).toStrictEqual({ matches })
  })

  it('passes optional path to provider', async () => {
    const provider = createMockFrontmatterProvider()
    const t = getFrontmatterStructure(provider)

    await exec(t, { property: 'title', path: 'notes/specific.md' })

    expect(provider.getFrontmatterStructure).toHaveBeenCalledWith(
      'title',
      'notes/specific.md',
    )
  })
})

describe('setFrontmatter', () => {
  it('returns success when frontmatter is updated', async () => {
    const provider = createMockFrontmatterProvider()
    const t = setFrontmatter(provider)

    const result = await exec(t, {
      path: 'notes/my-note.md',
      property: 'title',
      value: 'New Title',
    })

    expect(result).toStrictEqual({
      success: true,
      message: 'Frontmatter updated successfully.',
    })
    expect(provider.setFrontmatter).toHaveBeenCalledWith(
      'notes/my-note.md',
      'title',
      'New Title',
    )
  })

  it('converts null value to undefined', async () => {
    const provider = createMockFrontmatterProvider()
    const t = setFrontmatter(provider)

    await exec(t, { path: 'notes/my-note.md', property: 'title', value: null })

    expect(provider.setFrontmatter).toHaveBeenCalledWith(
      'notes/my-note.md',
      'title',
      undefined,
    )
  })

  it('returns error when provider throws', async () => {
    const provider = createMockFrontmatterProvider(
      {},
      [],
      new Error('Write failed'),
    )
    const t = setFrontmatter(provider)

    const result = await exec(t, {
      path: 'notes/my-note.md',
      property: 'title',
      value: 'New Title',
    })

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Write failed'),
    })
  })
})

// ─── Global Find ──────────────────────────────────────────────────────────────

describe('globalFind', () => {
  it('returns matches with count', async () => {
    const matches = [
      {
        uri: 'src/foo.ts',
        line: 5,
        column: 10,
        matchText: 'myFunc',
        context: '  myFunc()',
      },
      {
        uri: 'src/bar.ts',
        line: 12,
        column: 0,
        matchText: 'myFunc',
        context: 'function myFunc()',
      },
    ]
    const provider = createMockGlobalFindProvider(matches)
    const t = globalFind(provider)

    const result = await exec(t, {
      query: 'myFunc',
      case_sensitive: false,
      exact_match: false,
      regex_mode: false,
    })

    expect(result).toStrictEqual({ count: 2, matches })
  })

  it('passes search options to provider', async () => {
    const provider = createMockGlobalFindProvider([])
    const t = globalFind(provider)

    await exec(t, {
      query: 'TODO',
      case_sensitive: true,
      exact_match: true,
      regex_mode: false,
    })

    expect(provider.globalFind).toHaveBeenCalledWith('TODO', {
      caseSensitive: true,
      exactMatch: true,
      regexMode: false,
    })
  })

  it('returns empty results when no matches found', async () => {
    const provider = createMockGlobalFindProvider([])
    const t = globalFind(provider)

    const result = await exec(t, {
      query: 'xyz123',
      case_sensitive: false,
      exact_match: false,
      regex_mode: false,
    })

    expect(result).toStrictEqual({ count: 0, matches: [] })
  })
})
