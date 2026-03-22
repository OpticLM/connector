import { describe, expect, it } from 'vitest'
import {
  computeLineHash,
  formatAsHashlines,
  parseHashlineRef,
  toNumberedLines,
  verifyLineHash,
} from './hashline.js'

describe('computeLineHash', () => {
  it('should produce consistent 2-char hex output', () => {
    expect(computeLineHash('line1')).toBe('99')
    expect(computeLineHash('line2')).toBe('fa')
    expect(computeLineHash('')).toBe('ff')
  })

  it('should be deterministic', () => {
    const hash1 = computeLineHash('hello world')
    const hash2 = computeLineHash('hello world')
    expect(hash1).toBe(hash2)
  })

  it('should produce different hashes for different content', () => {
    expect(computeLineHash('line1')).not.toBe(computeLineHash('line2'))
  })
})

describe('toNumberedLines', () => {
  it('should split content into 1-based numbered lines', () => {
    const lines = toNumberedLines('a\nb\nc')
    expect(lines).toEqual([
      { num: 1, text: 'a' },
      { num: 2, text: 'b' },
      { num: 3, text: 'c' },
    ])
  })

  it('should handle CRLF line endings', () => {
    const lines = toNumberedLines('a\r\nb\r\nc')
    expect(lines).toEqual([
      { num: 1, text: 'a' },
      { num: 2, text: 'b' },
      { num: 3, text: 'c' },
    ])
  })

  it('should handle single line', () => {
    const lines = toNumberedLines('hello')
    expect(lines).toEqual([{ num: 1, text: 'hello' }])
  })

  it('should handle empty content', () => {
    const lines = toNumberedLines('')
    expect(lines).toEqual([{ num: 1, text: '' }])
  })
})

describe('formatAsHashlines', () => {
  it('should format lines with line:hash|content pattern', () => {
    const lines = toNumberedLines('line1\nline2\nline3')
    const result = formatAsHashlines(lines)
    expect(result).toBe('1:99|line1\n2:fa|line2\n3:db|line3')
  })

  it('should preserve original line numbers for filtered lines', () => {
    const lines = toNumberedLines('a\nb\nc\nd\ne')
    const filtered = lines.filter((l) => l.num >= 2 && l.num <= 4)
    const result = formatAsHashlines(filtered)
    expect(result).toMatch(/^2:/)
    expect(result).toMatch(/\n3:/)
    expect(result).toMatch(/\n4:/)
  })
})

describe('parseHashlineRef', () => {
  it('should parse valid references', () => {
    expect(parseHashlineRef('3:a1')).toEqual({ line: 3, hash: 'a1' })
    expect(parseHashlineRef('42:ff')).toEqual({ line: 42, hash: 'ff' })
  })

  it('should throw on invalid format', () => {
    expect(() => parseHashlineRef('invalid')).toThrow(
      'Invalid hashline reference',
    )
    expect(() => parseHashlineRef('3:')).toThrow('Invalid hashline reference')
    expect(() => parseHashlineRef(':a1')).toThrow('Invalid hashline reference')
    expect(() => parseHashlineRef('3:abc')).toThrow(
      'Invalid hashline reference',
    )
  })
})

describe('verifyLineHash', () => {
  it('should return true for matching hash', () => {
    expect(verifyLineHash({ num: 1, text: 'line1' }, '99')).toBe(true)
  })

  it('should return false for mismatched hash', () => {
    expect(verifyLineHash({ num: 1, text: 'line1' }, 'ff')).toBe(false)
  })
})
