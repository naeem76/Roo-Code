import path from "path"
import * as vscode from "vscode"

import type { Task } from "../../task/Task"

/**
 * Retrieves VSCode editor context including visible files and open tabs.
 * Filters files based on .rooignore rules and applies workspace limits.
 *
 * @param cline - The current task instance
 * @returns Object containing visible files and open tabs information
 */
export async function getVscodeEditorContext(cline: Task) {
	const state = await cline.providerRef.deref()?.getState()
	const { maxWorkspaceFiles = 200 } = state ?? {}

	// Get visible files in the editor
	const visibleFilePaths = vscode.window.visibleTextEditors
		?.map((editor: vscode.TextEditor) => editor.document?.uri?.fsPath)
		.filter(Boolean)
		.map((absolutePath: string) => path.relative(cline.cwd, absolutePath))
		.slice(0, maxWorkspaceFiles) || []

	const allowedVisibleFiles = cline.rooIgnoreController
		? cline.rooIgnoreController.filterPaths(visibleFilePaths)
		: visibleFilePaths.map((p: string) => p.toPosix())

	const visibleFiles =
		allowedVisibleFiles?.length > 0
			? {
					file: allowedVisibleFiles.map((p: string) => ({ "@path": p })),
				}
			: undefined

	// Get open tabs (high-frequency data - using compact representation)
	const { maxOpenTabsContext } = state ?? {}
	const maxTabs = maxOpenTabsContext ?? 20
	const openTabPaths = vscode.window.tabGroups.all
		.flatMap((group: vscode.TabGroup) => group.tabs)
		.map((tab: vscode.Tab) => (tab.input as vscode.TabInputText)?.uri?.fsPath)
		.filter(Boolean)
		.map((absolutePath: string) => path.relative(cline.cwd, absolutePath).toPosix())
		.slice(0, maxTabs)

	const allowedOpenTabs = cline.rooIgnoreController
		? cline.rooIgnoreController.filterPaths(openTabPaths)
		: openTabPaths

	const openTabs =
		allowedOpenTabs?.length > 0
			? {
					tabs: allowedOpenTabs.map((p: string) => ({ "@path": p })),
				}
			: undefined

	return { visibleFiles, openTabs }
}
