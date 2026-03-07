import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type {
  Location,
  LocationLink,
  Diagnostic as LspDiagnostic,
  DocumentSymbol as LspDocumentSymbol,
  SymbolInformation,
} from 'vscode-languageserver-protocol'
import type {
  CodeSnippet,
  Diagnostic,
  DiagnosticSeverity,
  DiskRange,
  DocumentSymbol,
  ExactPosition,
  SymbolKind,
} from '../types.js'

export function pathToLspUri(workspacePath: string, sdkPath: string): string {
  const absolute = path.resolve(workspacePath, sdkPath)
  return pathToFileURL(absolute).toString()
}

export function lspUriToPath(workspacePath: string, lspUri: string): string {
  const absolute = fileURLToPath(lspUri)
  return path.relative(workspacePath, absolute).replace(/\\/g, '/')
}

export function convertLspRange(range: {
  start: { line: number; character: number }
  end: { line: number; character: number }
}): DiskRange {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  }
}

export function convertLspPosition(pos: {
  line: number
  character: number
}): ExactPosition {
  return { line: pos.line, character: pos.character }
}

const SEVERITY_MAP: Record<number, DiagnosticSeverity> = {
  1: 'error',
  2: 'warning',
  3: 'information',
  4: 'hint',
}

export function convertDiagnosticSeverity(
  severity: number | undefined,
): DiagnosticSeverity {
  return SEVERITY_MAP[severity ?? 1] ?? 'error'
}

const SYMBOL_KIND_MAP: SymbolKind[] = [
  'file', // 0 (unused, LSP starts at 1)
  'file', // 1
  'module', // 2
  'namespace', // 3
  'package', // 4
  'class', // 5
  'method', // 6
  'property', // 7
  'field', // 8
  'constructor', // 9
  'enum', // 10
  'interface', // 11
  'function', // 12
  'variable', // 13
  'constant', // 14
  'string', // 15
  'number', // 16
  'boolean', // 17
  'array', // 18
  'object', // 19
  'key', // 20
  'null', // 21
  'enumMember', // 22
  'struct', // 23
  'event', // 24
  'operator', // 25
  'typeParameter', // 26
]

export function convertSymbolKind(kind: number): SymbolKind {
  return SYMBOL_KIND_MAP[kind] ?? 'variable'
}

export function convertLspDiagnostic(
  workspacePath: string,
  uri: string,
  diag: LspDiagnostic,
): Diagnostic {
  return {
    uri: lspUriToPath(workspacePath, uri),
    range: convertLspRange(diag.range),
    severity: convertDiagnosticSeverity(diag.severity),
    message: diag.message,
    source: diag.source,
    code:
      typeof diag.code === 'object'
        ? String(diag.code)
        : (diag.code ?? undefined),
  }
}

export function convertLspDocumentSymbol(
  symbol: LspDocumentSymbol,
): DocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: convertSymbolKind(symbol.kind),
    range: convertLspRange(symbol.range),
    selectionRange: convertLspRange(symbol.selectionRange),
    children: symbol.children?.map(convertLspDocumentSymbol),
  }
}

export function convertSymbolInformation(
  _workspacePath: string,
  info: SymbolInformation,
): DocumentSymbol {
  return {
    name: info.name,
    kind: convertSymbolKind(info.kind),
    range: convertLspRange(info.location.range),
    selectionRange: convertLspRange(info.location.range),
  }
}

export async function convertLocationsToSnippets(
  workspacePath: string,
  locations: Location | Location[] | LocationLink[] | null | undefined,
  readFile: (path: string) => Promise<string>,
): Promise<CodeSnippet[]> {
  if (!locations) return []

  const locs = Array.isArray(locations) ? locations : [locations]
  if (locs.length === 0) return []

  const results: CodeSnippet[] = []

  for (const loc of locs) {
    const isLink = 'targetUri' in loc
    const uri = isLink ? (loc as LocationLink).targetUri : (loc as Location).uri
    const range = isLink
      ? (loc as LocationLink).targetRange
      : (loc as Location).range

    const sdkPath = lspUriToPath(workspacePath, uri)
    const diskRange = convertLspRange(range)

    try {
      const content = await readFile(sdkPath)
      const lines = content.split('\n')
      const snippetLines = lines.slice(
        diskRange.start.line,
        diskRange.end.line + 1,
      )
      results.push({
        uri: sdkPath,
        range: diskRange,
        content: snippetLines.join('\n'),
      })
    } catch {
      results.push({
        uri: sdkPath,
        range: diskRange,
        content: '',
      })
    }
  }

  return results
}

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.rs': 'rust',
  '.go': 'go',
  '.py': 'python',
  '.rb': 'ruby',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.lua': 'lua',
  '.zig': 'zig',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
  '.ps1': 'powershell',
  '.dart': 'dart',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.ml': 'ocaml',
  '.mli': 'ocaml',
  '.scala': 'scala',
  '.r': 'r',
  '.R': 'r',
  '.php': 'php',
  '.pl': 'perl',
  '.vim': 'vim',
}

export function guessLanguageId(filePath: string): string {
  const ext = path.extname(filePath)
  return LANGUAGE_MAP[ext] ?? 'plaintext'
}
