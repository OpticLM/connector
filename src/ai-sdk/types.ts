import type { InferUITool } from 'ai'
import type {
  addLink,
  applyEdit,
  callHierarchy,
  findFileReferences,
  findReferences,
  getBacklinks,
  getDiagnostics,
  getFrontmatter,
  getFrontmatterStructure,
  getLinkStructure,
  getOutline,
  getOutlinks,
  getWorkspaceDiagnostics,
  globalFind,
  gotoDefinition,
  gotoTypeDefinition,
  requestFile,
  setFrontmatter,
} from './tools.js'

export const GotoDefinitionName = 'goto_definition'
export const GotoTypeDefinitionName = 'goto_type_definition'
export const FindReferencesName = 'find_references'
export const CallHierarchyName = 'call_hierarchy'
export const FindFileReferencesName = 'find_file_references'
export const ApplyEditName = 'apply_edit'
export const GetDiagnosticsName = 'get_diagnostics'
export const GetWorkspaceDiagnosticsName = 'get_workspace_diagnostics'
export const GetOutlineName = 'get_outline'
export const RequestFileName = 'request_file'
export const GetOutlinksName = 'get_outlinks'
export const GetBacklinksName = 'get_backlinks'
export const GetLinkStructureName = 'get_link_structure'
export const AddLinkName = 'add_link'
export const GetFrontmatterName = 'get_frontmatter'
export const GetFrontmatterStructureName = 'get_frontmatter_structure'
export const SetFrontmatterName = 'set_frontmatter'
export const GlobalFindName = 'global_find'

export type GotoDefinitionTool = InferUITool<ReturnType<typeof gotoDefinition>>
export type GotoTypeDefinitionTool = InferUITool<
  ReturnType<typeof gotoTypeDefinition>
>
export type FindReferencesTool = InferUITool<ReturnType<typeof findReferences>>
export type CallHierarchyTool = InferUITool<ReturnType<typeof callHierarchy>>
export type FindFileReferencesTool = InferUITool<
  ReturnType<typeof findFileReferences>
>
export type ApplyEditTool = InferUITool<ReturnType<typeof applyEdit>>
export type GetDiagnosticsTool = InferUITool<ReturnType<typeof getDiagnostics>>
export type GetWorkspaceDiagnosticsTool = InferUITool<
  ReturnType<typeof getWorkspaceDiagnostics>
>
export type GetOutlineTool = InferUITool<ReturnType<typeof getOutline>>
export type RequestFileTool = InferUITool<ReturnType<typeof requestFile>>
export type GetOutlinksTool = InferUITool<ReturnType<typeof getOutlinks>>
export type GetBacklinksTool = InferUITool<ReturnType<typeof getBacklinks>>
export type GetLinkStructureTool = InferUITool<
  ReturnType<typeof getLinkStructure>
>
export type AddLinkTool = InferUITool<ReturnType<typeof addLink>>
export type GetFrontmatterTool = InferUITool<ReturnType<typeof getFrontmatter>>
export type GetFrontmatterStructureTool = InferUITool<
  ReturnType<typeof getFrontmatterStructure>
>
export type SetFrontmatterTool = InferUITool<ReturnType<typeof setFrontmatter>>
export type GlobalFindTool = InferUITool<ReturnType<typeof globalFind>>

/**
 * Full set of typed tools provided by the connector.
 */
export interface ConnectorTools {
  [GotoDefinitionName]: GotoDefinitionTool
  [GotoTypeDefinitionName]: GotoTypeDefinitionTool
  [FindReferencesName]: FindReferencesTool
  [CallHierarchyName]: CallHierarchyTool
  [FindFileReferencesName]: FindFileReferencesTool
  [ApplyEditName]: ApplyEditTool
  [GetDiagnosticsName]: GetDiagnosticsTool
  [GetWorkspaceDiagnosticsName]: GetWorkspaceDiagnosticsTool
  [GetOutlineName]: GetOutlineTool
  [RequestFileName]: RequestFileTool
  [GetOutlinksName]: GetOutlinksTool
  [GetBacklinksName]: GetBacklinksTool
  [GetLinkStructureName]: GetLinkStructureTool
  [AddLinkName]: AddLinkTool
  [GetFrontmatterName]: GetFrontmatterTool
  [GetFrontmatterStructureName]: GetFrontmatterStructureTool
  [SetFrontmatterName]: SetFrontmatterTool
  [GlobalFindName]: GlobalFindTool
}
