/**
 * Infrastructure Interfaces
 */

import type { EditResult, PendingEditOperation, UnifiedUri } from './types.js'

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
}

/**
 * Provides edit capabilities for applying changes to files.
 */
export interface EditProvider {
  /**
   * Applies edits.
   *
   * @param operation - The pending edit operation to apply
   * @returns true if applied successfully, false if failed
   */
  applyEdits(operation: PendingEditOperation): Promise<EditResult>
}
