import type z from 'zod'
import { normalizeUri } from '../formatting.js'
import { parseHashlineRef, toHashLine } from '../hashline.js'
import type { FileAccessProvider } from '../interfaces.js'
import type { ApplyEditSchema } from '../schemas.js'

export const dryRunEdit = async (
  params: z.infer<typeof ApplyEditSchema>,
  readFile: FileAccessProvider['readFile'],
) => {
  const uri = normalizeUri(params.uri)

  const startRef = parseHashlineRef(params.start_line)
  const endRef = params.end_line ? parseHashlineRef(params.end_line) : startRef

  const content = await readFile(uri)
  const allLines = content.split(/\r?\n/)

  if (startRef.line < 1 || startRef.line > allLines.length) {
    throw new Error(
      `Start line ${startRef.line} is out of range (file has ${allLines.length} lines)`,
    )
  }
  if (endRef.line < startRef.line || endRef.line > allLines.length) {
    throw new Error(
      `End line ${endRef.line} is out of range (file has ${allLines.length} lines)`,
    )
  }

  const startLineText = allLines[startRef.line - 1] as string
  const expectedStartLine = toHashLine({
    num: startRef.line,
    text: startLineText,
  })
  if (expectedStartLine !== params.start_line) {
    throw new Error(
      `Hash mismatch at line ${startRef.line}. Expected: ${expectedStartLine}. Got ${params.start_line}. File has changed since last read.`,
    )
  }

  const endLineText = allLines[endRef.line - 1] as string
  const expectedEndLine = toHashLine({ num: endRef.line, text: endLineText })
  if (expectedEndLine !== (params.end_line ?? params.start_line)) {
    throw new Error(
      `Hash mismatch at line ${endRef.line}. Expected: ${expectedEndLine}. Got ${params.end_line}. File has changed since last read.`,
    )
  }

  const linesBefore = allLines.slice(0, startRef.line - 1)
  const linesAfter = allLines.slice(endRef.line)
  const updated = [...linesBefore, params.replace_text, ...linesAfter].join(
    '\n',
  )

  return { content, updated }
}
