import type { Task } from "../../task/Task"

/**
 * Retrieves file context including recently modified files.
 * Clears the recently modified files list after retrieval.
 *
 * @param cline - The current task instance
 * @returns Object containing recently modified files or empty object
 */
export function getFileContext(cline: Task) {
	try {
		const recentlyModifiedFiles = cline.fileContextTracker?.getAndClearRecentlyModifiedFiles() || []
		if (recentlyModifiedFiles.length > 0) {
			return {
				recentlyModified: {
					file: recentlyModifiedFiles.map((p: string) => ({ "@path": p })),
				},
			}
		}
		return {}
	} catch (error) {
		console.warn('Failed to get file context:', error)
		return {}
	}
}
