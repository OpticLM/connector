import { describe, expect, it } from 'vitest'
import type { Diagnostic, DocumentSymbol } from '../types.js'
import { install } from './index.js'
import {
  createAndConnectMockClient,
  createMockDiagnosticsProvider,
  createMockFileAccess,
  createMockOutlineProvider,
  createMockServer,
} from './server.fixtures.js'

describe('resource integration', () => {
  it('should register and access file diagnostics resource', async () => {
    const server = createMockServer()
    const diagnostics: Diagnostic[] = [
      {
        uri: 'test.ts',
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 10 },
        },
        severity: 'error',
        message: 'Syntax error',
        source: 'typescript',
        code: 2322,
      },
    ]
    const diagnosticsProvider = createMockDiagnosticsProvider(diagnostics)
    const fileAccess = createMockFileAccess()

    install(server, fileAccess)
    install(server, diagnosticsProvider, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'diagnostics://test.ts' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: '- **ERROR** [typescript] (2322) at line 1: Syntax error',
      uri: 'diagnostics://test.ts',
    })
  })

  it('should register and access workspace diagnostics resource', async () => {
    const server = createMockServer()
    const workspaceDiagnostics: Diagnostic[] = [
      {
        uri: 'file1.ts',
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 5 },
        },
        severity: 'warning',
        message: 'Unused variable',
      },
      {
        uri: 'file2.ts',
        range: {
          start: { line: 5, character: 0 },
          end: { line: 5, character: 3 },
        },
        severity: 'error',
        message: 'Missing semicolon',
      },
    ]
    const diagnosticsProvider = createMockDiagnosticsProvider(
      [],
      workspaceDiagnostics,
    )
    const fileAccess = createMockFileAccess()

    install(server, fileAccess)
    install(server, diagnosticsProvider, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'diagnostics://workspace' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: `## file1.ts
- **WARNING** at line 2: Unused variable

## file2.ts
- **ERROR** at line 6: Missing semicolon`,
      uri: 'diagnostics://workspace',
    })
  })

  it('should register and access outline resource', async () => {
    const server = createMockServer()
    const symbols: DocumentSymbol[] = [
      {
        name: 'MyClass',
        kind: 'class',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 1 },
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 13 },
        },
        children: [
          {
            name: 'myMethod',
            kind: 'method',
            range: {
              start: { line: 2, character: 2 },
              end: { line: 5, character: 3 },
            },
            selectionRange: {
              start: { line: 2, character: 2 },
              end: { line: 2, character: 10 },
            },
          },
        ],
      },
    ]
    const outlineProvider = createMockOutlineProvider(symbols)
    const fileAccess = createMockFileAccess()

    install(server, fileAccess)
    install(server, outlineProvider, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'outline://test.ts' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: `- **class** \`MyClass\` (lines 1-11)
  - **method** \`myMethod\` (lines 3-6)`,
      uri: 'outline://test.ts',
    })
  })

  it('should handle outline with nested symbols', async () => {
    const server = createMockServer()
    const symbols: DocumentSymbol[] = [
      {
        name: 'MyNamespace',
        kind: 'namespace',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 20, character: 1 },
        },
        selectionRange: {
          start: { line: 0, character: 10 },
          end: { line: 0, character: 21 },
        },
        children: [
          {
            name: 'MyClass',
            kind: 'class',
            range: {
              start: { line: 2, character: 2 },
              end: { line: 15, character: 3 },
            },
            selectionRange: {
              start: { line: 2, character: 8 },
              end: { line: 2, character: 15 },
            },
            children: [
              {
                name: 'constructor',
                kind: 'method',
                range: {
                  start: { line: 4, character: 4 },
                  end: { line: 6, character: 5 },
                },
                selectionRange: {
                  start: { line: 4, character: 4 },
                  end: { line: 4, character: 15 },
                },
              },
            ],
          },
        ],
      },
    ]
    const outlineProvider = createMockOutlineProvider(symbols)
    const fileAccess = createMockFileAccess()

    install(server, fileAccess)
    install(server, outlineProvider, { fileAccess })

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'outline://test.ts' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/markdown',
      text: `- **namespace** \`MyNamespace\` (lines 1-21)
  - **class** \`MyClass\` (lines 3-16)
    - **method** \`constructor\` (lines 5-7)`,
      uri: 'outline://test.ts',
    })
  })

  it('should register and access filesystem resource for directory listing', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess({}) // No files, so it falls back to readDirectory

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'files://src' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'application/json',
      text: '["file1.ts","file2.ts","subdir"]',
      uri: 'files://src',
    })
  })

  it('should read file content via filesystem resource', async () => {
    const server = createMockServer()
    const fileContent = 'line1\nline2\nline3\nline4\nline5'
    const fileAccess = createMockFileAccess({ 'src/test.ts': fileContent })

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'files://src/test.ts',
    })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/plain',
      text: '1:99|line1\n2:fa|line2\n3:db|line3\n4:3c|line4\n5:1d|line5',
      uri: 'files://src/test.ts',
    })
  })

  it('should read specific line from file via filesystem resource', async () => {
    const server = createMockServer()
    const fileContent = 'line1\nline2\nline3\nline4\nline5'
    const fileAccess = createMockFileAccess({ 'src/test.ts': fileContent })

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'files://src/test.ts#L3',
    })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/plain',
      text: '3:db|line3',
      uri: 'files://src/test.ts#L3',
    })
  })

  it('should read line range from file via filesystem resource', async () => {
    const server = createMockServer()
    const fileContent = 'line1\nline2\nline3\nline4\nline5'
    const fileAccess = createMockFileAccess({ 'src/test.ts': fileContent })

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'files://src/test.ts#L2-L4',
    })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/plain',
      text: '2:fa|line2\n3:db|line3\n4:3c|line4',
      uri: 'files://src/test.ts#L2-L4',
    })
  })

  it('should filter file content by regex pattern', async () => {
    const server = createMockServer()
    const fileContent =
      'import { foo } from "bar"\nconst x = 1\nimport { baz } from "qux"\nexport default x'
    const fileAccess = createMockFileAccess({ 'src/test.ts': fileContent })

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'files://src/test.ts?pattern=^import',
    })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/plain',
      text: '1:0b|import { foo } from "bar"\n3:d7|import { baz } from "qux"',
      uri: 'files://src/test.ts?pattern=^import',
    })
  })

  it('should combine line range with regex pattern', async () => {
    const server = createMockServer()
    const fileContent = 'line1\nline2 match\nline3\nline4 match\nline5'
    const fileAccess = createMockFileAccess({ 'src/test.ts': fileContent })

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'files://src/test.ts?pattern=match#L2-L4',
    })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/plain',
      text: '2:9d|line2 match\n4:b8|line4 match',
      uri: 'files://src/test.ts?pattern=match#L2-L4',
    })
  })

  it('should support fragment-before-query ordering (#L2-L4?pattern=match)', async () => {
    const server = createMockServer()
    const fileContent = 'line1\nline2 match\nline3\nline4 match\nline5'
    const fileAccess = createMockFileAccess({ 'src/test.ts': fileContent })

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({
      uri: 'files://src/test.ts#L2-L4?pattern=match',
    })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'text/plain',
      text: '2:9d|line2 match\n4:b8|line4 match',
      uri: 'files://src/test.ts#L2-L4?pattern=match',
    })
  })

  it('should fallback to readDirectory when file read fails on files://', async () => {
    const server = createMockServer()
    const fileAccess = createMockFileAccess({}) // No files, readFile will fail

    install(server, fileAccess)

    const client = await createAndConnectMockClient(server)
    const r = await client.readResource({ uri: 'files://src' })
    expect(r.contents).toHaveLength(1)
    expect(r.contents[0]).toStrictEqual({
      mimeType: 'application/json',
      text: '["file1.ts","file2.ts","subdir"]',
      uri: 'files://src',
    })
  })
})
