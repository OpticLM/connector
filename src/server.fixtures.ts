import { Client } from '@modelcontextprotocol/sdk/client'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { vi } from 'vitest'
import type {
  DefinitionProvider,
  DiagnosticsProvider,
  GlobalFindMatch,
  GlobalFindOptions,
  GlobalFindProvider,
  GraphProvider,
  HierarchyProvider,
  OutlineProvider,
  ReferencesProvider,
} from './capabilities.js'
import type {
  FileAccessProvider,
  UserInteractionProvider,
} from './interfaces.js'
import type { CodeSnippet, Diagnostic, DocumentSymbol, Link } from './types.js'

export const mockFiles = {
  'path/to/file': 'MockFileContent',
}

export function createMockFileAccess(
  files: Record<string, string> = mockFiles,
): FileAccessProvider {
  return {
    readFile: vi.fn(async (uri: string) => {
      const content = files[uri]
      if (content === undefined) {
        throw new Error(`File not found: ${uri}`)
      }
      return content
    }),

    getFileTree: vi.fn(async () => [
      'src/index.ts',
      'src/utils.ts',
      'README.md',
    ]),

    readDirectory: vi.fn(async () => ['file1.ts', 'file2.ts', 'subdir']),
  }
}

export const mockCodeSnippet: CodeSnippet = {
  uri: 'path/to/file',
  range: {
    start: { line: 0, character: 1 },
    end: { line: 2, character: 3 },
  },
  content: 'test',
}

export function createMockDefinitionProvider(
  results: CodeSnippet[] = [mockCodeSnippet],
): DefinitionProvider {
  return {
    provideDefinition: vi.fn(async () => results),
  }
}

export function createMockReferencesProvider(
  results: CodeSnippet[] = [],
): ReferencesProvider {
  return {
    provideReferences: vi.fn(async () => results),
  }
}

export function createMockHierarchyProvider(
  results: CodeSnippet[] = [],
): HierarchyProvider {
  return {
    provideCallHierarchy: vi.fn(async () => results),
  }
}

export function createMockDiagnosticsProvider(
  results: Diagnostic[] = [],
  workspaceResults?: Diagnostic[],
): DiagnosticsProvider {
  const provider: DiagnosticsProvider = {
    provideDiagnostics: vi.fn(async () => results),
  }
  if (workspaceResults !== undefined) {
    provider.getWorkspaceDiagnostics = vi.fn(async () => workspaceResults)
  }
  return provider
}

export function createMockOutlineProvider(
  results: DocumentSymbol[] = [],
): OutlineProvider {
  return {
    provideDocumentSymbols: vi.fn(async () => results),
  }
}

export function createMockUserInteraction(
  approved = true,
): UserInteractionProvider {
  return {
    previewAndApplyEdits: vi.fn(async () => approved),
  }
}

export function createMockGlobalFindProvider(
  matches: GlobalFindMatch[] = [],
  count = 0,
): GlobalFindProvider {
  return {
    globalFind: vi.fn(
      async (
        _query: string,
        _options: GlobalFindOptions,
      ): Promise<GlobalFindMatch[]> => matches,
    ),
    globalReplace: vi.fn(
      async (
        _query: string,
        _replaceWith: string,
        _options: GlobalFindOptions,
      ): Promise<number> => count,
    ),
  }
}

export function createMockGraphProvider(
  links: Link[] = [],
  addLinkResult = true,
): GraphProvider {
  return {
    getLinkStructure: vi.fn(async (): Promise<Link[]> => links),
    resolveOutlinks: vi.fn(async (): Promise<Link[]> => links),
    resolveBacklinks: vi.fn(async (): Promise<Link[]> => links),
    addLink: vi.fn(
      async (
        _path: string,
        _pattern: string,
        _linkTo: string,
      ): Promise<boolean> => addLinkResult,
    ),
  }
}

export function createMockServer(): McpServer {
  return new McpServer({
    name: 'test-server',
    version: '1.0.0',
  })
}

export async function createAndConnectMockClient(
  server: McpServer,
): Promise<Client> {
  const [c, s] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await server.connect(s)
  await client.connect(c)
  return client
}
