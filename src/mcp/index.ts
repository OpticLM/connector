/**
 * MCP entry point for installing individual providers onto an MCP server.
 *
 * @packageDocumentation
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { z } from 'zod'
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
import type { EditProvider, FileAccessProvider } from '../interfaces.js'
import type { ResolverConfig } from '../resolver.js'
import { SymbolResolver } from '../resolver.js'
import type {
  AddLinkSchema,
  ApplyEditSchema,
  CallHierarchySchema,
  FuzzyPositionSchema,
  GetFrontmatterStructureSchema,
  GlobalFindSchema,
  SetFrontmatterSchema,
} from '../schemas.js'
import {
  createFileCompleter,
  registerAddLinkTool,
  registerApplyEditTool,
  registerCallHierarchyTool,
  registerDiagnosticsResources,
  registerFilesystemResource,
  registerFindReferencesTool,
  registerFrontmatterResource,
  registerGetFrontmatterStructureTool,
  registerGetLinkStructureTool,
  registerGlobalFindTool,
  registerGotoDefinitionTool,
  registerGotoTypeDefinitionTool,
  registerGraphResources,
  registerOutlineResource,
  registerSetFrontmatterTool,
} from '../server.js'
import type { EditResult, FrontmatterMatch, Link } from '../types.js'

/**
 * Union of all provider types that can be installed on an MCP server.
 */
export type AnyProvider =
  | FileAccessProvider
  | EditProvider
  | DefinitionProvider
  | ReferencesProvider
  | HierarchyProvider
  | DiagnosticsProvider
  | OutlineProvider
  | GlobalFindProvider
  | GraphProvider
  | FrontmatterProvider

/**
 * Options for installing a provider that needs file access or symbol resolution.
 */
export interface InstallOptions {
  /** Required by providers that need symbol resolution (definition, references, hierarchy) or file reading (edit) */
  fileAccess?: FileAccessProvider
  /** Configuration for the symbol resolver */
  resolverConfig?: ResolverConfig
}

// Shared output type for tools that return code snippets.
type SnippetItem = {
  uri: string
  startLine: number
  endLine: number
  content: string
}
type SnippetsOutput = { snippets: SnippetItem[] }

/** Options for installing an {@link EditProvider}. */
export interface EditInstallOptions extends InstallOptions {
  /** Called with the raw tool input before the edit is applied. */
  onEditInput?: (input: z.infer<typeof ApplyEditSchema>) => void
  /** Called with the result after a successful edit (approved or rejected by user). */
  onEditOutput?: (output: EditResult) => void
}

/** Options for installing a {@link DefinitionProvider}. */
export interface DefinitionInstallOptions extends InstallOptions {
  /** Called with the raw tool input for `goto_definition`. */
  onDefinitionInput?: (input: z.infer<typeof FuzzyPositionSchema>) => void
  /** Called with the result of `goto_definition`. */
  onDefinitionOutput?: (output: SnippetsOutput) => void
  /** Called with the raw tool input for `goto_type_definition`. */
  onTypeDefinitionInput?: (input: z.infer<typeof FuzzyPositionSchema>) => void
  /** Called with the result of `goto_type_definition`. */
  onTypeDefinitionOutput?: (output: SnippetsOutput) => void
}

/** Options for installing a {@link ReferencesProvider}. */
export interface ReferencesInstallOptions extends InstallOptions {
  /** Called with the raw tool input for `find_references`. */
  onReferencesInput?: (input: z.infer<typeof FuzzyPositionSchema>) => void
  /** Called with the result of `find_references`. */
  onReferencesOutput?: (output: SnippetsOutput) => void
}

/** Options for installing a {@link HierarchyProvider}. */
export interface HierarchyInstallOptions extends InstallOptions {
  /** Called with the raw tool input for `call_hierarchy`. */
  onCallHierarchyInput?: (input: z.infer<typeof CallHierarchySchema>) => void
  /** Called with the result of `call_hierarchy`. */
  onCallHierarchyOutput?: (output: SnippetsOutput) => void
}

/** Options for installing a {@link GlobalFindProvider}. */
export interface GlobalFindInstallOptions extends InstallOptions {
  /** Called with the raw tool input for `global_find`. */
  onGlobalFindInput?: (input: z.infer<typeof GlobalFindSchema>) => void
  /** Called with the result of `global_find`. */
  onGlobalFindOutput?: (output: {
    matches: GlobalFindMatch[]
    count: number
  }) => void
}

/** Options for installing a {@link GraphProvider}. */
export interface GraphInstallOptions extends InstallOptions {
  /** Called with the result of `get_link_structure`. */
  onLinkStructureOutput?: (output: { links: Link[] }) => void
  /** Called with the raw tool input for `add_link`. */
  onAddLinkInput?: (input: z.infer<typeof AddLinkSchema>) => void
  /** Called with the result of `add_link`. */
  onAddLinkOutput?: (output: { success: boolean; message: string }) => void
}

/** Options for installing a {@link FrontmatterProvider}. */
export interface FrontmatterInstallOptions extends InstallOptions {
  /** Called with the raw tool input for `get_frontmatter_structure`. */
  onFrontmatterStructureInput?: (
    input: z.infer<typeof GetFrontmatterStructureSchema>,
  ) => void
  /** Called with the result of `get_frontmatter_structure`. */
  onFrontmatterStructureOutput?: (output: {
    matches: FrontmatterMatch[]
  }) => void
  /** Called with the raw tool input for `set_frontmatter`. */
  onSetFrontmatterInput?: (input: z.infer<typeof SetFrontmatterSchema>) => void
  /** Called with the result of `set_frontmatter`. */
  onSetFrontmatterOutput?: (output: {
    success: boolean
    message: string
  }) => void
}

/**
 * Install a provider's tools and resources onto an MCP server.
 *
 * The provider type is detected via duck-typing (checking for characteristic methods).
 * Some providers require `fileAccess` in options:
 * - `DefinitionProvider`, `ReferencesProvider`, `HierarchyProvider` need it for symbol resolution
 * - `EditProvider` needs it for file hash verification
 * - `DiagnosticsProvider`, `OutlineProvider`, `GraphProvider`, `FrontmatterProvider` use it optionally for auto-complete
 */
export function install(
  server: McpServer,
  provider: FileAccessProvider,
  options?: InstallOptions,
): void
export function install(
  server: McpServer,
  provider: EditProvider,
  options?: EditInstallOptions,
): void
export function install(
  server: McpServer,
  provider: DefinitionProvider,
  options?: DefinitionInstallOptions,
): void
export function install(
  server: McpServer,
  provider: ReferencesProvider,
  options?: ReferencesInstallOptions,
): void
export function install(
  server: McpServer,
  provider: HierarchyProvider,
  options?: HierarchyInstallOptions,
): void
export function install(
  server: McpServer,
  provider: DiagnosticsProvider,
  options?: InstallOptions,
): void
export function install(
  server: McpServer,
  provider: OutlineProvider,
  options?: InstallOptions,
): void
export function install(
  server: McpServer,
  provider: GlobalFindProvider,
  options?: GlobalFindInstallOptions,
): void
export function install(
  server: McpServer,
  provider: GraphProvider,
  options?: GraphInstallOptions,
): void
export function install(
  server: McpServer,
  provider: FrontmatterProvider,
  options?: FrontmatterInstallOptions,
): void
export function install(
  server: McpServer,
  provider: AnyProvider,
  options?: InstallOptions,
): void {
  const fileAccess = options?.fileAccess
  const fileCompleter = fileAccess
    ? createFileCompleter(fileAccess.readDirectory)
    : undefined

  const createResolver = () => {
    if (!fileAccess) {
      throw new Error(
        'fileAccess is required in options for providers that need symbol resolution',
      )
    }
    return new SymbolResolver(fileAccess, options?.resolverConfig)
  }

  // FileAccessProvider: readFile + readDirectory
  if ('readFile' in provider && 'readDirectory' in provider) {
    registerFilesystemResource(server, provider as FileAccessProvider)
    return
  }

  // EditProvider: applyEdits or previewAndApplyEdits
  if ('applyEdits' in provider || 'previewAndApplyEdits' in provider) {
    if (!fileAccess) {
      throw new Error(
        'fileAccess is required in options when installing an EditProvider',
      )
    }
    const opts = options as EditInstallOptions | undefined
    registerApplyEditTool(
      server,
      provider as EditProvider,
      fileAccess.readFile,
      {
        onInput: opts?.onEditInput,
        onOutput: opts?.onEditOutput,
      },
    )
    return
  }

  // DefinitionProvider: provideDefinition
  if ('provideDefinition' in provider) {
    const defProvider = provider as DefinitionProvider
    const opts = options as DefinitionInstallOptions | undefined
    const resolver = createResolver()
    registerGotoDefinitionTool(server, defProvider, resolver, {
      onInput: opts?.onDefinitionInput,
      onOutput: opts?.onDefinitionOutput,
    })
    if (defProvider.provideTypeDefinition) {
      registerGotoTypeDefinitionTool(server, defProvider, resolver, {
        onInput: opts?.onTypeDefinitionInput,
        onOutput: opts?.onTypeDefinitionOutput,
      })
    }
    return
  }

  // ReferencesProvider: provideReferences
  if ('provideReferences' in provider) {
    const opts = options as ReferencesInstallOptions | undefined
    registerFindReferencesTool(
      server,
      provider as ReferencesProvider,
      createResolver(),
      {
        onInput: opts?.onReferencesInput,
        onOutput: opts?.onReferencesOutput,
      },
    )
    return
  }

  // HierarchyProvider: provideCallHierarchy
  if ('provideCallHierarchy' in provider) {
    const opts = options as HierarchyInstallOptions | undefined
    registerCallHierarchyTool(
      server,
      provider as HierarchyProvider,
      createResolver(),
      {
        onInput: opts?.onCallHierarchyInput,
        onOutput: opts?.onCallHierarchyOutput,
      },
    )
    return
  }

  // DiagnosticsProvider: provideDiagnostics
  if ('provideDiagnostics' in provider) {
    registerDiagnosticsResources(
      server,
      provider as DiagnosticsProvider,
      fileCompleter,
    )
    return
  }

  // OutlineProvider: provideDocumentSymbols
  if ('provideDocumentSymbols' in provider) {
    registerOutlineResource(server, provider as OutlineProvider, fileCompleter)
    return
  }

  // GlobalFindProvider: globalFind
  if ('globalFind' in provider) {
    const opts = options as GlobalFindInstallOptions | undefined
    registerGlobalFindTool(server, provider as GlobalFindProvider, {
      onInput: opts?.onGlobalFindInput,
      onOutput: opts?.onGlobalFindOutput,
    })
    return
  }

  // GraphProvider: getLinkStructure
  if ('getLinkStructure' in provider) {
    const graphProvider = provider as GraphProvider
    const opts = options as GraphInstallOptions | undefined
    registerGetLinkStructureTool(server, graphProvider, {
      onOutput: opts?.onLinkStructureOutput,
    })
    registerAddLinkTool(server, graphProvider, {
      onInput: opts?.onAddLinkInput,
      onOutput: opts?.onAddLinkOutput,
    })
    registerGraphResources(server, graphProvider, fileCompleter)
    return
  }

  // FrontmatterProvider: getFrontmatterStructure
  if ('getFrontmatterStructure' in provider) {
    const fmProvider = provider as FrontmatterProvider
    const opts = options as FrontmatterInstallOptions | undefined
    registerGetFrontmatterStructureTool(server, fmProvider, {
      onInput: opts?.onFrontmatterStructureInput,
      onOutput: opts?.onFrontmatterStructureOutput,
    })
    registerSetFrontmatterTool(server, fmProvider, {
      onInput: opts?.onSetFrontmatterInput,
      onOutput: opts?.onSetFrontmatterOutput,
    })
    registerFrontmatterResource(server, fmProvider, fileCompleter)
    return
  }
}
