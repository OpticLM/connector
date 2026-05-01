/**
 * Hashline utilities for content-addressed line editing.
 *
 * Each line gets a compact 2-char hex hash derived from its content via CRC16.
 * This enables hash-verified line-range edits: if the file changed since
 * the last read, hashes won't match and the edit is rejected.
 * @internal
 */

// CRC16-CCITT lookup table (polynomial 0x1021)
const CRC16_TABLE = new Uint16Array(256)
for (let i = 0; i < 256; i++) {
  let crc = i << 8
  for (let j = 0; j < 8; j++) {
    crc = (crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)
  }
  CRC16_TABLE[i] = crc & 0xffff
}

/**
 * Computes a 2-char hex hash for a line of text using CRC16-CCITT.
 */
export function computeLineHash(line: string): string {
  let crc = 0xffff
  for (let i = 0; i < line.length; i++) {
    crc =
      ((crc << 8) & 0xffff) ^
      (CRC16_TABLE[((crc >> 8) ^ line.charCodeAt(i)) & 0xff] as number)
  }
  // Take lower byte → 2 hex chars
  return (crc & 0xff).toString(16).padStart(2, '0')
}

/**
 * A line with its 1-based line number and raw text content.
 */
export interface NumberedLine {
  /** 1-based line number in the original file */
  num: number
  /** Raw line text (no line ending) */
  text: string
}

/**
 * Splits file content into numbered lines.
 */
export function toNumberedLines(content: string): NumberedLine[] {
  return content.split(/\r?\n/).map((text, i) => ({ num: i + 1, text }))
}

/**
 * Formats single line as hashline output.
 *
 * Output format: `<1-based-line>:<2-char-hash>|<content>`
 */
export function toHashLine(line: NumberedLine): string {
  return `${line.num}:${computeLineHash(line.text)}|${line.text}`
}

/**
 * Formats numbered lines as hashline output.
 *
 * Output format: `<1-based-line>:<2-char-hash>|<content>`
 */
export function formatAsHashlines(lines: NumberedLine[]): string {
  return lines.map((l) => toHashLine(l)).join('\n')
}

/**
 * Parses a hashline like `3:a1|contents` into line number and hash.
 * @throws Error if the format is invalid
 */
export function parseHashlineRef(ref: string): { line: number; hash: string } {
  const match = ref.match(/^(\d+):([0-9a-f]{2})(?:\||$)/)
  if (!match?.[1] || !match[2]) {
    throw new Error(
      `Invalid hashline reference "${ref}". Expected format starting with: "<line>:<hash>" (e.g., "3:a1")`,
    )
  }
  return { line: parseInt(match[1], 10), hash: match[2] }
}

/**
 * Verifies that a line's computed hash matches the expected hash.
 * @returns true if the hash matches
 */
export function verifyLineHash(
  line: NumberedLine,
  expectedHash: string,
): boolean {
  return computeLineHash(line.text) === expectedHash
}
