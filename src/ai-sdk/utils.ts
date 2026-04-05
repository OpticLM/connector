import type z from 'zod'
import { normalizeUri } from '../formatting.js'
import { computeLineHash, parseHashlineRef } from '../hashline.js'
import type { FileAccessProvider } from '../interfaces.js'
import type { ApplyEditSchema } from '../schemas.js'

export const dryRunEdit = async (
  params: z.infer<typeof ApplyEditSchema>,
  readFile: FileAccessProvider['readFile'],
) => {
  const uri = normalizeUri(params.uri)

  const startRef = parseHashlineRef(params.start_hash)
  const endRef = params.end_hash ? parseHashlineRef(params.end_hash) : startRef

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
  const startActualHash = computeLineHash(startLineText)
  if (startActualHash !== startRef.hash) {
    throw new Error(
      `Hash mismatch at line ${startRef.line}: expected "${startRef.hash}", got "${startActualHash}". File has changed since last read.`,
    )
  }

  const endLineText = allLines[endRef.line - 1] as string
  const endActualHash = computeLineHash(endLineText)
  if (endActualHash !== endRef.hash) {
    throw new Error(
      `Hash mismatch at line ${endRef.line}: expected "${endRef.hash}", got "${endActualHash}". File has changed since last read.`,
    )
  }

  const linesBefore = allLines.slice(0, startRef.line - 1)
  const linesAfter = allLines.slice(endRef.line)
  const updated = [...linesBefore, params.replace_text, ...linesAfter].join(
    '\n',
  )

  return { content, updated }
}
