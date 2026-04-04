/**
 * MCP Server Implementation for LSP Driver SDK
 *
 * Registration functions for installing individual providers as MCP tools/resources.
 * Each function accepts the specific provider type it needs.
 */

import {
  type McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type {
  DefinitionProvider,
  DiagnosticsProvider,
  FrontmatterProvider,
  GlobalFindMatch,
  GlobalFindProvider,
  GraphProvider,
  HierarchyProvider,
  OutlineProvider,
  ReferencesProvider,
} from '../capabilities.js'
import {
  formatDiagnosticsAsMarkdown,
  formatSymbolsAsMarkdown,
  generateEditId,
  makeToolResult,
  normalizeUri,
} from '../formatting.js'
import {
  computeLineHash,
  formatAsHashlines,
  parseHashlineRef,
  toNumberedLines,
} from '../hashline.js'
import type { EditProvider, FileAccessProvider } from '../interfaces.js'

/**
 * Parses a line range fragment from a URI (e.g., "#L21" or "#L21-L28").
 * @returns null if no valid line range, or { start, end } with 1-based line numbers
 */
function parseLineRange(
  fragment: string | undefined,
): { start: number; end: number } | null {
  if (!fragment) return null

  // Match #Lxx or #Lxx-Lyy
  const match = fragment.match(/^L(\d+)(?:-L(\d+))?$/)
  if (!match || !match[1]) return null

  const start = parseInt(match[1], 10)
  const end = match[2] ? parseInt(match[2], 10) : start

  if (start < 1 || end < start) return null

  return { start, end }
}

/**
 * Parses query parameters from a path string.
 * @returns The clean path and a map of query parameters
 */
function parseQueryParams(path: string): {
  path: string
  params: URLSearchParams
} {
  const qIndex = path.indexOf('?')
  if (qIndex === -1) return { path, params: new URLSearchParams() }
  return {
    path: path.slice(0, qIndex),
    params: new URLSearchParams(path.slice(qIndex + 1)),
  }
}

/**
 * Creates a completion callback for file path auto-complete.
 * Splits the input into directory + prefix, reads the directory,
 * and returns entries matching the prefix.
 */
export function createFileCompleter(
  readDirectory: FileAccessProvider['readDirectory'],
): (value: string) => Promise<string[]> {
  return async (value: string): Promise<string[]> => {
    const lastSlash = value.lastIndexOf('/')
    const dir = lastSlash >= 0 ? value.slice(0, lastSlash) : ''
    const prefix = lastSlash >= 0 ? value.slice(lastSlash + 1) : value

    try {
      const entries = await readDirectory(dir || '.')
      const lowerPrefix = prefix.toLowerCase()
      return entries
        .filter((entry) => entry.toLowerCase().startsWith(lowerPrefix))
        .map((entry) => (dir ? `${dir}/${entry}` : entry))
    } catch {
      return []
    }
  }
}

import {
  type ResolverConfig,
  SymbolResolutionError,
  type SymbolResolver,
} from '../resolver.js'
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
import type {
  EditResult,
  FrontmatterMatch,
  FuzzyPosition,
  Link,
  PendingEditOperation,
} from '../types.js'

export type { ResolverConfig }

type SnippetOutput = {
  snippets: Array<{
    uri: string
    startLine: number
    endLine: number
    content: string
  }>
}

/**
 * Registers the goto_definition tool.
 */
export function registerGotoDefinitionTool(
  server: McpServer,
  provider: DefinitionProvider,
  resolver: SymbolResolver,
  callbacks?: {
    onInput?: (input: z.infer<typeof FuzzyPositionSchema>) => void
    onOutput?: (output: SnippetOutput) => void
  },
): void {
  server.registerTool(
    'goto_definition',
    {
      description: 'Navigate to the definition of a symbol.',
      inputSchema: FuzzyPositionSchema,
      outputSchema: {
        snippets: z.array(
          z.object({
            uri: z.string(),
            startLine: z.number(),
            endLine: z.number(),
            content: z.string(),
          }),
        ),
      },
    },
    async (params) => {
      callbacks?.onInput?.(params)
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }

        const exactPosition = await resolver.resolvePosition(uri, fuzzy)
        const snippets = (
          await provider.provideDefinition(uri, exactPosition)
        ).map((snippet) => ({
          uri: snippet.uri,
          startLine: snippet.range.start.line + 1,
          endLine: snippet.range.end.line + 1,
          content: snippet.content,
        }))

        callbacks?.onOutput?.({ snippets })
        return makeToolResult({ snippets })
      } catch (error) {
        const message =
          error instanceof SymbolResolutionError
            ? error.message
            : `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers the goto_type_definition tool.
 */
export function registerGotoTypeDefinitionTool(
  server: McpServer,
  provider: DefinitionProvider,
  resolver: SymbolResolver,
  callbacks?: {
    onInput?: (input: z.infer<typeof FuzzyPositionSchema>) => void
    onOutput?: (output: SnippetOutput) => void
  },
): void {
  const typeDefinitionProvider = provider.provideTypeDefinition
  if (!typeDefinitionProvider) return

  server.registerTool(
    'goto_type_definition',
    {
      description: 'Navigate to the type definition of a symbol.',
      inputSchema: FuzzyPositionSchema,
      outputSchema: {
        snippets: z.array(
          z.object({
            uri: z.string(),
            startLine: z.number(),
            endLine: z.number(),
            content: z.string(),
          }),
        ),
      },
    },
    async (params) => {
      callbacks?.onInput?.(params)
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }

        const exactPosition = await resolver.resolvePosition(uri, fuzzy)
        const snippets = (await typeDefinitionProvider(uri, exactPosition)).map(
          (snippet) => ({
            uri: snippet.uri,
            startLine: snippet.range.start.line + 1,
            endLine: snippet.range.end.line + 1,
            content: snippet.content,
          }),
        )

        callbacks?.onOutput?.({ snippets })
        return makeToolResult({ snippets })
      } catch (error) {
        const message =
          error instanceof SymbolResolutionError
            ? error.message
            : `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers the find_references tool.
 */
export function registerFindReferencesTool(
  server: McpServer,
  provider: ReferencesProvider,
  resolver: SymbolResolver,
  callbacks?: {
    onInput?: (input: z.infer<typeof FuzzyPositionSchema>) => void
    onOutput?: (output: SnippetOutput) => void
  },
): void {
  server.registerTool(
    'find_references',
    {
      description:
        'Find all references to a symbol. Returns a list of locations where the symbol is used.',
      inputSchema: FuzzyPositionSchema,
      outputSchema: {
        snippets: z.array(
          z.object({
            uri: z.string(),
            startLine: z.number(),
            endLine: z.number(),
            content: z.string(),
          }),
        ),
      },
    },
    async (params) => {
      callbacks?.onInput?.(params)
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }

        const exactPosition = await resolver.resolvePosition(uri, fuzzy)
        const snippets = (
          await provider.provideReferences(uri, exactPosition)
        ).map((snippet) => ({
          uri: snippet.uri,
          startLine: snippet.range.start.line + 1,
          endLine: snippet.range.end.line + 1,
          content: snippet.content,
        }))

        callbacks?.onOutput?.({ snippets })
        return makeToolResult({ snippets })
      } catch (error) {
        const message =
          error instanceof SymbolResolutionError
            ? error.message
            : `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers the call_hierarchy tool.
 */
export function registerCallHierarchyTool(
  server: McpServer,
  provider: HierarchyProvider,
  resolver: SymbolResolver,
  callbacks?: {
    onInput?: (input: z.infer<typeof CallHierarchySchema>) => void
    onOutput?: (output: SnippetOutput) => void
  },
): void {
  server.registerTool(
    'call_hierarchy',
    {
      description:
        'Get call hierarchy for a function or method. Shows incoming or outgoing calls.',
      inputSchema: CallHierarchySchema,
      outputSchema: {
        snippets: z.array(
          z.object({
            uri: z.string(),
            startLine: z.number(),
            endLine: z.number(),
            content: z.string(),
          }),
        ),
      },
    },
    async (params) => {
      callbacks?.onInput?.(params)
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }

        const exactPosition = await resolver.resolvePosition(uri, fuzzy)
        const snippets = (
          await provider.provideCallHierarchy(
            uri,
            exactPosition,
            params.direction,
          )
        ).map((snippet) => ({
          uri: snippet.uri,
          startLine: snippet.range.start.line + 1,
          endLine: snippet.range.end.line + 1,
          content: snippet.content,
        }))

        callbacks?.onOutput?.({ snippets })
        return makeToolResult({ snippets })
      } catch (error) {
        const message =
          error instanceof SymbolResolutionError
            ? error.message
            : `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers the find_file_references tool.
 */
export function registerFindFileReferencesTool(
  server: McpServer,
  provider: ReferencesProvider,
  callbacks?: {
    onInput?: (input: z.infer<typeof FileReferencesSchema>) => void
    onOutput?: (output: SnippetOutput) => void
  },
): void {
  const fileReferencesProvider = provider.provideFileReferences
  if (!fileReferencesProvider) return

  server.registerTool(
    'find_file_references',
    {
      description:
        'Find all references to a file across the workspace. Returns locations that import or link to the given file.',
      inputSchema: FileReferencesSchema,
      outputSchema: {
        snippets: z.array(
          z.object({
            uri: z.string(),
            startLine: z.number(),
            endLine: z.number(),
            content: z.string(),
          }),
        ),
      },
    },
    async (params) => {
      callbacks?.onInput?.(params)
      try {
        const uri = normalizeUri(params.uri)
        const snippets = (await fileReferencesProvider(uri)).map((snippet) => ({
          uri: snippet.uri,
          startLine: snippet.range.start.line + 1,
          endLine: snippet.range.end.line + 1,
          content: snippet.content,
        }))

        callbacks?.onOutput?.({ snippets })
        return makeToolResult({ snippets })
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers diagnostics resources.
 * - diagnostics://{path} - diagnostics for a specific file
 * - diagnostics://workspace - diagnostics for the entire workspace (if getWorkspaceDiagnostics is provided)
 */
export function registerDiagnosticsResources(
  server: McpServer,
  provider: DiagnosticsProvider,
  fileCompleter?: (value: string) => Promise<string[]>,
): void {
  const fileDiagnosticsTemplate = new ResourceTemplate(
    'diagnostics://{+path}',
    {
      list: undefined, // Cannot enumerate all files with diagnostics
      complete: fileCompleter ? { path: fileCompleter } : undefined,
    },
  )

  server.registerResource(
    'diagnostics',
    fileDiagnosticsTemplate,
    {
      description:
        'Diagnostics (errors, warnings, hints) for a specific file. Use the file path after diagnostics://',
      mimeType: 'text/markdown',
    },
    async (_uri, variables) => {
      try {
        const path = variables.path as string
        const normalizedPath = normalizeUri(path)
        const diagnostics = await provider.provideDiagnostics(normalizedPath)
        const markdown = formatDiagnosticsAsMarkdown(diagnostics)

        return {
          contents: [
            {
              uri: `diagnostics://${path}`,
              mimeType: 'text/markdown',
              text: markdown,
            },
          ],
        }
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          contents: [
            {
              uri: `diagnostics://${variables.path}`,
              mimeType: 'text/markdown',
              text: message,
            },
          ],
        }
      }
    },
  )

  // Register workspace diagnostics resource if getWorkspaceDiagnostics is provided
  if (provider.getWorkspaceDiagnostics) {
    const getWorkspaceDiagnostics =
      provider.getWorkspaceDiagnostics.bind(provider)

    server.registerResource(
      'workspace-diagnostics',
      'diagnostics://workspace',
      {
        description:
          'All diagnostics (errors, warnings, hints) across the entire workspace',
        mimeType: 'text/markdown',
      },
      async () => {
        try {
          const diagnostics = await getWorkspaceDiagnostics()

          // Group diagnostics by file
          const groupedByFile = new Map<string, typeof diagnostics>()
          for (const d of diagnostics) {
            const existing = groupedByFile.get(d.uri) ?? []
            existing.push(d)
            groupedByFile.set(d.uri, existing)
          }

          if (groupedByFile.size === 0) {
            return {
              contents: [
                {
                  uri: 'diagnostics://workspace',
                  mimeType: 'text/markdown',
                  text: 'No diagnostics found in workspace.',
                },
              ],
            }
          }

          // Format grouped diagnostics
          const sections: string[] = []
          for (const [uri, fileDiagnostics] of groupedByFile) {
            sections.push(
              `## ${uri}\n${formatDiagnosticsAsMarkdown(fileDiagnostics)}`,
            )
          }

          return {
            contents: [
              {
                uri: 'diagnostics://workspace',
                mimeType: 'text/markdown',
                text: sections.join('\n\n'),
              },
            ],
          }
        } catch (error) {
          const message = `Error: ${error instanceof Error ? error.message : String(error)}`
          return {
            contents: [
              {
                uri: 'diagnostics://workspace',
                mimeType: 'text/markdown',
                text: message,
              },
            ],
          }
        }
      },
    )
  }

  // Set up subscription support if onDiagnosticsChanged is provided
  if (provider.onDiagnosticsChanged) {
    provider.onDiagnosticsChanged((uri) => {
      // Notify MCP clients that the diagnostics resource has been updated
      const normalizedUri = normalizeUri(uri)
      server.server.sendResourceUpdated({
        uri: `diagnostics://${normalizedUri}`,
      })
      // Also notify workspace diagnostics if it exists
      if (provider.getWorkspaceDiagnostics) {
        server.server.sendResourceUpdated({
          uri: 'diagnostics://workspace',
        })
      }
    })
  }
}

/**
 * Registers the outline resource.
 * - outline://{path} - document symbols (outline) for a specific file
 */
export function registerOutlineResource(
  server: McpServer,
  provider: OutlineProvider,
  fileCompleter?: (value: string) => Promise<string[]>,
): void {
  const outlineTemplate = new ResourceTemplate('outline://{+path}', {
    list: undefined,
    complete: fileCompleter ? { path: fileCompleter } : undefined,
  })

  server.registerResource(
    'outline',
    outlineTemplate,
    {
      description:
        'Document outline (symbols like classes, functions, variables) for a specific file. Use the file path after outline://',
      mimeType: 'text/markdown',
    },
    async (_uri, variables) => {
      try {
        const path = variables.path as string
        const normalizedPath = normalizeUri(path)
        const symbols = await provider.provideDocumentSymbols(normalizedPath)
        const markdown = formatSymbolsAsMarkdown(symbols)

        return {
          contents: [
            {
              uri: `outline://${path}`,
              mimeType: 'text/markdown',
              text: markdown,
            },
          ],
        }
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          contents: [
            {
              uri: `outline://${variables.path}`,
              mimeType: 'text/markdown',
              text: message,
            },
          ],
        }
      }
    },
  )
}

/**
 * Registers the apply_edit tool using hashline-based line references.
 */
export function registerApplyEditTool(
  server: McpServer,
  provider: EditProvider,
  readFile: FileAccessProvider['readFile'],
  callbacks?: {
    onInput?: (input: z.infer<typeof ApplyEditSchema>) => void
    onOutput?: (output: EditResult) => void
  },
): void {
  const applyEditsFn = provider.applyEdits.bind(provider)

  server.registerTool(
    'apply_edit',
    {
      description:
        'Apply a text edit to a file. WORKFLOW: First read the file via the files:// resource to get ' +
        'hashline-formatted content (e.g., "3:a1|  return x"). Then reference lines by their "line:hash" ' +
        'to specify the edit range. The hash verifies the file has not changed since your read — if it has, ' +
        'the edit is rejected and you must re-read the file. ' +
        'For single-line edits, only start_hash is needed. For multi-line edits, provide both start_hash and end_hash. ' +
        'The edit replaces the entire line range (inclusive) with replace_text. ' +
        'The edit must be approved by the user before being applied.',
      inputSchema: {
        uri: ApplyEditSchema.shape.uri,
        start_hash: ApplyEditSchema.shape.start_hash,
        end_hash: ApplyEditSchema.shape.end_hash,
        replace_text: ApplyEditSchema.shape.replace_text,
        description: ApplyEditSchema.shape.description,
      },
    },
    async (params) => {
      callbacks?.onInput?.(params)
      try {
        const uri = normalizeUri(params.uri)

        // Parse hashline references
        const startRef = parseHashlineRef(params.start_hash)
        const endRef = params.end_hash
          ? parseHashlineRef(params.end_hash)
          : startRef

        // Read file and verify hashes
        const content = await readFile(uri)
        const allLines = content.split(/\r?\n/)

        // Validate line numbers are in range (1-based)
        if (startRef.line < 1 || startRef.line > allLines.length) {
          throw new Error(
            `Start line ${startRef.line} is out of range (file has ${allLines.length} lines)`,
          )
        }
        if (endRef.line < startRef.line || endRef.line > allLines.length) {
          throw new Error(
            `End line ${endRef.line} is out of range (file has ${allLines.length} lines)`,
          )
        }

        // Verify hashes match current content
        const startLineText = allLines[startRef.line - 1] as string
        const startActualHash = computeLineHash(startLineText)
        if (startActualHash !== startRef.hash) {
          throw new Error(
            `Hash mismatch at line ${startRef.line}: expected "${startRef.hash}", got "${startActualHash}". File has changed since last read.`,
          )
        }

        const endLineText = allLines[endRef.line - 1] as string
        const endActualHash = computeLineHash(endLineText)
        if (endActualHash !== endRef.hash) {
          throw new Error(
            `Hash mismatch at line ${endRef.line}: expected "${endRef.hash}", got "${endActualHash}". File has changed since last read.`,
          )
        }

        // Compute updated file content by applying the edit
        const linesBefore = allLines.slice(0, startRef.line - 1)
        const linesAfter = allLines.slice(endRef.line)
        const updated = [
          ...linesBefore,
          params.replace_text,
          ...linesAfter,
        ].join('\n')

        // Create pending edit operation
        const operation: PendingEditOperation = {
          id: generateEditId(),
          uri,
          updated,
          description: params.description,
        }

        // Apply the edit
        const result: EditResult = await applyEditsFn(operation)

        callbacks?.onOutput?.(result)
        return makeToolResult(result)
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: {
            success: false,
            message,
          },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers the filesystem resource.
 * - files://path - file tree for a directory (git-ignored files excluded)
 * - files://path/to/file.ext - read file content
 * - files://path/to/file.ext#L21 - read specific line
 * - files://path/to/file.ext#L21-L28 - read line range
 */
export function registerFilesystemResource(
  server: McpServer,
  provider: FileAccessProvider,
): void {
  const { readFile, readDirectory } = provider

  const filesystemTemplate = new ResourceTemplate('files://{+path}', {
    list: undefined, // Cannot enumerate all directories
    complete: {
      path: createFileCompleter(readDirectory),
    },
  })

  server.registerResource(
    'filesystem',
    filesystemTemplate,
    {
      description:
        'Access filesystem resources. For directories: returns children as JSON (git-ignored files excluded). ' +
        'For files: returns content in hashline format where each line is prefixed with ' +
        '"<lineNumber>:<hash>|" (e.g., "1:a3|function hello() {"). ' +
        'The hash is a 2-char hex CRC16 digest of the line content. ' +
        'Use these line:hash references with the apply_edit tool to make edits. ' +
        'Supports line ranges with #L23 or #L23-L30 fragment. ' +
        'Supports regex filtering with ?pattern=<regex> query parameter (matches raw line text, not the hash prefix). ' +
        'Line numbers in the output are always the original file line numbers, even when filtering.',
    },
    async (uri, variables) => {
      const uriString = uri.toString()

      try {
        const pathWithFragment = variables.path as string

        // Parse fragment for line range (e.g., #L23 or #L23-L30)
        // and query params (e.g., ?pattern=regex)
        // Supports both ?pattern=x#L1-L2 and #L1-L2?pattern=x orderings
        let fragment: string | undefined
        let path = pathWithFragment
        const hashIndex = pathWithFragment.indexOf('#')
        if (hashIndex !== -1) {
          fragment = pathWithFragment.slice(hashIndex + 1)
          path = pathWithFragment.slice(0, hashIndex)
        }

        // Query params may appear in the path portion or the fragment portion
        const { path: pathNoQuery, params: pathParams } = parseQueryParams(path)
        const { path: fragmentNoQuery, params: fragmentParams } =
          parseQueryParams(fragment ?? '')

        fragment = fragment ? fragmentNoQuery : undefined
        const params = new URLSearchParams([
          ...pathParams.entries(),
          ...fragmentParams.entries(),
        ])

        const normalizedPath = normalizeUri(pathNoQuery)
        const lineRange = parseLineRange(fragment)
        const pattern = params.get('pattern')

        // Try reading as a file first
        try {
          const content = await readFile(normalizedPath)

          // Build numbered-line pipeline
          let lines = toNumberedLines(content)

          // If we have a line range, filter to those lines
          if (lineRange) {
            lines = lines.filter(
              (l) =>
                l.num >= (lineRange as { start: number; end: number }).start &&
                l.num <= (lineRange as { start: number; end: number }).end,
            )
          }

          // If we have a pattern, filter matching lines (on raw text)
          if (pattern) {
            const regex = new RegExp(pattern)
            lines = lines.filter((l) => regex.test(l.text))
          }

          return {
            contents: [
              {
                uri: uriString,
                mimeType: 'text/plain',
                text: formatAsHashlines(lines),
              },
            ],
          }
        } catch {
          // File reading failed, try as directory
          const files = await readDirectory(normalizedPath)

          return {
            contents: [
              {
                uri: uriString,
                mimeType: 'application/json',
                text: JSON.stringify(files),
              },
            ],
          }
        }
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          contents: [
            {
              uri: uriString,
              mimeType: 'text/plain',
              text: message,
            },
          ],
        }
      }
    },
  )

  // Set up subscription support if onFileChanged is provided
  if (provider.onFileChanged) {
    provider.onFileChanged((uri) => {
      const normalizedUri = normalizeUri(uri)
      server.server.sendResourceUpdated({
        uri: `files://${normalizedUri}`,
      })
    })
  }
}

/**
 * Registers the global_find tool.
 */
export function registerGlobalFindTool(
  server: McpServer,
  provider: GlobalFindProvider,
  callbacks?: {
    onInput?: (input: z.infer<typeof GlobalFindSchema>) => void
    onOutput?: (output: { matches: GlobalFindMatch[]; count: number }) => void
  },
): void {
  server.registerTool(
    'global_find',
    {
      description: 'Search for text across the entire workspace.',
      inputSchema: GlobalFindSchema,
      outputSchema: {
        matches: z.array(
          z.object({
            uri: z.string(),
            line: z.number(),
            column: z.number(),
            matchText: z.string(),
            context: z.string(),
          }),
        ),
        count: z.number(),
      },
    },
    async (params) => {
      callbacks?.onInput?.(params)
      try {
        const caseSensitive = params.case_sensitive ?? false
        const exactMatch = params.exact_match ?? false
        const regexMode = params.regex_mode ?? false

        const matches = await provider.globalFind(params.query, {
          caseSensitive,
          exactMatch,
          regexMode,
        })

        callbacks?.onOutput?.({ count: matches.length, matches })
        return makeToolResult({ count: matches.length, matches })
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers graph-related resources.
 * - outlinks://{path} - outgoing links from a specific file
 * - backlinks://{path} - incoming links (backlinks) to a specific file
 */
export function registerGraphResources(
  server: McpServer,
  provider: GraphProvider,
  fileCompleter?: (value: string) => Promise<string[]>,
): void {
  const outlinksTemplate = new ResourceTemplate('outlinks://{+path}', {
    list: undefined, // Cannot enumerate all files
    complete: fileCompleter ? { path: fileCompleter } : undefined,
  })

  server.registerResource(
    'outlinks',
    outlinksTemplate,
    {
      description:
        'Outgoing links from a specific file. Use the file path after outlinks://',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      try {
        const path = variables.path as string
        const normalizedPath = normalizeUri(path)
        const links = await provider.resolveOutlinks(normalizedPath)

        return {
          contents: [
            {
              uri: `outlinks://${path}`,
              mimeType: 'application/json',
              text: JSON.stringify(links, null, 2),
            },
          ],
        }
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          contents: [
            {
              uri: `outlinks://${variables.path}`,
              mimeType: 'application/json',
              text: JSON.stringify({ error: message }),
            },
          ],
        }
      }
    },
  )

  const backlinksTemplate = new ResourceTemplate('backlinks://{+path}', {
    list: undefined, // Cannot enumerate all files
    complete: fileCompleter ? { path: fileCompleter } : undefined,
  })

  server.registerResource(
    'backlinks',
    backlinksTemplate,
    {
      description:
        'Incoming links (backlinks) to a specific file. Use the file path after backlinks://',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      try {
        const path = variables.path as string
        const normalizedPath = normalizeUri(path)
        const links = await provider.resolveBacklinks(normalizedPath)

        return {
          contents: [
            {
              uri: `backlinks://${path}`,
              mimeType: 'application/json',
              text: JSON.stringify(links, null, 2),
            },
          ],
        }
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          contents: [
            {
              uri: `backlinks://${variables.path}`,
              mimeType: 'application/json',
              text: JSON.stringify({ error: message }),
            },
          ],
        }
      }
    },
  )
}

/**
 * Registers the get_link_structure tool.
 */
export function registerGetLinkStructureTool(
  server: McpServer,
  provider: GraphProvider,
  callbacks?: {
    onOutput?: (output: { links: Link[] }) => void
  },
): void {
  server.registerTool(
    'get_link_structure',
    {
      description:
        'Get all links in the workspace, showing relationships between documents.',
      inputSchema: {},
      outputSchema: {
        links: z.array(
          z.object({
            sourceUri: z.string(),
            targetUri: z.string(),
            subpath: z.string().optional(),
            displayText: z.string().optional(),
            resolved: z.boolean(),
            line: z.number(),
            column: z.number(),
          }),
        ),
      },
    },
    async () => {
      try {
        const links = await provider.getLinkStructure()
        callbacks?.onOutput?.({ links })
        return makeToolResult({ links })
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers the add_link tool.
 */
export function registerAddLinkTool(
  server: McpServer,
  provider: GraphProvider,
  callbacks?: {
    onInput?: (input: z.infer<typeof AddLinkSchema>) => void
    onOutput?: (output: { success: boolean; message: string }) => void
  },
): void {
  server.registerTool(
    'add_link',
    {
      description:
        'Add a link to a document by finding a text pattern and replacing it with a link to the target.',
      inputSchema: AddLinkSchema,
      outputSchema: {
        success: z.boolean(),
        message: z.string().optional(),
      },
    },
    async (params) => {
      callbacks?.onInput?.(params)
      try {
        const path = normalizeUri(params.path)
        const linkTo = normalizeUri(params.link_to)
        await provider.addLink(path, params.pattern, linkTo)

        const addLinkResult = {
          success: true as const,
          message: 'Link added successfully.',
        }
        callbacks?.onOutput?.(addLinkResult)
        return makeToolResult(addLinkResult)
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: {
            success: false,
            message,
          },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers the get_frontmatter_structure tool.
 */
export function registerGetFrontmatterStructureTool(
  server: McpServer,
  provider: FrontmatterProvider,
  callbacks?: {
    onInput?: (input: z.infer<typeof GetFrontmatterStructureSchema>) => void
    onOutput?: (output: { matches: FrontmatterMatch[] }) => void
  },
): void {
  server.registerTool(
    'get_frontmatter_structure',
    {
      description:
        'Get frontmatter property values across documents. If path is provided, searches only that document. Otherwise, searches all documents.',
      inputSchema: GetFrontmatterStructureSchema,
      outputSchema: {
        matches: z.array(
          z.object({
            path: z.string(),
            value: z.unknown(),
          }),
        ),
      },
    },
    async (params) => {
      callbacks?.onInput?.(params)
      try {
        const path = params.path ? normalizeUri(params.path) : undefined
        const matches = await provider.getFrontmatterStructure(
          params.property,
          path,
        )

        callbacks?.onOutput?.({ matches })
        return makeToolResult({ matches })
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: { error: message },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers the set_frontmatter tool.
 */
export function registerSetFrontmatterTool(
  server: McpServer,
  provider: FrontmatterProvider,
  callbacks?: {
    onInput?: (input: z.infer<typeof SetFrontmatterSchema>) => void
    onOutput?: (output: { success: boolean; message: string }) => void
  },
): void {
  server.registerTool(
    'set_frontmatter',
    {
      description:
        'Set a frontmatter property on a document. Use null to remove the property.',
      inputSchema: SetFrontmatterSchema,
      outputSchema: {
        success: z.boolean(),
        message: z.string().optional(),
      },
    },
    async (params) => {
      callbacks?.onInput?.(params)
      try {
        const path = normalizeUri(params.path)
        // Convert null to undefined for the provider
        const value = params.value === null ? undefined : params.value
        await provider.setFrontmatter(path, params.property, value)

        const setFrontmatterResult = {
          success: true as const,
          message: 'Frontmatter updated successfully.',
        }
        callbacks?.onOutput?.(setFrontmatterResult)
        return makeToolResult(setFrontmatterResult)
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: {
            success: false,
            message,
          },
          isError: true,
        }
      }
    },
  )
}

/**
 * Registers the frontmatter resource.
 * - frontmatter://{path} - frontmatter for a specific file
 */
export function registerFrontmatterResource(
  server: McpServer,
  provider: FrontmatterProvider,
  fileCompleter?: (value: string) => Promise<string[]>,
): void {
  const frontmatterTemplate = new ResourceTemplate('frontmatter://{+path}', {
    list: undefined, // Cannot enumerate all files
    complete: fileCompleter ? { path: fileCompleter } : undefined,
  })

  server.registerResource(
    'frontmatter',
    frontmatterTemplate,
    {
      description:
        'Frontmatter metadata for a specific file. Use the file path after frontmatter://',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      try {
        const path = variables.path as string
        const normalizedPath = normalizeUri(path)
        const frontmatter = await provider.getFrontmatter(normalizedPath)

        return {
          contents: [
            {
              uri: `frontmatter://${path}`,
              mimeType: 'application/json',
              text: JSON.stringify(frontmatter, null, 2),
            },
          ],
        }
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          contents: [
            {
              uri: `frontmatter://${variables.path}`,
              mimeType: 'application/json',
              text: JSON.stringify({ error: message }),
            },
          ],
        }
      }
    },
  )
}
