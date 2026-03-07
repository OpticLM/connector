import { describe, expect, it } from 'vitest'
import {
  convertDiagnosticSeverity,
  convertLocationsToSnippets,
  convertLspDiagnostic,
  convertLspDocumentSymbol,
  convertLspRange,
  convertSymbolInformation,
  convertSymbolKind,
  guessLanguageId,
  lspUriToPath,
  pathToLspUri,
} from './lsp-converters.js'

const isWindows = process.platform === 'win32'
const workspacePath = isWindows ? 'C:\\project' : '/project'

describe('URI conversion', () => {
  it('converts SDK path to LSP URI', () => {
    const uri = pathToLspUri(workspacePath, 'src/main.ts')
    expect(uri).toMatch(/^file:\/\//)
    expect(uri).toContain('src/main.ts')
  })

  it('converts LSP URI to SDK path', () => {
    const uri = pathToLspUri(workspacePath, 'src/main.ts')
    const sdkPath = lspUriToPath(workspacePath, uri)
    expect(sdkPath).toBe('src/main.ts')
  })

  it('round-trips nested paths', () => {
    const original = 'src/deep/nested/file.rs'
    const uri = pathToLspUri(workspacePath, original)
    const result = lspUriToPath(workspacePath, uri)
    expect(result).toBe(original)
  })
})

describe('convertLspRange', () => {
  it('converts LSP range to DiskRange', () => {
    const range = convertLspRange({
      start: { line: 5, character: 10 },
      end: { line: 5, character: 20 },
    })
    expect(range).toEqual({
      start: { line: 5, character: 10 },
      end: { line: 5, character: 20 },
    })
  })
})

describe('convertDiagnosticSeverity', () => {
  it('maps LSP severity values', () => {
    expect(convertDiagnosticSeverity(1)).toBe('error')
    expect(convertDiagnosticSeverity(2)).toBe('warning')
    expect(convertDiagnosticSeverity(3)).toBe('information')
    expect(convertDiagnosticSeverity(4)).toBe('hint')
  })

  it('defaults to error for undefined', () => {
    expect(convertDiagnosticSeverity(undefined)).toBe('error')
  })

  it('defaults to error for unknown values', () => {
    expect(convertDiagnosticSeverity(99)).toBe('error')
  })
})

describe('convertSymbolKind', () => {
  it('maps all LSP symbol kinds', () => {
    expect(convertSymbolKind(1)).toBe('file')
    expect(convertSymbolKind(2)).toBe('module')
    expect(convertSymbolKind(3)).toBe('namespace')
    expect(convertSymbolKind(4)).toBe('package')
    expect(convertSymbolKind(5)).toBe('class')
    expect(convertSymbolKind(6)).toBe('method')
    expect(convertSymbolKind(7)).toBe('property')
    expect(convertSymbolKind(8)).toBe('field')
    expect(convertSymbolKind(9)).toBe('constructor')
    expect(convertSymbolKind(10)).toBe('enum')
    expect(convertSymbolKind(11)).toBe('interface')
    expect(convertSymbolKind(12)).toBe('function')
    expect(convertSymbolKind(13)).toBe('variable')
    expect(convertSymbolKind(14)).toBe('constant')
    expect(convertSymbolKind(15)).toBe('string')
    expect(convertSymbolKind(16)).toBe('number')
    expect(convertSymbolKind(17)).toBe('boolean')
    expect(convertSymbolKind(18)).toBe('array')
    expect(convertSymbolKind(19)).toBe('object')
    expect(convertSymbolKind(20)).toBe('key')
    expect(convertSymbolKind(21)).toBe('null')
    expect(convertSymbolKind(22)).toBe('enumMember')
    expect(convertSymbolKind(23)).toBe('struct')
    expect(convertSymbolKind(24)).toBe('event')
    expect(convertSymbolKind(25)).toBe('operator')
    expect(convertSymbolKind(26)).toBe('typeParameter')
  })

  it('defaults to variable for unknown kinds', () => {
    expect(convertSymbolKind(99)).toBe('variable')
  })
})

describe('convertLspDiagnostic', () => {
  it('converts a full diagnostic', () => {
    const uri = pathToLspUri(workspacePath, 'src/main.ts')
    const result = convertLspDiagnostic(workspacePath, uri, {
      range: {
        start: { line: 10, character: 0 },
        end: { line: 10, character: 5 },
      },
      severity: 1,
      message: 'Type error',
      source: 'typescript',
      code: 2345,
    })

    expect(result).toEqual({
      uri: 'src/main.ts',
      range: {
        start: { line: 10, character: 0 },
        end: { line: 10, character: 5 },
      },
      severity: 'error',
      message: 'Type error',
      source: 'typescript',
      code: 2345,
    })
  })

  it('handles missing optional fields', () => {
    const uri = pathToLspUri(workspacePath, 'src/main.ts')
    const result = convertLspDiagnostic(workspacePath, uri, {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      message: 'Error',
    })

    expect(result.severity).toBe('error')
    expect(result.source).toBeUndefined()
    expect(result.code).toBeUndefined()
  })
})

describe('convertLspDocumentSymbol', () => {
  it('converts a simple symbol', () => {
    const result = convertLspDocumentSymbol({
      name: 'myFunction',
      kind: 12,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 5, character: 1 },
      },
      selectionRange: {
        start: { line: 0, character: 9 },
        end: { line: 0, character: 19 },
      },
    })

    expect(result).toEqual({
      name: 'myFunction',
      detail: undefined,
      kind: 'function',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 5, character: 1 },
      },
      selectionRange: {
        start: { line: 0, character: 9 },
        end: { line: 0, character: 19 },
      },
      children: undefined,
    })
  })

  it('converts nested children recursively', () => {
    const result = convertLspDocumentSymbol({
      name: 'MyClass',
      kind: 5,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 20, character: 1 },
      },
      selectionRange: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 13 },
      },
      children: [
        {
          name: 'method',
          kind: 6,
          range: {
            start: { line: 2, character: 2 },
            end: { line: 5, character: 3 },
          },
          selectionRange: {
            start: { line: 2, character: 2 },
            end: { line: 2, character: 8 },
          },
        },
      ],
    })

    expect(result.kind).toBe('class')
    expect(result.children).toHaveLength(1)
    expect(result.children?.[0].kind).toBe('method')
  })
})

describe('convertSymbolInformation', () => {
  it('converts SymbolInformation to DocumentSymbol', () => {
    const result = convertSymbolInformation(workspacePath, {
      name: 'globalVar',
      kind: 13,
      location: {
        uri: pathToLspUri(workspacePath, 'src/main.ts'),
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
      },
    })

    expect(result.name).toBe('globalVar')
    expect(result.kind).toBe('variable')
  })
})

describe('convertLocationsToSnippets', () => {
  const readFile = async (filePath: string) => {
    if (filePath === 'src/main.ts') {
      return 'line 0\nline 1\nline 2\nline 3\nline 4'
    }
    throw new Error('File not found')
  }

  it('returns empty for null', async () => {
    const result = await convertLocationsToSnippets(
      workspacePath,
      null,
      readFile,
    )
    expect(result).toEqual([])
  })

  it('returns empty for undefined', async () => {
    const result = await convertLocationsToSnippets(
      workspacePath,
      undefined,
      readFile,
    )
    expect(result).toEqual([])
  })

  it('returns empty for empty array', async () => {
    const result = await convertLocationsToSnippets(workspacePath, [], readFile)
    expect(result).toEqual([])
  })

  it('converts a single Location', async () => {
    const uri = pathToLspUri(workspacePath, 'src/main.ts')
    const result = await convertLocationsToSnippets(
      workspacePath,
      {
        uri,
        range: {
          start: { line: 1, character: 0 },
          end: { line: 2, character: 6 },
        },
      },
      readFile,
    )

    expect(result).toHaveLength(1)
    expect(result[0].uri).toBe('src/main.ts')
    expect(result[0].content).toBe('line 1\nline 2')
  })

  it('converts Location array', async () => {
    const uri = pathToLspUri(workspacePath, 'src/main.ts')
    const result = await convertLocationsToSnippets(
      workspacePath,
      [
        {
          uri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 6 },
          },
        },
        {
          uri,
          range: {
            start: { line: 3, character: 0 },
            end: { line: 4, character: 6 },
          },
        },
      ],
      readFile,
    )

    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('line 0')
    expect(result[1].content).toBe('line 3\nline 4')
  })

  it('converts LocationLink array', async () => {
    const uri = pathToLspUri(workspacePath, 'src/main.ts')
    const result = await convertLocationsToSnippets(
      workspacePath,
      [
        {
          targetUri: uri,
          targetRange: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 6 },
          },
          targetSelectionRange: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 6 },
          },
        },
      ],
      readFile,
    )

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('line 1')
  })

  it('handles read errors gracefully', async () => {
    const uri = pathToLspUri(workspacePath, 'nonexistent.ts')
    const result = await convertLocationsToSnippets(
      workspacePath,
      {
        uri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
      },
      readFile,
    )

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('')
  })
})

describe('guessLanguageId', () => {
  it('maps common extensions', () => {
    expect(guessLanguageId('main.ts')).toBe('typescript')
    expect(guessLanguageId('main.tsx')).toBe('typescriptreact')
    expect(guessLanguageId('main.js')).toBe('javascript')
    expect(guessLanguageId('main.rs')).toBe('rust')
    expect(guessLanguageId('main.go')).toBe('go')
    expect(guessLanguageId('main.py')).toBe('python')
    expect(guessLanguageId('main.java')).toBe('java')
    expect(guessLanguageId('main.cpp')).toBe('cpp')
    expect(guessLanguageId('main.cs')).toBe('csharp')
  })

  it('returns plaintext for unknown extensions', () => {
    expect(guessLanguageId('file.xyz')).toBe('plaintext')
    expect(guessLanguageId('noext')).toBe('plaintext')
  })

  it('handles paths with directories', () => {
    expect(guessLanguageId('src/deep/file.ts')).toBe('typescript')
  })
})
