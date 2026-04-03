/**
 * MCP entry point for installing individual providers onto an MCP server.
 *
 * @packageDocumentation
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
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
import type { EditProvider, FileAccessProvider } from '../interfaces.js'
import { SymbolResolver } from '../resolver.js'
import type { ResolverConfig } from '../resolver.js'
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
    registerApplyEditTool(server, provider as EditProvider, fileAccess.readFile)
    return
  }

  // DefinitionProvider: provideDefinition
  if ('provideDefinition' in provider) {
    const defProvider = provider as DefinitionProvider
    const resolver = createResolver()
    registerGotoDefinitionTool(server, defProvider, resolver)
    if (defProvider.provideTypeDefinition) {
      registerGotoTypeDefinitionTool(server, defProvider, resolver)
    }
    return
  }

  // ReferencesProvider: provideReferences
  if ('provideReferences' in provider) {
    registerFindReferencesTool(
      server,
      provider as ReferencesProvider,
      createResolver(),
    )
    return
  }

  // HierarchyProvider: provideCallHierarchy
  if ('provideCallHierarchy' in provider) {
    registerCallHierarchyTool(
      server,
      provider as HierarchyProvider,
      createResolver(),
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
    registerGlobalFindTool(server, provider as GlobalFindProvider)
    return
  }

  // GraphProvider: getLinkStructure
  if ('getLinkStructure' in provider) {
    const graphProvider = provider as GraphProvider
    registerGetLinkStructureTool(server, graphProvider)
    registerAddLinkTool(server, graphProvider)
    registerGraphResources(server, graphProvider, fileCompleter)
    return
  }

  // FrontmatterProvider: getFrontmatterStructure
  if ('getFrontmatterStructure' in provider) {
    const fmProvider = provider as FrontmatterProvider
    registerGetFrontmatterStructureTool(server, fmProvider)
    registerSetFrontmatterTool(server, fmProvider)
    registerFrontmatterResource(server, fmProvider, fileCompleter)
    return
  }
}
