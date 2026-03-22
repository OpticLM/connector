/**
 * Capability Merging for MCP LSP Driver SDK
 *
 * Merges multiple IdeCapabilities into a single composite object
 * so that overlapping providers aggregate their results.
 */

import type {
  DefinitionProvider,
  DiagnosticsProvider,
  FrontmatterProvider,
  GlobalFindProvider,
  GraphProvider,
  HierarchyProvider,
  IdeCapabilities,
  OutlineProvider,
  PartialIdeCapabilities,
  ReferencesProvider,
} from './capabilities.js'
import type { EditProvider, FileAccessProvider } from './interfaces.js'

// ============================================================================
// Per-provider merge helpers
// ============================================================================

function mergeFileAccess(
  providers: FileAccessProvider[],
): FileAccessProvider | undefined {
  if (providers.length === 0) return undefined
  if (providers.length === 1) return providers[0]

  // First-wins for read methods
  const first = providers[0]!
  const merged: FileAccessProvider = {
    readFile: first.readFile.bind(first),
    readDirectory: first.readDirectory.bind(first),
  }

  // Merge onFileChanged — register callback on every provider that has it
  const fileChangedHandlers = providers
    .map((p) => p.onFileChanged)
    .filter((fn): fn is NonNullable<typeof fn> => fn != null)
  if (fileChangedHandlers.length > 0) {
    merged.onFileChanged = (callback) => {
      for (const handler of fileChangedHandlers) {
        handler(callback)
      }
    }
  }

  return merged
}

function mergeEdit(providers: EditProvider[]): EditProvider | undefined {
  return providers[0]
}

function mergeDefinition(
  providers: DefinitionProvider[],
): DefinitionProvider | undefined {
  if (providers.length === 0) return undefined
  if (providers.length === 1) return providers[0]
  return {
    async provideDefinition(uri, position) {
      const results = await Promise.all(
        providers.map((p) => p.provideDefinition(uri, position)),
      )
      return results.flat()
    },
  }
}

function mergeReferences(
  providers: ReferencesProvider[],
): ReferencesProvider | undefined {
  if (providers.length === 0) return undefined
  if (providers.length === 1) return providers[0]
  return {
    async provideReferences(uri, position) {
      const results = await Promise.all(
        providers.map((p) => p.provideReferences(uri, position)),
      )
      return results.flat()
    },
  }
}

function mergeHierarchy(
  providers: HierarchyProvider[],
): HierarchyProvider | undefined {
  if (providers.length === 0) return undefined
  if (providers.length === 1) return providers[0]
  return {
    async provideCallHierarchy(uri, position, direction) {
      const results = await Promise.all(
        providers.map((p) => p.provideCallHierarchy(uri, position, direction)),
      )
      return results.flat()
    },
  }
}

function mergeDiagnostics(
  providers: DiagnosticsProvider[],
): DiagnosticsProvider | undefined {
  if (providers.length === 0) return undefined
  if (providers.length === 1) return providers[0]

  const merged: DiagnosticsProvider = {
    async provideDiagnostics(uri) {
      const results = await Promise.all(
        providers.map((p) => p.provideDiagnostics(uri)),
      )
      return results.flat()
    },
  }

  // Merge getWorkspaceDiagnostics if any provider has it
  const workspaceProviders = providers
    .map((p) => p.getWorkspaceDiagnostics)
    .filter((fn): fn is NonNullable<typeof fn> => fn != null)
  if (workspaceProviders.length > 0) {
    merged.getWorkspaceDiagnostics = async () => {
      const results = await Promise.all(workspaceProviders.map((fn) => fn()))
      return results.flat()
    }
  }

  // Merge onDiagnosticsChanged — register callback on every provider that has it
  const diagnosticsChangedHandlers = providers
    .map((p) => p.onDiagnosticsChanged)
    .filter((fn): fn is NonNullable<typeof fn> => fn != null)
  if (diagnosticsChangedHandlers.length > 0) {
    merged.onDiagnosticsChanged = (callback) => {
      for (const handler of diagnosticsChangedHandlers) {
        handler(callback)
      }
    }
  }

  return merged
}

function mergeOutline(
  providers: OutlineProvider[],
): OutlineProvider | undefined {
  if (providers.length === 0) return undefined
  if (providers.length === 1) return providers[0]
  return {
    async provideDocumentSymbols(uri) {
      const results = await Promise.all(
        providers.map((p) => p.provideDocumentSymbols(uri)),
      )
      return results.flat()
    },
  }
}

function mergeGlobalFind(
  providers: GlobalFindProvider[],
): GlobalFindProvider | undefined {
  if (providers.length === 0) return undefined
  if (providers.length === 1) return providers[0]
  return {
    async globalFind(query, options) {
      const results = await Promise.all(
        providers.map((p) => p.globalFind(query, options)),
      )
      return results.flat()
    },
    async globalReplace(query, replaceWith, options) {
      const results = await Promise.all(
        providers.map((p) => p.globalReplace(query, replaceWith, options)),
      )
      return results.reduce((sum, n) => sum + n, 0)
    },
  }
}

function mergeGraph(providers: GraphProvider[]): GraphProvider | undefined {
  if (providers.length === 1) return providers[0]

  const [first] = providers
  if (!first) return undefined

  return {
    async getLinkStructure() {
      const results = await Promise.all(
        providers.map((p) => p.getLinkStructure()),
      )
      return results.flat()
    },
    async resolveOutlinks(path) {
      const results = await Promise.all(
        providers.map((p) => p.resolveOutlinks(path)),
      )
      return results.flat()
    },
    async resolveBacklinks(path) {
      const results = await Promise.all(
        providers.map((p) => p.resolveBacklinks(path)),
      )
      return results.flat()
    },
    // Mutation — first provider wins
    addLink: (path, pattern, linkTo) => first.addLink(path, pattern, linkTo),
  }
}

function mergeFrontmatter(
  providers: FrontmatterProvider[],
): FrontmatterProvider | undefined {
  if (providers.length === 1) return providers[0]

  const [first] = providers
  if (!first) return undefined

  return {
    async getFrontmatterStructure(property, path?) {
      const results = await Promise.all(
        providers.map((p) => p.getFrontmatterStructure(property, path)),
      )
      return results.flat()
    },
    async getFrontmatter(path) {
      const results = await Promise.all(
        providers.map((p) => p.getFrontmatter(path)),
      )
      return Object.assign({}, ...results)
    },
    // Mutation — first provider wins
    setFrontmatter: (path, property, value) =>
      first.setFrontmatter(path, property, value),
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Collect all non-undefined values of a given key from a list of objects.
 */
function collect<T, K extends keyof T>(list: T[], key: K): NonNullable<T[K]>[] {
  const result: NonNullable<T[K]>[] = []
  for (const item of list) {
    const val = item[key]
    if (val != null) {
      result.push(val as NonNullable<T[K]>)
    }
  }
  return result
}

/**
 * Merges multiple partial IdeCapabilities objects into a single composite,
 * using a fallback FileAccessProvider when none of the partials supply one.
 *
 * - Read providers concat their results via Promise.all + flat.
 * - Write/mutation providers use the first available ("first wins").
 * - Subscription callbacks (onDiagnosticsChanged, onFileChanged) register on every provider that has them.
 *
 * @param capsList - Array of PartialIdeCapabilities to merge
 * @param fallbackFileAccess - FileAccessProvider used when no partial provides fileAccess
 * @returns A single merged IdeCapabilities object
 */
export function mergeCapabilities(
  capsList: PartialIdeCapabilities[],
  fallbackFileAccess: FileAccessProvider,
): IdeCapabilities {
  if (capsList.length === 0) {
    return { fileAccess: fallbackFileAccess }
  }

  const fileAccess =
    mergeFileAccess(collect(capsList, 'fileAccess')) ?? fallbackFileAccess

  return {
    fileAccess,
    edit: mergeEdit(collect(capsList, 'edit')),
    definition: mergeDefinition(collect(capsList, 'definition')),
    references: mergeReferences(collect(capsList, 'references')),
    hierarchy: mergeHierarchy(collect(capsList, 'hierarchy')),
    diagnostics: mergeDiagnostics(collect(capsList, 'diagnostics')),
    outline: mergeOutline(collect(capsList, 'outline')),
    globalFind: mergeGlobalFind(collect(capsList, 'globalFind')),
    graph: mergeGraph(collect(capsList, 'graph')),
    frontmatter: mergeFrontmatter(collect(capsList, 'frontmatter')),
  }
}
