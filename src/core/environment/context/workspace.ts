import path from "path"
import os from "os"

import { listFiles } from "../../../services/glob/list-files"
import { arePathsEqual } from "../../../utils/path"
import { formatResponse } from "../../prompts/responses"
import type { Task } from "../../task/Task"

/**
 * Retrieves workspace context including directory structure and file listings.
 * Handles desktop directories specially and respects workspace file limits.
 *
 * @param cline - The current task instance
 * @param includeFileDetails - Whether to include detailed file listings
 * @returns Object containing workspace information or empty object
 */
export async function getWorkspaceContext(cline: Task, includeFileDetails: boolean) {
	try {
		if (!includeFileDetails) {
			return {}
		}

		const state = await cline.providerRef.deref()?.getState()
		const { maxWorkspaceFiles = 200, showRooIgnoredFiles = true } = state ?? {}

		let isDesktop = false
		try {
			isDesktop = arePathsEqual(cline.cwd, path.join(os.homedir(), "Desktop"))
		} catch (error) {
			console.warn('Failed to check if current directory is Desktop:', error)
		}

		const workspaceData: {
			"@directory": string
			note?: string
			file?: Array<{ "@path": string }>
			directory?: Array<{ "@path": string }>
		} = { "@directory": cline.cwd.toPosix() }

		if (isDesktop) {
			workspaceData.note = "Desktop files not shown automatically. Use list_files to explore if needed."
		} else if (maxWorkspaceFiles === 0) {
			workspaceData.note = "Workspace files context disabled. Use list_files to explore if needed."
		} else {
			try {
				const [files, didHitLimit] = await listFiles(cline.cwd, true, maxWorkspaceFiles)
				
				let formattedFilesList = ''
				try {
					formattedFilesList = formatResponse.formatFilesList(
						cline.cwd,
						files,
						didHitLimit,
						cline.rooIgnoreController,
						showRooIgnoredFiles,
					)
				} catch (error) {
					console.warn('Failed to format files list:', error)
					return { workspace: workspaceData }
				}

				if (formattedFilesList && formattedFilesList !== "No files found.") {
					const fileLines = formattedFilesList.split("\n").filter((line) => line.trim() !== "")
					const fileObjects: Array<{ "@path": string }> = []
					const dirObjects: Array<{ "@path": string }> = []

					fileLines.forEach((line) => {
						try {
							if (line.endsWith("/")) {
								dirObjects.push({ "@path": line })
							} else if (!line.includes("File list truncated")) {
								fileObjects.push({ "@path": line })
							}
						} catch (error) {
							console.warn(`Failed to process file line: ${line}`, error)
						}
					})

					if (fileObjects.length > 0) workspaceData.file = fileObjects
					if (dirObjects.length > 0) workspaceData.directory = dirObjects
					if (didHitLimit) {
						workspaceData.note =
							"File list truncated. Use list_files on specific subdirectories if you need to explore further."
					}
				}
			} catch (error) {
				console.warn('Failed to list workspace files:', error)
				workspaceData.note = "Failed to load workspace files. Use list_files to explore if needed."
			}
		}

		return { workspace: workspaceData }
	} catch (error) {
		console.warn('Failed to get workspace context:', error)
		return {}
	}
}
