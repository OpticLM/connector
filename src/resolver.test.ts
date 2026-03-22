import { describe, expect, it, vi } from 'vitest'
import type { FileAccessProvider } from './interfaces.js'
import { SymbolResolutionError, SymbolResolver } from './resolver.js'

// Helper to create a mock FileAccessProvider
function createMockFileAccess(
  files: Record<string, string>,
): FileAccessProvider {
  return {
    readFile: vi.fn(async (uri: string) => {
      const content = files[uri]
      if (content === undefined) {
        throw new Error(`File not found: ${uri}`)
      }
      return content
    }),
  }
}

describe('SymbolResolver', () => {
  describe('resolvePosition', () => {
    it('should find symbol at exact line hint', async () => {
      const fileContent = `function hello() {
  console.log("Hello, World!");
}

function goodbye() {
  console.log("Goodbye!");
}`
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      const position = await resolver.resolvePosition('test.ts', {
        symbolName: 'goodbye',
        lineHint: 5, // 1-based, function goodbye is on line 5
      })

      expect(position.line).toBe(4) // 0-based
      expect(position.character).toBe(9) // 'function '.length
    })

    it('should find symbol using 1-based lineHint conversion', async () => {
      const fileContent = 'const foo = 42;\nconst bar = 100;'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      // lineHint is 1-based, so 1 should point to line 0
      const position = await resolver.resolvePosition('test.ts', {
        symbolName: 'foo',
        lineHint: 1,
      })

      expect(position.line).toBe(0)
      expect(position.character).toBe(6) // 'const '.length
    })

    it('should find correct occurrence with orderHint', async () => {
      const fileContent = 'sum(x, x, x);'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      // Find first 'x' (orderHint = 0)
      const first = await resolver.resolvePosition('test.ts', {
        symbolName: 'x',
        lineHint: 1,
        orderHint: 0,
      })
      expect(first.character).toBe(4)

      // Find second 'x' (orderHint = 1)
      const second = await resolver.resolvePosition('test.ts', {
        symbolName: 'x',
        lineHint: 1,
        orderHint: 1,
      })
      expect(second.character).toBe(7)

      // Find third 'x' (orderHint = 2)
      const third = await resolver.resolvePosition('test.ts', {
        symbolName: 'x',
        lineHint: 1,
        orderHint: 2,
      })
      expect(third.character).toBe(10)
    })

    it('should default orderHint to 0 when not specified', async () => {
      const fileContent = 'foo foo foo'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      const position = await resolver.resolvePosition('test.ts', {
        symbolName: 'foo',
        lineHint: 1,
        // no orderHint specified
      })

      expect(position.character).toBe(0) // first occurrence
    })

    it('should find symbol on nearby line above (robustness fallback)', async () => {
      const fileContent = `// line 1
function target() {}
// line 3
// line 4
// line 5`
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      // lineHint is 4, but 'target' is on line 2
      const position = await resolver.resolvePosition('test.ts', {
        symbolName: 'target',
        lineHint: 4,
      })

      expect(position.line).toBe(1) // found on line 2 (0-based: 1)
      expect(position.character).toBe(9)
    })

    it('should find symbol on nearby line below (robustness fallback)', async () => {
      const fileContent = `// line 1
// line 2
// line 3
function target() {}
// line 5`
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      // lineHint is 2, but 'target' is on line 4
      const position = await resolver.resolvePosition('test.ts', {
        symbolName: 'target',
        lineHint: 2,
      })

      expect(position.line).toBe(3) // found on line 4 (0-based: 3)
    })

    it('should prefer line above when symbol exists both above and below', async () => {
      const fileContent = `target_above
// line 2
// line 3 (lineHint)
// line 4
target_below`
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      // The algorithm checks above first, so it should find target on line 1
      const position = await resolver.resolvePosition('test.ts', {
        symbolName: 'target',
        lineHint: 3,
      })

      // Should find target_above first (line 0) since it checks above before below
      expect(position.line).toBe(0)
    })

    it('should respect custom lineSearchRadius', async () => {
      const fileContent = `// 1
// 2
// 3
// 4
// 5
target
// 7
// 8
// 9
// 10`
      const fs = createMockFileAccess({ 'test.ts': fileContent })

      // With default radius of 2, searching from line 3 won't find target on line 6
      const resolverSmall = new SymbolResolver(fs, { lineSearchRadius: 2 })
      await expect(
        resolverSmall.resolvePosition('test.ts', {
          symbolName: 'target',
          lineHint: 3,
        }),
      ).rejects.toThrow(SymbolResolutionError)

      // With radius of 5, it should find it
      const resolverLarge = new SymbolResolver(fs, { lineSearchRadius: 5 })
      const position = await resolverLarge.resolvePosition('test.ts', {
        symbolName: 'target',
        lineHint: 3,
      })
      expect(position.line).toBe(5) // line 6, 0-based
    })

    it('should throw SymbolResolutionError when symbol not found', async () => {
      const fileContent = 'const foo = 42;'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      await expect(
        resolver.resolvePosition('test.ts', {
          symbolName: 'nonexistent',
          lineHint: 1,
        }),
      ).rejects.toThrow(SymbolResolutionError)
    })

    it('should include helpful message in SymbolResolutionError', async () => {
      const fileContent = 'const foo = 42;\nconst bar = 100;'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      try {
        await resolver.resolvePosition('test.ts', {
          symbolName: 'missing',
          lineHint: 1,
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(SymbolResolutionError)
        const err = error as SymbolResolutionError
        expect(err.symbolName).toBe('missing')
        expect(err.lineHint).toBe(1)
        expect(err.message).toContain('missing')
        expect(err.message).toContain('line 1')
      }
    })

    it('should throw when occurrence orderHint exceeds available occurrences', async () => {
      const fileContent = 'foo foo' // only 2 occurrences
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      await expect(
        resolver.resolvePosition('test.ts', {
          symbolName: 'foo',
          lineHint: 1,
          orderHint: 5, // asking for 6th occurrence
        }),
      ).rejects.toThrow(SymbolResolutionError)
    })

    it('should handle files with CRLF line endings', async () => {
      const fileContent = 'line1\r\nconst target = 1;\r\nline3'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      const position = await resolver.resolvePosition('test.ts', {
        symbolName: 'target',
        lineHint: 2,
      })

      expect(position.line).toBe(1)
      expect(position.character).toBe(6)
    })

    it('should handle empty lines gracefully', async () => {
      const fileContent = '\n\n\nconst target = 1;'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      const position = await resolver.resolvePosition('test.ts', {
        symbolName: 'target',
        lineHint: 4,
      })

      expect(position.line).toBe(3)
    })

    it('should propagate file read errors', async () => {
      const fs = createMockFileAccess({}) // no files
      const resolver = new SymbolResolver(fs)

      await expect(
        resolver.resolvePosition('nonexistent.ts', {
          symbolName: 'foo',
          lineHint: 1,
        }),
      ).rejects.toThrow('File not found')
    })
  })

  describe('findExactText', () => {
    it('should find unique text and return its range', async () => {
      const fileContent = 'const foo = 42;'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      const range = await resolver.findExactText('test.ts', 'foo = 42')

      expect(range.start.line).toBe(0)
      expect(range.start.character).toBe(6)
      expect(range.end.line).toBe(0)
      expect(range.end.character).toBe(14)
    })

    it('should correctly calculate positions for multi-line text', async () => {
      const fileContent = `function hello() {
  console.log("Hello");
}

function target() {
  return 42;
}`
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      const range = await resolver.findExactText(
        'test.ts',
        'function target() {\n  return 42;\n}',
      )

      expect(range.start.line).toBe(4)
      expect(range.start.character).toBe(0)
      expect(range.end.line).toBe(6)
      expect(range.end.character).toBe(1)
    })

    it('should throw error when text is not found', async () => {
      const fileContent = 'const foo = 42;'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      await expect(
        resolver.findExactText('test.ts', 'nonexistent'),
      ).rejects.toThrow('Text not found')
    })

    it('should throw error when text appears multiple times', async () => {
      const fileContent = 'foo foo foo'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      await expect(resolver.findExactText('test.ts', 'foo')).rejects.toThrow(
        'appears 3 times',
      )
    })

    it('should truncate long text in error message', async () => {
      const fileContent = 'short content'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      const longSearchText = 'a'.repeat(100)

      try {
        await resolver.findExactText('test.ts', longSearchText)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        const err = error as Error
        expect(err.message).toContain('...')
        expect(err.message.length).toBeLessThan(200)
      }
    })

    it('should handle text at the beginning of file', async () => {
      const fileContent = 'start of file content'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      const range = await resolver.findExactText('test.ts', 'start')

      expect(range.start.line).toBe(0)
      expect(range.start.character).toBe(0)
      expect(range.end.line).toBe(0)
      expect(range.end.character).toBe(5)
    })

    it('should handle text at the end of file', async () => {
      const fileContent = 'content end'
      const fs = createMockFileAccess({ 'test.ts': fileContent })
      const resolver = new SymbolResolver(fs)

      const range = await resolver.findExactText('test.ts', 'end')

      expect(range.start.line).toBe(0)
      expect(range.start.character).toBe(8)
      expect(range.end.line).toBe(0)
      expect(range.end.character).toBe(11)
    })
  })
})

describe('SymbolResolutionError', () => {
  it('should have correct name property', () => {
    const error = new SymbolResolutionError('mySymbol', 10, 'test reason')
    expect(error.name).toBe('SymbolResolutionError')
  })

  it('should store symbolName and lineHint', () => {
    const error = new SymbolResolutionError('mySymbol', 10, 'test reason')
    expect(error.symbolName).toBe('mySymbol')
    expect(error.lineHint).toBe(10)
  })

  it('should format message correctly', () => {
    const error = new SymbolResolutionError('mySymbol', 10, 'test reason')
    expect(error.message).toBe(
      "Could not find symbol 'mySymbol' at or near line 10. test reason",
    )
  })

  it('should be an instance of Error', () => {
    const error = new SymbolResolutionError('mySymbol', 10, 'test reason')
    expect(error).toBeInstanceOf(Error)
  })
})
