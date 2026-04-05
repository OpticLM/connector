import z from 'zod'

export const GetDiagnosticsSchema = z.object({
  path: z.string().describe('The relative file path'),
})

export const GetOutlineSchema = z.object({
  path: z.string().describe('The relative file path'),
})

export const RequestFileSchema = z.object({
  path: z.string().describe('The relative file or directory path'),
  pattern: z
    .string()
    .optional()
    .describe(
      'Optional regex pattern to filter lines (matches raw line text, not the hash prefix). ' +
        'Line numbers in the output are always the original file line numbers.',
    ),
  start_line: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional 1-based start line for range filtering'),
  end_line: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Optional 1-based end line for range filtering (inclusive). Defaults to start_line if omitted.',
    ),
})

export const GetOutlinksSchema = z.object({
  path: z.string().describe('The relative file path'),
})

export const GetBacklinksSchema = z.object({
  path: z.string().describe('The relative file path'),
})

export const GetFrontmatterSchema = z.object({
  path: z.string().describe('The relative file path'),
})
