/**
 * Infrastructure Interfaces for MCP LSP Driver SDK
 *
 * The SDK consumer (Plugin Developer) must implement these interfaces
 * to bridge the SDK to the specific IDE.
 */

import type { PendingEditOperation, UnifiedUri } from './types.js'

// ============================================================================
// File System Access (Required)
// ============================================================================

/**
 * Provides access to the file system for reading files.
 * Since the SDK is responsible for resolving FuzzyPosition to ExactPosition,
 * it needs direct access to read files from the disk.
 */
export interface FileAccessProvider {
  /**
   * Reads the content of a file from the disk (ignoring unsaved IDE buffers).
   * Used for symbol resolution and context retrieval.
   *
   * @param uri - The URI of the file to read
   * @returns The content of the file as a string
   * @throws Error if the file cannot be read
   */
  readFile(uri: UnifiedUri): Promise<string>

  /**
   * Read children in a directory, exluding git-ignored files, similar to Unix `ls` command
   * @param relativePath - The path to the folder to read
   * @returns Array of file/folder paths in the directory
   */
  readDirectory(relativePath: UnifiedUri): Promise<string[]>

  /**
   * Called by the driver to register a callback for file changes.
   * When provided, the files:// resources become subscribable.
   * The plugin should call the registered callback whenever a file changes.
   *
   * @param callback - The callback to invoke when a file changes
   */
  onFileChanged?(callback: (uri: UnifiedUri) => void): void
}

// ============================================================================
// Edit Provider (Required for Edits)
// ============================================================================

/**
 * Provides edit capabilities for applying changes to files.
 * At least one of the methods must be implemented.
 */
export interface EditProvider {
  /**
   * Applies edits directly without user interaction.
   * Use this when user approval is handled elsewhere or not needed.
   *
   * @param operation - The pending edit operation to apply
   * @returns true if applied successfully, false if failed
   */
  applyEdits?(operation: PendingEditOperation): Promise<boolean>

  /**
   * Displays a diff view or a confirmation dialog in the IDE.
   * The user decides whether to apply the edits or discard them.
   *
   * @param operation - The pending edit operation to preview
   * @returns true if applied, false if rejected/cancelled
   */
  previewAndApplyEdits?(operation: PendingEditOperation): Promise<boolean>
}
