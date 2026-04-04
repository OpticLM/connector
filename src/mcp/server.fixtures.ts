import { Client } from '@modelcontextprotocol/sdk/client'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { vi } from 'vitest'
import type {
  DefinitionProvider,
  DiagnosticsProvider,
  FrontmatterProvider,
  GlobalFindMatch,
  GlobalFindOptions,
  GlobalFindProvider,
  GraphProvider,
  HierarchyProvider,
  OutlineProvider,
  ReferencesProvider,
} from '../capabilities.js'
import type { EditProvider, FileAccessProvider } from '../interfaces.js'
import type {
  CodeSnippet,
  Diagnostic,
  DocumentSymbol,
  Frontmatter,
  FrontmatterMatch,
  FrontmatterValue,
  Link,
} from '../types.js'

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
    provideTypeDefinition: vi.fn(async () => results),
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

export function createMockEditProvider(approved = true): EditProvider {
  return {
    previewAndApplyEdits: vi.fn(async () => approved),
  }
}

export function createMockGlobalFindProvider(
  matches: GlobalFindMatch[] = [],
): GlobalFindProvider {
  return {
    globalFind: vi.fn(
      async (
        _query: string,
        _options: GlobalFindOptions,
      ): Promise<GlobalFindMatch[]> => matches,
    ),
  }
}

export function createMockGraphProvider(
  links: Link[] = [],
  addLinkError?: Error,
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
      ): Promise<void> => {
        if (addLinkError) {
          throw addLinkError
        }
      },
    ),
  }
}

export function createMockFrontmatterProvider(
  frontmatter: Frontmatter = {},
  structureMatches: FrontmatterMatch[] = [],
  setError?: Error,
): FrontmatterProvider {
  return {
    getFrontmatter: vi.fn(async (): Promise<Frontmatter> => frontmatter),
    getFrontmatterStructure: vi.fn(
      async (): Promise<FrontmatterMatch[]> => structureMatches,
    ),
    setFrontmatter: vi.fn(
      async (
        _path: string,
        _property: string,
        _value: FrontmatterValue,
      ): Promise<void> => {
        if (setError) {
          throw setError
        }
      },
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
