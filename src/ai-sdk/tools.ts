import { tool } from 'ai'
import z from 'zod'
import type {
  DefinitionProvider,
  DiagnosticsProvider,
  FrontmatterProvider,
  GlobalFindProvider,
  GraphProvider,
  HierarchyProvider,
  OutlineProvider,
  ReferencesProvider,
} from '../capabilities.js'
import { generateEditId, normalizeUri } from '../formatting.js'
import { formatAsHashlines, toNumberedLines } from '../hashline.js'
import type { EditProvider, FileAccessProvider } from '../interfaces.js'
import type { SymbolResolver } from '../resolver.js'
import {
  AddLinkSchema,
  ApplyEditSchema,
  CallHierarchySchema,
  FileReferencesSchema,
  FuzzyPositionSchema,
  GetFrontmatterStructureSchema,
  GlobalFindSchema,
  SetFrontmatterSchema,
} from '../schemas.js'
import type { CodeSnippet, FuzzyPosition } from '../types.js'
import {
  GetBacklinksSchema,
  GetDiagnosticsSchema,
  GetFrontmatterSchema,
  GetOutlineSchema,
  GetOutlinksSchema,
  RequestFileSchema,
} from './schema.js'
import { dryRunEdit } from './utils.js'

function mapSnippets(snippets: CodeSnippet[]) {
  return snippets.map((s) => ({
    uri: s.uri,
    startLine: s.range.start.line + 1,
    endLine: s.range.end.line + 1,
    content: s.content,
  }))
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return { error: message }
}

export const gotoDefinition = (
  provider: DefinitionProvider,
  resolver: SymbolResolver,
) =>
  tool({
    description: 'Navigate to the definition of a symbol.',
    inputSchema: FuzzyPositionSchema,
    execute: async (params) => {
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }
        const position = await resolver.resolvePosition(uri, fuzzy)
        const snippets = mapSnippets(
          await provider.provideDefinition(uri, position),
        )
        return { snippets }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const gotoTypeDefinition = (
  provideTypeDefinition: NonNullable<
    DefinitionProvider['provideTypeDefinition']
  >,
  resolver: SymbolResolver,
) =>
  tool({
    description: 'Navigate to the type definition of a symbol.',
    inputSchema: FuzzyPositionSchema,
    execute: async (params) => {
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }
        const position = await resolver.resolvePosition(uri, fuzzy)
        const snippets = mapSnippets(await provideTypeDefinition(uri, position))
        return { snippets }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const findReferences = (
  provider: ReferencesProvider,
  resolver: SymbolResolver,
) =>
  tool({
    description:
      'Find all references to a symbol. Returns a list of locations where the symbol is used.',
    inputSchema: FuzzyPositionSchema,
    execute: async (params) => {
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }
        const position = await resolver.resolvePosition(uri, fuzzy)
        const snippets = mapSnippets(
          await provider.provideReferences(uri, position),
        )
        return { snippets }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const callHierarchy = (
  provider: HierarchyProvider,
  resolver: SymbolResolver,
) =>
  tool({
    description:
      'Get call hierarchy for a function or method. Shows incoming or outgoing calls.',
    inputSchema: CallHierarchySchema,
    execute: async (params) => {
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }
        const position = await resolver.resolvePosition(uri, fuzzy)
        const snippets = mapSnippets(
          await provider.provideCallHierarchy(uri, position, params.direction),
        )
        return { snippets }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const findFileReferences = (
  provideFileReferences: NonNullable<
    ReferencesProvider['provideFileReferences']
  >,
) =>
  tool({
    description:
      'Find all references to a file across the workspace. Returns locations that import or link to the given file.',
    inputSchema: FileReferencesSchema,
    execute: async (params) => {
      try {
        const uri = normalizeUri(params.uri)
        const snippets = mapSnippets(await provideFileReferences(uri))
        return { snippets }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const applyEdit = (
  provider: EditProvider,
  fileAccess: FileAccessProvider,
) =>
  tool({
    description:
      'Apply a text edit to a file. WORKFLOW: First read the file via the request_file tool to get ' +
      'hashline-formatted content (e.g., "3:a1|  return x"). Then reference lines by their "line:hash" ' +
      'to specify the edit range. The hash verifies the file has not changed since your read — if it has, ' +
      'the edit is rejected and you must re-read the file. ' +
      'For single-line edits, only start_hash is needed. For multi-line edits, provide both start_hash and end_hash. ' +
      'The edit replaces the entire line range (inclusive) with replace_text. ' +
      'The edit must be approved by the user before being applied.',
    inputSchema: ApplyEditSchema,
    execute: async (params) => {
      try {
        const { updated } = await dryRunEdit(params, fileAccess.readFile)
        return await provider.applyEdits({
          id: generateEditId(),
          uri: params.uri,
          description: params.description,
          updated,
        })
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const getDiagnostics = (provider: DiagnosticsProvider) =>
  tool({
    description:
      'Get diagnostics (errors, warnings, hints) for a specific file.',
    inputSchema: GetDiagnosticsSchema,
    execute: async ({ path }) => {
      try {
        const diagnostics = await provider.provideDiagnostics(
          normalizeUri(path),
        )
        return { diagnostics }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const getWorkspaceDiagnostics = (
  getWorkspaceDiagnosticsFn: NonNullable<
    DiagnosticsProvider['getWorkspaceDiagnostics']
  >,
) =>
  tool({
    description:
      'Get all diagnostics (errors, warnings, hints) across the entire workspace.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const diagnostics = await getWorkspaceDiagnosticsFn()
        return { diagnostics }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const getOutline = (provider: OutlineProvider) =>
  tool({
    description:
      'Get the document outline (symbols like classes, functions, variables) for a specific file.',
    inputSchema: GetOutlineSchema,
    execute: async ({ path }) => {
      try {
        const symbols = await provider.provideDocumentSymbols(
          normalizeUri(path),
        )
        return { symbols }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const requestFile = (fileAccess: FileAccessProvider) =>
  tool({
    description:
      'Access filesystem resources. For directories: returns children as an array (git-ignored files excluded). ' +
      'For files: returns content in hashline format where each line is prefixed with ' +
      '"<lineNumber>:<hash>|" (e.g., "1:a3|function hello() {"). ' +
      'The hash is a 2-char hex CRC16 digest of the line content. ' +
      'Use these line:hash references with the apply_edit tool to make edits. ' +
      'Supports optional line range filtering (start_line/end_line) and regex pattern filtering.',
    inputSchema: RequestFileSchema,
    execute: async ({ path, pattern, start_line, end_line }) => {
      const normalizedPath = normalizeUri(path)

      try {
        const content = await fileAccess.readFile(normalizedPath)
        let lines = toNumberedLines(content)

        if (start_line !== undefined) {
          const end = end_line ?? start_line
          lines = lines.filter((l) => l.num >= start_line && l.num <= end)
        }

        if (pattern) {
          const regex = new RegExp(pattern)
          lines = lines.filter((l) => regex.test(l.text))
        }

        return { type: 'file' as const, content: formatAsHashlines(lines) }
      } catch {
        try {
          const entries = await fileAccess.readDirectory(normalizedPath)
          return { type: 'directory' as const, entries }
        } catch (error) {
          return errorResult(error)
        }
      }
    },
  })

export const getOutlinks = (provider: GraphProvider) =>
  tool({
    description: 'Get outgoing links from a specific file.',
    inputSchema: GetOutlinksSchema,
    execute: async ({ path }) => {
      try {
        const links = await provider.resolveOutlinks(normalizeUri(path))
        return { links }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const getBacklinks = (provider: GraphProvider) =>
  tool({
    description: 'Get incoming links (backlinks) to a specific file.',
    inputSchema: GetBacklinksSchema,
    execute: async ({ path }) => {
      try {
        const links = await provider.resolveBacklinks(normalizeUri(path))
        return { links }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const getLinkStructure = (provider: GraphProvider) =>
  tool({
    description:
      'Get all links in the workspace, showing relationships between documents.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const links = await provider.getLinkStructure()
        return { links }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const addLink = (provider: GraphProvider) =>
  tool({
    description:
      'Add a link to a document by finding a text pattern and replacing it with a link to the target.',
    inputSchema: AddLinkSchema,
    execute: async (params) => {
      try {
        await provider.addLink(
          normalizeUri(params.path),
          params.pattern,
          normalizeUri(params.link_to),
        )
        return { success: true as const, message: 'Link added successfully.' }
      } catch (error) {
        return { success: false as const, ...errorResult(error) }
      }
    },
  })

export const getFrontmatter = (provider: FrontmatterProvider) =>
  tool({
    description: 'Get frontmatter metadata for a specific file.',
    inputSchema: GetFrontmatterSchema,
    execute: async ({ path }) => {
      try {
        const frontmatter = await provider.getFrontmatter(normalizeUri(path))
        return { frontmatter }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const getFrontmatterStructure = (provider: FrontmatterProvider) =>
  tool({
    description:
      'Get frontmatter property values across documents. If path is provided, searches only that document. Otherwise, searches all documents.',
    inputSchema: GetFrontmatterStructureSchema,
    execute: async (params) => {
      try {
        const path = params.path ? normalizeUri(params.path) : undefined
        const matches = await provider.getFrontmatterStructure(
          params.property,
          path,
        )
        return { matches }
      } catch (error) {
        return errorResult(error)
      }
    },
  })

export const setFrontmatter = (provider: FrontmatterProvider) =>
  tool({
    description:
      'Set a frontmatter property on a document. Use null to remove the property.',
    inputSchema: SetFrontmatterSchema,
    execute: async (params) => {
      try {
        const value = params.value === null ? undefined : params.value
        await provider.setFrontmatter(
          normalizeUri(params.path),
          params.property,
          value,
        )
        return {
          success: true as const,
          message: 'Frontmatter updated successfully.',
        }
      } catch (error) {
        return { success: false as const, ...errorResult(error) }
      }
    },
  })

export const globalFind = (provider: GlobalFindProvider) =>
  tool({
    description: 'Search for text across the entire workspace.',
    inputSchema: GlobalFindSchema,
    execute: async (params) => {
      try {
        const matches = await provider.globalFind(params.query, {
          caseSensitive: params.case_sensitive ?? false,
          exactMatch: params.exact_match ?? false,
          regexMode: params.regex_mode ?? false,
        })
        return { count: matches.length, matches }
      } catch (error) {
        return errorResult(error)
      }
    },
  })
