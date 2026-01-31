/**
 * Zod schemas for MCP tool inputs and outputs.
 * @internal
 */

import * as z from 'zod/mini'

const uri = z.string().check(z.describe('The relative file path'))
const symbol_name = z
  .string()
  .check(z.describe('The text of the symbol to find'))

const line_hint = z
  .number()
  .check(
    z.int(),
    z.positive(),
    z.describe('Approximate 1-based line number where the symbol is expected'),
  )

const order_hint = z
  ._default(z.optional(z.number().check(z.int(), z.minimum(0))), 0)
  .check(
    z.describe(
      '0-based index of which occurrence to target if symbol appears multiple times',
    ),
  )

export const FuzzyPositionSchema = z.object({
  uri,
  symbol_name,
  line_hint,
  order_hint,
})

export const ApplyEditSchema = z.object({
  uri,
  search_text: z
    .string()
    .check(
      z.describe('Exact text to replace (must exist uniquely in the file)'),
    ),
  replace_text: z.string().check(z.describe('New text to insert')),
  description: z.string().check(z.describe('Rationale for the edit')),
})

export const CallHierarchySchema = z.object({
  uri: z.string().check(z.describe('The file URI or path')),
  symbol_name,
  line_hint,
  order_hint,
  direction: z
    .enum(['incoming', 'outgoing'])
    .check(z.describe('Direction of the call hierarchy')),
})

const query = z.string().check(z.describe('The search query'))

const case_sensitive = z
  ._default(z.optional(z.boolean()), false)
  .check(z.describe('Whether the search is case-sensitive'))

const exact_match = z
  ._default(z.optional(z.boolean()), false)
  .check(z.describe('Whether to match exact words only'))

const regex_mode = z
  ._default(z.optional(z.boolean()), false)
  .check(z.describe('Whether the query is a regular expression'))

export const GlobalFindSchema = z.object({
  query,
  case_sensitive,
  exact_match,
  regex_mode,
})

export const GlobalReplaceSchema = z.object({
  query,
  case_sensitive,
  exact_match,
  regex_mode,
  replace_with: z.string().check(z.describe('The replacement text')),
})

export const AddLinkSchema = z.object({
  path: z.string().check(z.describe('The path to the document to modify')),
  pattern: z
    .string()
    .check(z.describe('The text pattern to find and replace with a link')),
  link_to: z
    .string()
    .check(z.describe('The target URI the link should point to')),
})
