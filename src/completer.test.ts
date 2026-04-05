import { describe, expect, it, vi } from 'vitest'
import { createFileCompleter } from './completer.js'

describe('createFileCompleter', () => {
  it('returns entries matching prefix from root', async () => {
    const readDirectory = vi.fn(async () => ['foo.ts', 'bar.ts', 'baz.ts'])
    const completer = createFileCompleter(readDirectory)

    const result = await completer('ba')

    expect(result).toEqual(['bar.ts', 'baz.ts'])
    expect(readDirectory).toHaveBeenCalledWith('.')
  })

  it('reads directory from path prefix and prepends it to results', async () => {
    const readDirectory = vi.fn(async () => ['index.ts', 'utils.ts'])
    const completer = createFileCompleter(readDirectory)

    const result = await completer('src/i')

    expect(result).toEqual(['src/index.ts'])
    expect(readDirectory).toHaveBeenCalledWith('src')
  })

  it('returns all entries when prefix is empty', async () => {
    const readDirectory = vi.fn(async () => ['a.ts', 'b.ts'])
    const completer = createFileCompleter(readDirectory)

    const result = await completer('')

    expect(result).toEqual(['a.ts', 'b.ts'])
    expect(readDirectory).toHaveBeenCalledWith('.')
  })

  it('is case-insensitive when matching prefix', async () => {
    const readDirectory = vi.fn(async () => ['Foo.ts', 'Bar.ts'])
    const completer = createFileCompleter(readDirectory)

    const result = await completer('fo')

    expect(result).toEqual(['Foo.ts'])
  })

  it('returns empty array when readDirectory throws', async () => {
    const readDirectory = vi.fn(async () => {
      throw new Error('Permission denied')
    })
    const completer = createFileCompleter(readDirectory)

    const result = await completer('src/')

    expect(result).toEqual([])
  })

  it('handles nested paths correctly', async () => {
    const readDirectory = vi.fn(async () => ['types.ts', 'tools.ts'])
    const completer = createFileCompleter(readDirectory)

    const result = await completer('src/ai-sdk/ty')

    expect(result).toEqual(['src/ai-sdk/types.ts'])
    expect(readDirectory).toHaveBeenCalledWith('src/ai-sdk')
  })

  it('returns empty array when no entries match prefix', async () => {
    const readDirectory = vi.fn(async () => ['foo.ts', 'bar.ts'])
    const completer = createFileCompleter(readDirectory)

    const result = await completer('xyz')

    expect(result).toEqual([])
  })
})
