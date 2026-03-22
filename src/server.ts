/**
 * MCP Server Implementation for LSP Driver SDK
 *
 * The SDK automatically registers tools based on which capability providers
 * are defined in the IdeCapabilities configuration.
 */

import {
  type McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { IdeCapabilities } from './capabilities.js'
import {
  formatDiagnosticsAsMarkdown,
  formatSymbolsAsMarkdown,
  generateEditId,
  makeToolResult,
  normalizeUri,
} from './formatting.js'

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
 * Extracts lines from content based on a line range.
 * @param content - The full file content
 * @param range - 1-based line range { start, end }
 * @returns The extracted lines as a string
 */
function extractLines(
  content: string,
  range: { start: number; end: number },
): string {
  const lines = content.split(/\r?\n/)
  // Convert to 0-based index
  const startIdx = range.start - 1
  const endIdx = range.end
  return lines.slice(startIdx, endIdx).join('\n')
}

import {
  type ResolverConfig,
  SymbolResolutionError,
  SymbolResolver,
} from './resolver.js'
import {
  AddLinkSchema,
  ApplyEditSchema,
  CallHierarchySchema,
  FuzzyPositionSchema,
  GetFrontmatterStructureSchema,
  GlobalFindSchema,
  GlobalReplaceSchema,
  SetFrontmatterSchema,
} from './schemas.js'
import type {
  EditResult,
  FuzzyPosition,
  PendingEditOperation,
} from './types.js'

// ============================================================================
// McpLspDriver Class
// ============================================================================

/**
 * Configuration options for the MCP LSP Driver.
 */
export interface McpLspDriverConfig {
  /** Configuration for the symbol resolver */
  resolverConfig?: ResolverConfig
}

/**
 * Register LSP-based tools and resources on the provided MCP server.
 */
export function installMcpLspDriver({
  server,
  capabilities,
  config,
}: {
  server: McpServer
  capabilities: IdeCapabilities
  config?: McpLspDriverConfig
}) {
  const resolver = new SymbolResolver(
    capabilities.fileAccess,
    config?.resolverConfig,
  )

  try {
    registerTools(server, capabilities, resolver)
  } catch (error) {
    return {
      success: false,
      error,
      reason: 'Error occured during registration of tools',
    }
  }

  try {
    registerResources(server, capabilities)
  } catch (error) {
    return {
      success: false,
      error,
      reason: 'Error occured during registration of resources',
    }
  }

  return {
    success: true,
  }
}

function registerTools(
  server: McpServer,
  capabilities: IdeCapabilities,
  resolver: SymbolResolver,
): void {
  if (capabilities.definition) {
    registerGotoDefinitionTool(server, capabilities, resolver)
  }

  if (capabilities.definition?.provideTypeDefinition) {
    registerGotoTypeDefinitionTool(server, capabilities, resolver)
  }

  if (capabilities.references) {
    registerFindReferencesTool(server, capabilities, resolver)
  }

  if (capabilities.hierarchy) {
    registerCallHierarchyTool(server, capabilities, resolver)
  }

  if (capabilities.edit) {
    registerApplyEditTool(server, capabilities, resolver)
  }

  if (capabilities.globalFind) {
    registerGlobalFindTool(server, capabilities)
    registerGlobalReplaceTool(server, capabilities)
  }

  if (capabilities.graph) {
    registerGetLinkStructureTool(server, capabilities)
    registerAddLinkTool(server, capabilities)
  }

  if (capabilities.frontmatter) {
    registerGetFrontmatterStructureTool(server, capabilities)
    registerSetFrontmatterTool(server, capabilities)
  }
}

function registerResources(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  registerFilesystemResource(server, capabilities)

  if (capabilities.diagnostics) {
    registerDiagnosticsResources(server, capabilities)
  }

  if (capabilities.outline) {
    registerOutlineResource(server, capabilities)
  }

  if (capabilities.graph) {
    registerGraphResources(server, capabilities)
  }

  if (capabilities.frontmatter) {
    registerFrontmatterResource(server, capabilities)
  }
}

/**
 * Registers the goto_definition tool.
 */
function registerGotoDefinitionTool(
  server: McpServer,
  capabilities: IdeCapabilities,
  resolver: SymbolResolver,
): void {
  const definitionProvider = capabilities.definition
  if (!definitionProvider) return

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
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }

        const exactPosition = await resolver.resolvePosition(uri, fuzzy)
        const snippets = (
          await definitionProvider.provideDefinition(uri, exactPosition)
        ).map((snippet) => ({
          uri: snippet.uri,
          startLine: snippet.range.start.line + 1,
          endLine: snippet.range.end.line + 1,
          content: snippet.content,
        }))

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
function registerGotoTypeDefinitionTool(
  server: McpServer,
  capabilities: IdeCapabilities,
  resolver: SymbolResolver,
): void {
  const typeDefinitionProvider = capabilities.definition?.provideTypeDefinition
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
function registerFindReferencesTool(
  server: McpServer,
  capabilities: IdeCapabilities,
  resolver: SymbolResolver,
): void {
  const referencesProvider = capabilities.references
  if (!referencesProvider) return

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
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }

        const exactPosition = await resolver.resolvePosition(uri, fuzzy)
        const snippets = (
          await referencesProvider.provideReferences(uri, exactPosition)
        ).map((snippet) => ({
          uri: snippet.uri,
          startLine: snippet.range.start.line + 1,
          endLine: snippet.range.end.line + 1,
          content: snippet.content,
        }))

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
function registerCallHierarchyTool(
  server: McpServer,
  capabilities: IdeCapabilities,
  resolver: SymbolResolver,
): void {
  const hierarchyProvider = capabilities.hierarchy
  if (!hierarchyProvider) return

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
      try {
        const uri = normalizeUri(params.uri)
        const fuzzy: FuzzyPosition = {
          symbolName: params.symbol_name,
          lineHint: params.line_hint,
          orderHint: params.order_hint,
        }

        const exactPosition = await resolver.resolvePosition(uri, fuzzy)
        const snippets = (
          await hierarchyProvider.provideCallHierarchy(
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
 * Registers diagnostics resources.
 * - diagnostics://{path} - diagnostics for a specific file
 * - diagnostics://workspace - diagnostics for the entire workspace (if getWorkspaceDiagnostics is provided)
 */
function registerDiagnosticsResources(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const diagnosticsProvider = capabilities.diagnostics
  if (!diagnosticsProvider) return

  // Register file diagnostics resource template
  const fileDiagnosticsTemplate = new ResourceTemplate(
    'diagnostics://{+path}',
    {
      list: undefined, // Cannot enumerate all files with diagnostics
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
        const diagnostics =
          await diagnosticsProvider.provideDiagnostics(normalizedPath)
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
  if (diagnosticsProvider.getWorkspaceDiagnostics) {
    const getWorkspaceDiagnostics =
      diagnosticsProvider.getWorkspaceDiagnostics.bind(diagnosticsProvider)

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
  if (capabilities.onDiagnosticsChanged) {
    capabilities.onDiagnosticsChanged((uri) => {
      // Notify MCP clients that the diagnostics resource has been updated
      const normalizedUri = normalizeUri(uri)
      server.server.sendResourceUpdated({
        uri: `diagnostics://${normalizedUri}`,
      })
      // Also notify workspace diagnostics if it exists
      if (diagnosticsProvider.getWorkspaceDiagnostics) {
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
function registerOutlineResource(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const outlineProvider = capabilities.outline
  if (!outlineProvider) return

  const outlineTemplate = new ResourceTemplate('outline://{+path}', {
    list: undefined, // Cannot enumerate all files
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
        const symbols =
          await outlineProvider.provideDocumentSymbols(normalizedPath)
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
 * Registers the apply_edit tool.
 */
function registerApplyEditTool(
  server: McpServer,
  capabilities: IdeCapabilities,
  resolver: SymbolResolver,
): void {
  const editProvider = capabilities.edit
  if (!editProvider) return

  // Get the appropriate edit function (prefer previewAndApplyEdits over applyEdits)
  const applyEditsFn =
    editProvider.previewAndApplyEdits?.bind(editProvider) ??
    editProvider.applyEdits?.bind(editProvider)
  if (!applyEditsFn) return

  server.registerTool(
    'apply_edit',
    {
      description:
        'Apply a text edit to a file. The edit must be approved by the user before being applied.',
      inputSchema: {
        uri: ApplyEditSchema.shape.uri,
        search_text: ApplyEditSchema.shape.search_text,
        replace_text: ApplyEditSchema.shape.replace_text,
        description: ApplyEditSchema.shape.description,
      },
      outputSchema: {
        success: z.boolean(),
        message: z.string(),
      },
    },
    async (params) => {
      try {
        const uri = normalizeUri(params.uri)

        // Validate that the search text exists and is unique
        const range = await resolver.findExactText(uri, params.search_text)

        // Create pending edit operation
        const operation: PendingEditOperation = {
          id: generateEditId(),
          uri,
          edits: [
            {
              range,
              newText: params.replace_text,
            },
          ],
          description: params.description,
        }

        // Apply the edit
        const approved = await applyEditsFn(operation)

        const result: EditResult = approved
          ? { success: true, message: 'Edit successfully applied and saved.' }
          : {
              success: false,
              message: 'Edit rejected by user.',
            }

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
function registerFilesystemResource(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const { readFile, readDirectory } = capabilities.fileAccess

  const filesystemTemplate = new ResourceTemplate('files://{+path}', {
    list: undefined, // Cannot enumerate all directories
  })

  server.registerResource(
    'filesystem',
    filesystemTemplate,
    {
      description:
        'Access filesystem resources. For directories: returns children (git-ignored files excluded). ' +
        'For files: returns file content. Supports line ranges with #L23 or #L23-L30 fragment.',
    },
    async (uri, variables) => {
      const uriString = uri.toString()

      try {
        const pathWithFragment = variables.path as string

        // Parse fragment for line range (e.g., #L23 or #L23-L30)
        let fragment: string | undefined
        let path = pathWithFragment
        const hashIndex = pathWithFragment.indexOf('#')
        if (hashIndex !== -1) {
          fragment = pathWithFragment.slice(hashIndex + 1)
          path = pathWithFragment.slice(0, hashIndex)
        }

        const normalizedPath = normalizeUri(path)
        const lineRange = parseLineRange(fragment)

        // Try reading as a file first
        try {
          const content = await readFile(normalizedPath)

          // If we have a line range, extract those lines
          const resultContent = lineRange
            ? extractLines(content, lineRange)
            : content

          return {
            contents: [
              {
                uri: uriString,
                mimeType: 'text/plain',
                text: resultContent,
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
}

/**
 * Registers the global_find tool.
 */
function registerGlobalFindTool(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const globalFindProvider = capabilities.globalFind
  if (!globalFindProvider) return

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
      try {
        const caseSensitive = params.case_sensitive ?? false
        const exactMatch = params.exact_match ?? false
        const regexMode = params.regex_mode ?? false

        const matches = await globalFindProvider.globalFind(params.query, {
          caseSensitive,
          exactMatch,
          regexMode,
        })

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
 * Registers the global_replace tool.
 */
function registerGlobalReplaceTool(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const globalFindProvider = capabilities.globalFind
  if (!globalFindProvider) return

  server.registerTool(
    'global_replace',
    {
      description:
        'Replace all occurrences of text across the entire workspace.',
      inputSchema: GlobalReplaceSchema,
      outputSchema: {
        success: z.boolean(),
        count: z.number(),
        message: z.string().optional(),
      },
    },
    async (params) => {
      try {
        const caseSensitive = params.case_sensitive ?? false
        const exactMatch = params.exact_match ?? false
        const regexMode = params.regex_mode ?? false

        const count = await globalFindProvider.globalReplace(
          params.query,
          params.replace_with,
          { caseSensitive, exactMatch, regexMode },
        )

        return makeToolResult({ success: true, count })
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`
        return {
          content: [{ type: 'text' as const, text: message }],
          structuredContent: {
            success: false,
            replacementCount: 0,
            message,
          },
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
function registerGraphResources(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const graphProvider = capabilities.graph
  if (!graphProvider) return

  // Register outlinks resource template
  const outlinksTemplate = new ResourceTemplate('outlinks://{+path}', {
    list: undefined, // Cannot enumerate all files
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
        const links = await graphProvider.resolveOutlinks(normalizedPath)

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

  // Register backlinks resource template
  const backlinksTemplate = new ResourceTemplate('backlinks://{+path}', {
    list: undefined, // Cannot enumerate all files
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
        const links = await graphProvider.resolveBacklinks(normalizedPath)

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
function registerGetLinkStructureTool(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const graphProvider = capabilities.graph
  if (!graphProvider) return

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
        const links = await graphProvider.getLinkStructure()
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
function registerAddLinkTool(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const graphProvider = capabilities.graph
  if (!graphProvider) return

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
      try {
        const path = normalizeUri(params.path)
        const linkTo = normalizeUri(params.link_to)
        await graphProvider.addLink(path, params.pattern, linkTo)

        return makeToolResult({
          success: true,
          message: 'Link added successfully.',
        })
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
function registerGetFrontmatterStructureTool(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const frontmatterProvider = capabilities.frontmatter
  if (!frontmatterProvider) return

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
      try {
        const path = params.path ? normalizeUri(params.path) : undefined
        const matches = await frontmatterProvider.getFrontmatterStructure(
          params.property,
          path,
        )

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
function registerSetFrontmatterTool(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const frontmatterProvider = capabilities.frontmatter
  if (!frontmatterProvider) return

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
      try {
        const path = normalizeUri(params.path)
        // Convert null to undefined for the provider
        const value = params.value === null ? undefined : params.value
        await frontmatterProvider.setFrontmatter(path, params.property, value)

        return makeToolResult({
          success: true,
          message: 'Frontmatter updated successfully.',
        })
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
function registerFrontmatterResource(
  server: McpServer,
  capabilities: IdeCapabilities,
): void {
  const frontmatterProvider = capabilities.frontmatter
  if (!frontmatterProvider) return

  const frontmatterTemplate = new ResourceTemplate('frontmatter://{+path}', {
    list: undefined, // Cannot enumerate all files
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
        const frontmatter =
          await frontmatterProvider.getFrontmatter(normalizedPath)

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
