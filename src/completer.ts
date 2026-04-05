import type { FileAccessProvider } from './interfaces.js'

/**
 * Creates a completion callback for file path auto-complete.
 * Splits the input into directory + prefix, reads the directory,
 * and returns entries matching the prefix.
 */
export function createFileCompleter(
  readDirectory: FileAccessProvider['readDirectory'],
): (value: string) => Promise<string[]> {
  return async (value: string): Promise<string[]> => {
    const lastSlash = value.lastIndexOf('/')
    const dir = lastSlash >= 0 ? value.slice(0, lastSlash) : ''
    const prefix = lastSlash >= 0 ? value.slice(lastSlash + 1) : value

    try {
      const entries = await readDirectory(dir || '.')
      const lowerPrefix = prefix.toLowerCase()
      return entries
        .filter((entry) => entry.toLowerCase().startsWith(lowerPrefix))
        .map((entry) => (dir ? `${dir}/${entry}` : entry))
    } catch {
      return []
    }
  }
}
