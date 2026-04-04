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

// ============================================================================
// Provider merging
// ============================================================================

function mergeProviders(providers: AnyProvider[]): AnyProvider {
  if (providers.length <= 0)
    throw new Error('providers array must not be empty')
  if (providers.length === 1 && providers[0]) return providers[0]

  const first = providers[0]
  if (!first)
    throw new Error('The first item of providers array must be defined')

  // FileAccessProvider: readFile + readDirectory
  if ('readFile' in first && 'readDirectory' in first) {
    const ps = providers as FileAccessProvider[]
    const merged: FileAccessProvider = {
      readFile: (uri) => (first as FileAccessProvider).readFile(uri),
      readDirectory: (uri) => (first as FileAccessProvider).readDirectory(uri),
    }
    if (ps.some((p) => p.onFileChanged)) {
      merged.onFileChanged = (cb) => {
        for (const p of ps) p.onFileChanged?.(cb)
      }
    }
    return merged
  }

  // EditProvider: applyEdits or previewAndApplyEdits — use first
  if ('applyEdits' in first || 'previewAndApplyEdits' in first) {
    return first
  }

  // DefinitionProvider: provideDefinition
  if ('provideDefinition' in first) {
    const ps = providers as DefinitionProvider[]
    const merged: DefinitionProvider = {
      async provideDefinition(uri, position) {
        const results = await Promise.all(
          ps.map((p) => p.provideDefinition(uri, position)),
        )
        return results.flat()
      },
    }
    if (ps.some((p) => p.provideTypeDefinition)) {
      merged.provideTypeDefinition = async (uri, position) => {
        const withMethod = ps.filter((p) => p.provideTypeDefinition)
        const results = await Promise.all(
          // biome-ignore lint/style/noNonNullAssertion: filter ensures
          withMethod.map((p) => p.provideTypeDefinition!(uri, position)),
        )
        return results.flat()
      }
    }
    return merged
  }

  // ReferencesProvider: provideReferences
  if ('provideReferences' in first) {
    const ps = providers as ReferencesProvider[]
    return {
      async provideReferences(uri, position) {
        const results = await Promise.all(
          ps.map((p) => p.provideReferences(uri, position)),
        )
        return results.flat()
      },
    } satisfies ReferencesProvider
  }

  // HierarchyProvider: provideCallHierarchy
  if ('provideCallHierarchy' in first) {
    const ps = providers as HierarchyProvider[]
    return {
      async provideCallHierarchy(uri, position, direction) {
        const results = await Promise.all(
          ps.map((p) => p.provideCallHierarchy(uri, position, direction)),
        )
        return results.flat()
      },
    } satisfies HierarchyProvider
  }

  // DiagnosticsProvider: provideDiagnostics
  if ('provideDiagnostics' in first) {
    const ps = providers as DiagnosticsProvider[]
    const merged: DiagnosticsProvider = {
      async provideDiagnostics(uri) {
        const results = await Promise.all(
          ps.map((p) => p.provideDiagnostics(uri)),
        )
        return results.flat()
      },
    }
    if (ps.some((p) => p.getWorkspaceDiagnostics)) {
      merged.getWorkspaceDiagnostics = async () => {
        const withMethod = ps.filter((p) => p.getWorkspaceDiagnostics)
        const results = await Promise.all(
          // biome-ignore lint/style/noNonNullAssertion: filter ensures
          withMethod.map((p) => p.getWorkspaceDiagnostics!()),
        )
        return results.flat()
      }
    }
    if (ps.some((p) => p.onDiagnosticsChanged)) {
      merged.onDiagnosticsChanged = (cb) => {
        for (const p of ps) p.onDiagnosticsChanged?.(cb)
      }
    }
    return merged
  }

  // OutlineProvider: provideDocumentSymbols
  if ('provideDocumentSymbols' in first) {
    const ps = providers as OutlineProvider[]
    return {
      async provideDocumentSymbols(uri) {
        const results = await Promise.all(
          ps.map((p) => p.provideDocumentSymbols(uri)),
        )
        return results.flat()
      },
    } satisfies OutlineProvider
  }

  // GlobalFindProvider: globalFind
  if ('globalFind' in first) {
    const ps = providers as GlobalFindProvider[]
    return {
      async globalFind(query, options) {
        const results = await Promise.all(
          ps.map((p) => p.globalFind(query, options)),
        )
        return results.flat()
      },
    } satisfies GlobalFindProvider
  }

  // GraphProvider: getLinkStructure
  if ('getLinkStructure' in first) {
    const ps = providers as GraphProvider[]
    return {
      async getLinkStructure() {
        const results = await Promise.all(ps.map((p) => p.getLinkStructure()))
        return results.flat()
      },
      async resolveOutlinks(path) {
        const results = await Promise.all(
          ps.map((p) => p.resolveOutlinks(path)),
        )
        return results.flat()
      },
      async resolveBacklinks(path) {
        const results = await Promise.all(
          ps.map((p) => p.resolveBacklinks(path)),
        )
        return results.flat()
      },
      async addLink(path, pattern, linkTo) {
        await Promise.all(ps.map((p) => p.addLink(path, pattern, linkTo)))
      },
    } satisfies GraphProvider
  }

  // FrontmatterProvider: getFrontmatterStructure
  if ('getFrontmatterStructure' in first) {
    const ps = providers as FrontmatterProvider[]
    return {
      async getFrontmatterStructure(property, path) {
        const results = await Promise.all(
          ps.map((p) => p.getFrontmatterStructure(property, path)),
        )
        return results.flat()
      },
      async getFrontmatter(path) {
        const results = await Promise.all(ps.map((p) => p.getFrontmatter(path)))
        return Object.assign({}, ...results)
      },
      async setFrontmatter(path, property, value) {
        await Promise.all(
          ps.map((p) => p.setFrontmatter(path, property, value)),
        )
      },
    } satisfies FrontmatterProvider
  }

  return first
}

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
 * Accepts a single provider or an array of providers of the same type. When an array is
 * passed, their results are merged: array-returning methods are concatenated, void methods
 * are called on all providers in parallel, and callback registrars are registered on all.
 *
 * The provider type is detected via duck-typing (checking for characteristic methods).
 * Some providers require `fileAccess` in options:
 * - `DefinitionProvider`, `ReferencesProvider`, `HierarchyProvider` need it for symbol resolution
 * - `EditProvider` needs it for file hash verification
 * - `DiagnosticsProvider`, `OutlineProvider`, `GraphProvider`, `FrontmatterProvider` use it optionally for auto-complete
 */
export function install(
  server: McpServer,
  provider: FileAccessProvider | FileAccessProvider[],
  options?: InstallOptions,
): void
export function install(
  server: McpServer,
  provider: EditProvider | EditProvider[],
  options?: EditInstallOptions,
): void
export function install(
  server: McpServer,
  provider: DefinitionProvider | DefinitionProvider[],
  options?: DefinitionInstallOptions,
): void
export function install(
  server: McpServer,
  provider: ReferencesProvider | ReferencesProvider[],
  options?: ReferencesInstallOptions,
): void
export function install(
  server: McpServer,
  provider: HierarchyProvider | HierarchyProvider[],
  options?: HierarchyInstallOptions,
): void
export function install(
  server: McpServer,
  provider: DiagnosticsProvider | DiagnosticsProvider[],
  options?: InstallOptions,
): void
export function install(
  server: McpServer,
  provider: OutlineProvider | OutlineProvider[],
  options?: InstallOptions,
): void
export function install(
  server: McpServer,
  provider: GlobalFindProvider | GlobalFindProvider[],
  options?: GlobalFindInstallOptions,
): void
export function install(
  server: McpServer,
  provider: GraphProvider | GraphProvider[],
  options?: GraphInstallOptions,
): void
export function install(
  server: McpServer,
  provider: FrontmatterProvider | FrontmatterProvider[],
  options?: FrontmatterInstallOptions,
): void
export function install(
  server: McpServer,
  provider: AnyProvider | AnyProvider[],
  options?: InstallOptions,
): void {
  const resolved = Array.isArray(provider) ? mergeProviders(provider) : provider
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
  if ('readFile' in resolved && 'readDirectory' in resolved) {
    registerFilesystemResource(server, resolved as FileAccessProvider)
    return
  }

  // EditProvider: applyEdits or previewAndApplyEdits
  if ('applyEdits' in resolved || 'previewAndApplyEdits' in resolved) {
    if (!fileAccess) {
      throw new Error(
        'fileAccess is required in options when installing an EditProvider',
      )
    }
    const opts = options as EditInstallOptions | undefined
    registerApplyEditTool(
      server,
      resolved as EditProvider,
      fileAccess.readFile,
      {
        onInput: opts?.onEditInput,
        onOutput: opts?.onEditOutput,
      },
    )
    return
  }

  // DefinitionProvider: provideDefinition
  if ('provideDefinition' in resolved) {
    const defProvider = resolved as DefinitionProvider
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
  if ('provideReferences' in resolved) {
    const opts = options as ReferencesInstallOptions | undefined
    registerFindReferencesTool(
      server,
      resolved as ReferencesProvider,
      createResolver(),
      {
        onInput: opts?.onReferencesInput,
        onOutput: opts?.onReferencesOutput,
      },
    )
    return
  }

  // HierarchyProvider: provideCallHierarchy
  if ('provideCallHierarchy' in resolved) {
    const opts = options as HierarchyInstallOptions | undefined
    registerCallHierarchyTool(
      server,
      resolved as HierarchyProvider,
      createResolver(),
      {
        onInput: opts?.onCallHierarchyInput,
        onOutput: opts?.onCallHierarchyOutput,
      },
    )
    return
  }

  // DiagnosticsProvider: provideDiagnostics
  if ('provideDiagnostics' in resolved) {
    registerDiagnosticsResources(
      server,
      resolved as DiagnosticsProvider,
      fileCompleter,
    )
    return
  }

  // OutlineProvider: provideDocumentSymbols
  if ('provideDocumentSymbols' in resolved) {
    registerOutlineResource(server, resolved as OutlineProvider, fileCompleter)
    return
  }

  // GlobalFindProvider: globalFind
  if ('globalFind' in resolved) {
    const opts = options as GlobalFindInstallOptions | undefined
    registerGlobalFindTool(server, resolved as GlobalFindProvider, {
      onInput: opts?.onGlobalFindInput,
      onOutput: opts?.onGlobalFindOutput,
    })
    return
  }

  // GraphProvider: getLinkStructure
  if ('getLinkStructure' in resolved) {
    const graphProvider = resolved as GraphProvider
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
  if ('getFrontmatterStructure' in resolved) {
    const fmProvider = resolved as FrontmatterProvider
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
