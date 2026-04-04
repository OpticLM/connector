/**
 * Zod schemas for MCP tool inputs and outputs.
 * @internal
 */

import { z } from 'zod'

const uri = z.string().describe('The relative file path')

const symbol_name = z.string().describe('The text of the symbol to find')

const line_hint = z
  .number()
  .int()
  .positive()
  .describe('Approximate 1-based line number where the symbol is expected')

const order_hint = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe(
    '0-based index of which occurrence to target if symbol appears multiple times',
  )

export const FuzzyPositionSchema = z.object({
  uri,
  symbol_name,
  line_hint,
  order_hint,
})

export const ApplyEditSchema = z.object({
  uri,
  start_hash: z
    .string()
    .describe(
      'Start line reference from hashline output, format "<line>:<hash>" (e.g., "3:a1"). ' +
        'Copy this exactly from the files:// resource output.',
    ),
  end_hash: z
    .string()
    .optional()
    .describe(
      'End line reference for multi-line edits (e.g., "5:0e"). ' +
        'The range is inclusive. Omit for single-line edits (defaults to start_hash).',
    ),
  replace_text: z
    .string()
    .describe('The new text to replace the entire line range with'),
  description: z.string().describe('Rationale for the edit'),
})

export const CallHierarchySchema = z.object({
  uri: z.string().describe('The file URI or path'),
  symbol_name,
  line_hint,
  order_hint,
  direction: z
    .enum(['incoming', 'outgoing'])
    .describe('Direction of the call hierarchy'),
})

const query = z.string().describe('The search query')

const case_sensitive = z
  .boolean()
  .default(false)
  .describe('Whether the search is case-sensitive')

const exact_match = z
  .boolean()
  .default(false)
  .describe('Whether to match exact words only')

const regex_mode = z
  .boolean()
  .default(false)
  .describe('Whether the query is a regular expression')

export const GlobalFindSchema = z.object({
  query,
  case_sensitive,
  exact_match,
  regex_mode,
})

export const AddLinkSchema = z.object({
  path: z.string().describe('The path to the document to modify'),
  pattern: z
    .string()
    .describe('The text pattern to find and replace with a link'),
  link_to: z.string().describe('The target URI the link should point to'),
})

export const FileReferencesSchema = z.object({
  uri,
})

export const GetFrontmatterStructureSchema = z.object({
  property: z.string().describe('The frontmatter property name to search for'),
  path: z
    .string()
    .optional()
    .describe(
      'Optional path to limit the search to a specific document. If not provided, searches all documents.',
    ),
})

export const SetFrontmatterSchema = z.object({
  path: z.string().describe('The path to the document to modify'),
  property: z.string().describe('The frontmatter property name to set'),
  value: z
    .union([
      z.string(),
      z.array(z.string()),
      z.number(),
      z.array(z.number()),
      z.boolean(),
      z.array(z.boolean()),
      z.null(),
    ])
    .describe(
      'The value to set. Can be a string, number, boolean, array of these types, or null to remove.',
    ),
})
