/**
 * Smart Resolver Logic for MCP LSP Driver SDK
 *
 * This is the internal engine of the SDK. It translates the LLM's imprecise
 * instructions into precise coordinates.
 */

import type { FileAccessProvider } from './interfaces.js'
import type { ExactPosition, FuzzyPosition, UnifiedUri } from './types.js'

/**
 * Configuration options for the SymbolResolver.
 */
export interface ResolverConfig {
  /**
   * Number of lines to scan above and below the lineHint if the symbol
   * is not found at the exact line. Defaults to 2.
   */
  lineSearchRadius?: number
}

/**
 * Error thrown when a symbol cannot be resolved.
 */
export class SymbolResolutionError extends Error {
  constructor(
    public readonly symbolName: string,
    public readonly lineHint: number,
    public readonly reason: string,
  ) {
    super(
      `Could not find symbol '${symbolName}' at or near line ${lineHint}. ${reason}`,
    )
    this.name = 'SymbolResolutionError'
  }
}

/**
 * The SymbolResolver translates fuzzy positions (as provided by an LLM)
 * into exact positions that can be used by the IDE.
 *
 * Algorithm:
 * 1. Read file content via FileAccessProvider.
 * 2. Split content into lines.
 * 3. Target the lineHint (converting 1-based to 0-based).
 * 4. Search for symbolName in that line.
 *    - If orderHint is 0, find first occurrence.
 *    - If orderHint is N, find Nth occurrence.
 * 5. Robustness Fallback:
 *    - If the line is empty or symbol not found at lineHint,
 *      scan +/- lineSearchRadius lines to handle minor line shifts.
 * 6. Return ExactPosition (line, character start index).
 */
export class SymbolResolver {
  private readonly lineSearchRadius: number

  constructor(
    private readonly fs: FileAccessProvider,
    config?: ResolverConfig,
  ) {
    this.lineSearchRadius = config?.lineSearchRadius ?? 2
  }

  /**
   * Resolves a fuzzy position to an exact position.
   *
   * @param uri - The URI of the file
   * @param fuzzy - The fuzzy position provided by the LLM
   * @returns The exact position in the file
   * @throws SymbolResolutionError if the symbol cannot be found
   */
  async resolvePosition(
    uri: UnifiedUri,
    fuzzy: FuzzyPosition,
  ): Promise<ExactPosition> {
    const content = await this.fs.readFile(uri)
    const lines = content.split(/\r?\n/)

    // Convert 1-based lineHint to 0-based index
    const targetLine = fuzzy.lineHint - 1
    const orderHint = fuzzy.orderHint ?? 0

    // First, try to find the symbol at the exact line
    const exactResult = this.findSymbolInLine(
      lines[targetLine],
      fuzzy.symbolName,
      orderHint,
    )
    if (exactResult !== null) {
      return { line: targetLine, character: exactResult }
    }

    // Fallback: scan nearby lines
    for (let offset = 1; offset <= this.lineSearchRadius; offset++) {
      // Check line above
      const lineAbove = targetLine - offset
      if (lineAbove >= 0) {
        const resultAbove = this.findSymbolInLine(
          lines[lineAbove],
          fuzzy.symbolName,
          orderHint,
        )
        if (resultAbove !== null) {
          return { line: lineAbove, character: resultAbove }
        }
      }

      // Check line below
      const lineBelow = targetLine + offset
      if (lineBelow < lines.length) {
        const resultBelow = this.findSymbolInLine(
          lines[lineBelow],
          fuzzy.symbolName,
          orderHint,
        )
        if (resultBelow !== null) {
          return { line: lineBelow, character: resultBelow }
        }
      }
    }

    // Symbol not found anywhere in the search range
    throw new SymbolResolutionError(
      fuzzy.symbolName,
      fuzzy.lineHint,
      `Please verify the file content and try again. Searched lines ${Math.max(1, fuzzy.lineHint - this.lineSearchRadius)} to ${Math.min(lines.length, fuzzy.lineHint + this.lineSearchRadius)}.`,
    )
  }

  /**
   * Finds the Nth occurrence of a symbol in a line.
   *
   * @param line - The line to search in (may be undefined if out of bounds)
   * @param symbolName - The symbol to find
   * @param orderHint - Which occurrence to find (0-based)
   * @returns The character offset of the symbol, or null if not found
   */
  private findSymbolInLine(
    line: string | undefined,
    symbolName: string,
    orderHint: number,
  ): number | null {
    if (line === undefined || line.length === 0) {
      return null
    }

    let currentIndex = 0
    let occurrenceCount = 0

    while (currentIndex < line.length) {
      const foundIndex = line.indexOf(symbolName, currentIndex)
      if (foundIndex === -1) {
        break
      }

      if (occurrenceCount === orderHint) {
        return foundIndex
      }

      occurrenceCount++
      currentIndex = foundIndex + 1
    }

    return null
  }
}
