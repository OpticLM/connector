// biome-ignore-all lint/style/noNonNullAssertion: acceptable in test

import { describe, expect, it, vi } from 'vitest'
import type {
  DiagnosticsProvider,
  IdeCapabilities,
  OnDiagnosticsChangedCallback,
} from './capabilities.js'
import { mergeCapabilities } from './merge.js'
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
  createMockServer,
} from './server.fixtures.js'
import { installMcpLspDriver } from './server.js'
import type { CodeSnippet, ExactPosition, UnifiedUri } from './types.js'

const dummyUri: UnifiedUri = 'test.ts'
const dummyPos: ExactPosition = { line: 0, character: 0 }

function makeCaps(overrides: Partial<IdeCapabilities> = {}): IdeCapabilities {
  return { fileAccess: createMockFileAccess(), ...overrides }
}

describe('mergeCapabilities – validation', () => {
  it('throws when called with an empty array', () => {
    expect(() => mergeCapabilities([])).toThrow('at least one')
  })

  it('returns the single element unchanged when length is 1', () => {
    const caps = makeCaps()
    expect(mergeCapabilities([caps])).toBe(caps)
  })
})

describe('mergeCapabilities – fileAccess', () => {
  it('uses the first fileAccess provider', async () => {
    const fa1 = createMockFileAccess({ 'a.ts': 'first' })
    const fa2 = createMockFileAccess({ 'a.ts': 'second' })
    const merged = mergeCapabilities([
      makeCaps({ fileAccess: fa1 }),
      makeCaps({ fileAccess: fa2 }),
    ])
    expect(await merged.fileAccess.readFile('a.ts')).toBe('first')
  })
})

describe('mergeCapabilities – edit', () => {
  it('uses the first edit provider', () => {
    const e1 = createMockEditProvider(true)
    const e2 = createMockEditProvider(false)
    const merged = mergeCapabilities([
      makeCaps({ edit: e1 }),
      makeCaps({ edit: e2 }),
    ])
    expect(merged.edit).toBe(e1)
  })

  it('picks the first available edit provider across sparse caps', () => {
    const e2 = createMockEditProvider(true)
    const merged = mergeCapabilities([
      makeCaps(), // no edit
      makeCaps({ edit: e2 }),
    ])
    expect(merged.edit).toBe(e2)
  })
})

describe('mergeCapabilities – definition', () => {
  it('concats results from multiple definition providers', async () => {
    const snippetA: CodeSnippet = {
      uri: 'a.ts',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
      content: 'aaa',
    }
    const snippetB: CodeSnippet = {
      uri: 'b.ts',
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 5 },
      },
      content: 'bbb',
    }
    const merged = mergeCapabilities([
      makeCaps({ definition: createMockDefinitionProvider([snippetA]) }),
      makeCaps({ definition: createMockDefinitionProvider([snippetB]) }),
    ])
    const result = await merged.definition?.provideDefinition(
      dummyUri,
      dummyPos,
    )
    expect(result).toHaveLength(2)
    expect(result![0].uri).toBe('a.ts')
    expect(result![1].uri).toBe('b.ts')
  })

  it('returns undefined when no caps provide definition', () => {
    const merged = mergeCapabilities([makeCaps(), makeCaps()])
    expect(merged.definition).toBeUndefined()
  })
})

describe('mergeCapabilities – references', () => {
  it('concats results from multiple references providers', async () => {
    const snippetA: CodeSnippet = {
      uri: 'ref-a.ts',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 },
      },
      content: 'refA',
    }
    const snippetB: CodeSnippet = {
      uri: 'ref-b.ts',
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 3 },
      },
      content: 'refB',
    }
    const merged = mergeCapabilities([
      makeCaps({ references: createMockReferencesProvider([snippetA]) }),
      makeCaps({ references: createMockReferencesProvider([snippetB]) }),
    ])
    const result = await merged.references?.provideReferences(
      dummyUri,
      dummyPos,
    )
    expect(result).toHaveLength(2)
  })
})

describe('mergeCapabilities – hierarchy', () => {
  it('concats results from multiple hierarchy providers', async () => {
    const snippetA: CodeSnippet = {
      uri: 'h-a.ts',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 },
      },
      content: 'hA',
    }
    const snippetB: CodeSnippet = {
      uri: 'h-b.ts',
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 3 },
      },
      content: 'hB',
    }
    const merged = mergeCapabilities([
      makeCaps({ hierarchy: createMockHierarchyProvider([snippetA]) }),
      makeCaps({ hierarchy: createMockHierarchyProvider([snippetB]) }),
    ])
    const result = await merged.hierarchy?.provideCallHierarchy(
      dummyUri,
      dummyPos,
      'incoming',
    )
    expect(result).toHaveLength(2)
  })
})

describe('mergeCapabilities – diagnostics', () => {
  it('concats provideDiagnostics from multiple providers', async () => {
    const d1 = createMockDiagnosticsProvider([
      {
        uri: 'a.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        severity: 'error',
        message: 'err1',
      },
    ])
    const d2 = createMockDiagnosticsProvider([
      {
        uri: 'a.ts',
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 5 },
        },
        severity: 'warning',
        message: 'warn1',
      },
    ])
    const merged = mergeCapabilities([
      makeCaps({ diagnostics: d1 }),
      makeCaps({ diagnostics: d2 }),
    ])
    const result = await merged.diagnostics?.provideDiagnostics('a.ts')
    expect(result).toHaveLength(2)
    expect(result![0].message).toBe('err1')
    expect(result![1].message).toBe('warn1')
  })

  it('merges getWorkspaceDiagnostics only from providers that have it', async () => {
    const d1 = createMockDiagnosticsProvider(
      [],
      [
        {
          uri: 'ws1.ts',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          severity: 'error',
          message: 'ws-err1',
        },
      ],
    )
    // d2 has no getWorkspaceDiagnostics
    const d2: DiagnosticsProvider = {
      provideDiagnostics: vi.fn(async () => []),
    }
    const merged = mergeCapabilities([
      makeCaps({ diagnostics: d1 }),
      makeCaps({ diagnostics: d2 }),
    ])
    expect(merged.diagnostics?.getWorkspaceDiagnostics).toBeDefined()
    const result = await merged.diagnostics?.getWorkspaceDiagnostics?.()
    expect(result).toHaveLength(1)
    expect(result![0].message).toBe('ws-err1')
  })

  it('omits getWorkspaceDiagnostics when no provider has it', () => {
    const d1: DiagnosticsProvider = {
      provideDiagnostics: vi.fn(async () => []),
    }
    const d2: DiagnosticsProvider = {
      provideDiagnostics: vi.fn(async () => []),
    }
    const merged = mergeCapabilities([
      makeCaps({ diagnostics: d1 }),
      makeCaps({ diagnostics: d2 }),
    ])
    expect(merged.diagnostics?.getWorkspaceDiagnostics).toBeUndefined()
  })
})

describe('mergeCapabilities – outline', () => {
  it('concats results from multiple outline providers', async () => {
    const o1 = createMockOutlineProvider([
      {
        name: 'ClassA',
        kind: 'class',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 5, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 6 },
        },
      },
    ])
    const o2 = createMockOutlineProvider([
      {
        name: 'FuncB',
        kind: 'function',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 3, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
      },
    ])
    const merged = mergeCapabilities([
      makeCaps({ outline: o1 }),
      makeCaps({ outline: o2 }),
    ])
    const result = await merged.outline?.provideDocumentSymbols(dummyUri)
    expect(result).toHaveLength(2)
    expect(result![0].name).toBe('ClassA')
    expect(result![1].name).toBe('FuncB')
  })
})

describe('mergeCapabilities – globalFind', () => {
  it('concats globalFind results', async () => {
    const g1 = createMockGlobalFindProvider([
      {
        uri: 'a.ts',
        line: 1,
        column: 1,
        matchText: 'foo',
        context: 'const foo',
      },
    ])
    const g2 = createMockGlobalFindProvider([
      { uri: 'b.ts', line: 2, column: 1, matchText: 'foo', context: 'let foo' },
    ])
    const merged = mergeCapabilities([
      makeCaps({ globalFind: g1 }),
      makeCaps({ globalFind: g2 }),
    ])
    const result = await merged.globalFind?.globalFind('foo', {
      caseSensitive: false,
      exactMatch: false,
      regexMode: false,
    })
    expect(result).toHaveLength(2)
  })

  it('sums globalReplace counts', async () => {
    const g1 = createMockGlobalFindProvider([], 3)
    const g2 = createMockGlobalFindProvider([], 5)
    const merged = mergeCapabilities([
      makeCaps({ globalFind: g1 }),
      makeCaps({ globalFind: g2 }),
    ])
    const count = await merged.globalFind?.globalReplace('foo', 'bar', {
      caseSensitive: false,
      exactMatch: false,
      regexMode: false,
    })
    expect(count).toBe(8)
  })
})

describe('mergeCapabilities – graph', () => {
  it('concats getLinkStructure from multiple providers', async () => {
    const link1 = {
      sourceUri: 'a.md',
      targetUri: 'b.md',
      resolved: true,
      line: 1,
      column: 1,
    }
    const link2 = {
      sourceUri: 'c.md',
      targetUri: 'd.md',
      resolved: false,
      line: 2,
      column: 1,
    }
    const merged = mergeCapabilities([
      makeCaps({ graph: createMockGraphProvider([link1]) }),
      makeCaps({ graph: createMockGraphProvider([link2]) }),
    ])
    const result = await merged.graph?.getLinkStructure()
    expect(result).toHaveLength(2)
  })

  it('concats resolveOutlinks and resolveBacklinks', async () => {
    const link1 = {
      sourceUri: 'a.md',
      targetUri: 'b.md',
      resolved: true,
      line: 1,
      column: 1,
    }
    const link2 = {
      sourceUri: 'c.md',
      targetUri: 'd.md',
      resolved: true,
      line: 2,
      column: 1,
    }
    const merged = mergeCapabilities([
      makeCaps({ graph: createMockGraphProvider([link1]) }),
      makeCaps({ graph: createMockGraphProvider([link2]) }),
    ])
    expect(await merged.graph?.resolveOutlinks('x.md')).toHaveLength(2)
    expect(await merged.graph?.resolveBacklinks('x.md')).toHaveLength(2)
  })

  it('delegates addLink to the first provider', async () => {
    const g1 = createMockGraphProvider([])
    const g2 = createMockGraphProvider([])
    const merged = mergeCapabilities([
      makeCaps({ graph: g1 }),
      makeCaps({ graph: g2 }),
    ])
    await merged.graph?.addLink('a.md', 'pat', 'b.md')
    expect(g1.addLink).toHaveBeenCalledWith('a.md', 'pat', 'b.md')
    expect(g2.addLink).not.toHaveBeenCalled()
  })
})

describe('mergeCapabilities – frontmatter', () => {
  it('concats getFrontmatterStructure results', async () => {
    const f1 = createMockFrontmatterProvider({}, [
      { path: 'a.md', value: 'tag1' },
    ])
    const f2 = createMockFrontmatterProvider({}, [
      { path: 'b.md', value: 'tag2' },
    ])
    const merged = mergeCapabilities([
      makeCaps({ frontmatter: f1 }),
      makeCaps({ frontmatter: f2 }),
    ])
    const result = await merged.frontmatter?.getFrontmatterStructure('tags')
    expect(result).toHaveLength(2)
  })

  it('merges getFrontmatter via Object.assign', async () => {
    const f1 = createMockFrontmatterProvider({ title: 'A' })
    const f2 = createMockFrontmatterProvider({ author: 'B' })
    const merged = mergeCapabilities([
      makeCaps({ frontmatter: f1 }),
      makeCaps({ frontmatter: f2 }),
    ])
    const fm = await merged.frontmatter?.getFrontmatter('x.md')
    expect(fm).toEqual({ title: 'A', author: 'B' })
  })

  it('delegates setFrontmatter to the first provider', async () => {
    const f1 = createMockFrontmatterProvider()
    const f2 = createMockFrontmatterProvider()
    const merged = mergeCapabilities([
      makeCaps({ frontmatter: f1 }),
      makeCaps({ frontmatter: f2 }),
    ])
    await merged.frontmatter?.setFrontmatter('x.md', 'key', 'val')
    expect(f1.setFrontmatter).toHaveBeenCalledWith('x.md', 'key', 'val')
    expect(f2.setFrontmatter).not.toHaveBeenCalled()
  })
})

describe('mergeCapabilities – onDiagnosticsChanged', () => {
  it('registers callback on every capability that provides it', () => {
    const registered: OnDiagnosticsChangedCallback[] = []
    const handler1 = (cb: OnDiagnosticsChangedCallback) => {
      registered.push(cb)
    }
    const handler2 = (cb: OnDiagnosticsChangedCallback) => {
      registered.push(cb)
    }
    const merged = mergeCapabilities([
      makeCaps({ onDiagnosticsChanged: handler1 }),
      makeCaps({ onDiagnosticsChanged: handler2 }),
    ])

    const myCallback: OnDiagnosticsChangedCallback = () => {}
    merged.onDiagnosticsChanged?.(myCallback)

    // Both handlers should have received the callback
    expect(registered).toHaveLength(2)
    expect(registered[0]).toBe(myCallback)
    expect(registered[1]).toBe(myCallback)
  })

  it('returns undefined when no caps provide onDiagnosticsChanged', () => {
    const merged = mergeCapabilities([makeCaps(), makeCaps()])
    expect(merged.onDiagnosticsChanged).toBeUndefined()
  })
})

describe('installMcpLspDriver – array of capabilities', () => {
  it('accepts an array and merges before registration', () => {
    const server = createMockServer()
    const caps1 = makeCaps({
      definition: createMockDefinitionProvider(),
    })
    const caps2 = makeCaps({
      diagnostics: createMockDiagnosticsProvider(),
    })

    const { success } = installMcpLspDriver({
      server,
      capabilities: [caps1, caps2],
    })
    expect(success).toBeTruthy()
  })

  it('backward-compatible: single IdeCapabilities still works', () => {
    const server = createMockServer()
    const { success } = installMcpLspDriver({
      server,
      capabilities: makeCaps(),
    })
    expect(success).toBeTruthy()
  })
})
