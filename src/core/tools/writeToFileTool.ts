import path from "path"
import delay from "delay"
import * as vscode from "vscode"

import { Task } from "../task/Task"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { formatResponse } from "../prompts/responses"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { RecordSource } from "../context-tracking/FileContextTrackerTypes"
import { fileExistsAtPath } from "../../utils/fs"
import { stripLineNumbers, everyLineHasLineNumbers } from "../../integrations/misc/extract-text"
import { getReadablePath } from "../../utils/path"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { detectCodeOmission, detectInefficientFileEdit } from "../../integrations/editor/detect-omission"
import { unescapeHtmlEntities } from "../../utils/text-normalization"

export async function writeToFileTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relPath: string | undefined = block.params.path
	let newContent: string | undefined = block.params.content
	let predictedLineCount: number | undefined = parseInt(block.params.line_count ?? "0")

	if (block.partial && (!relPath || newContent === undefined)) {
		// checking for newContent ensure relPath is complete
		// wait so we can determine if it's a new file or editing an existing file
		return
	}

	if (!relPath) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("write_to_file")
		pushToolResult(await cline.sayAndCreateMissingParamError("write_to_file", "path"))
		await cline.diffViewProvider.reset()
		return
	}

	if (newContent === undefined) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("write_to_file")
		pushToolResult(await cline.sayAndCreateMissingParamError("write_to_file", "content"))
		await cline.diffViewProvider.reset()
		return
	}

	const accessAllowed = cline.rooIgnoreController?.validateAccess(relPath)

	if (!accessAllowed) {
		await cline.say("rooignore_error", relPath)
		pushToolResult(formatResponse.toolError(formatResponse.rooIgnoreError(relPath)))
		return
	}

	// Check if file is write-protected
	const isWriteProtected = cline.rooProtectedController?.isWriteProtected(relPath) || false

	// Check if file exists using cached map or fs.access
	let fileExists: boolean

	if (cline.diffViewProvider.editType !== undefined) {
		fileExists = cline.diffViewProvider.editType === "modify"
	} else {
		const absolutePath = path.resolve(cline.cwd, relPath)
		fileExists = await fileExistsAtPath(absolutePath)
		cline.diffViewProvider.editType = fileExists ? "modify" : "create"
	}

	// pre-processing newContent for cases where weaker models might add artifacts like markdown codeblock markers (deepseek/llama) or extra escape characters (gemini)
	if (newContent.startsWith("```")) {
		// cline handles cases where it includes language specifiers like ```python ```js
		newContent = newContent.split("\n").slice(1).join("\n")
	}

	if (newContent.endsWith("```")) {
		newContent = newContent.split("\n").slice(0, -1).join("\n")
	}

	if (!cline.api.getModel().id.includes("claude")) {
		newContent = unescapeHtmlEntities(newContent)
	}

	// Determine if the path is outside the workspace
	const fullPath = relPath ? path.resolve(cline.cwd, removeClosingTag("path", relPath)) : ""
	const isOutsideWorkspace = isPathOutsideWorkspace(fullPath)

	const sharedMessageProps: ClineSayTool = {
		tool: fileExists ? "editedExistingFile" : "newFileCreated",
		path: getReadablePath(cline.cwd, removeClosingTag("path", relPath)),
		content: newContent,
		isOutsideWorkspace,
		isProtected: isWriteProtected,
	}

	try {
		if (block.partial) {
			// update gui message
			const partialMessage = JSON.stringify(sharedMessageProps)
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})

			// update editor
			if (!cline.diffViewProvider.isEditing) {
				// open the editor and prepare to stream content in
				await cline.diffViewProvider.open(relPath)
			}

			// editor is open, stream content in
			await cline.diffViewProvider.update(
				everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
				false,
			)

			return
		} else {
			if (predictedLineCount === undefined) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("write_to_file")

				// Calculate the actual number of lines in the content
				const actualLineCount = newContent.split("\n").length

				// Check if this is a new file or existing file
				const isNewFile = !fileExists

				// Check if diffStrategy is enabled
				const diffStrategyEnabled = !!cline.diffStrategy

				// Use more specific error message for line_count that provides guidance based on the situation
				await cline.say(
					"error",
					`Roo tried to use write_to_file${
						relPath ? ` for '${relPath.toPosix()}'` : ""
					} but the required parameter 'line_count' was missing or truncated after ${actualLineCount} lines of content were written. Retrying...`,
				)

				pushToolResult(
					formatResponse.toolError(
						formatResponse.lineCountTruncationError(actualLineCount, isNewFile, diffStrategyEnabled),
					),
				)
				await cline.diffViewProvider.revertChanges()
				return
			}

			cline.consecutiveMistakeCount = 0

			// if isEditingFile false, that means we have the full contents of the file already.
			// it's important to note how cline function works, you can't make the assumption that the block.partial conditional will always be called since it may immediately get complete, non-partial data. So cline part of the logic will always be called.
			// in other words, you must always repeat the block.partial logic here
			if (!cline.diffViewProvider.isEditing) {
				// show gui message before showing edit animation
				const partialMessage = JSON.stringify(sharedMessageProps)
				await cline.ask("tool", partialMessage, true).catch(() => {}) // sending true for partial even though it's not a partial, cline shows the edit row before the content is streamed into the editor
				await cline.diffViewProvider.open(relPath)
			}

			await cline.diffViewProvider.update(
				everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
				true,
			)

			await delay(300) // wait for diff view to update
			cline.diffViewProvider.scrollToFirstDiff()

			// Check for code omissions before proceeding
			if (detectCodeOmission(cline.diffViewProvider.originalContent || "", newContent, predictedLineCount)) {
				if (cline.diffStrategy) {
					await cline.diffViewProvider.revertChanges()

					pushToolResult(
						formatResponse.toolError(
							`Content appears to be truncated (file has ${
								newContent.split("\n").length
							} lines but was predicted to have ${predictedLineCount} lines), and found comments indicating omitted code (e.g., '// rest of code unchanged', '/* previous code */'). Please provide the complete file content without any omissions if possible, or otherwise use the 'apply_diff' tool to apply the diff to the original file.`,
						),
					)
					return
				} else {
					vscode.window
						.showWarningMessage(
							"Potential code truncation detected. cline happens when the AI reaches its max output limit.",
							"Follow cline guide to fix the issue",
						)
						.then((selection) => {
							if (selection === "Follow cline guide to fix the issue") {
								vscode.env.openExternal(
									vscode.Uri.parse(
										"https://github.com/cline/cline/wiki/Troubleshooting-%E2%80%90-Cline-Deleting-Code-with-%22Rest-of-Code-Here%22-Comments",
									),
								)
							}
						})
				}
			}

			// Check for inefficient file editing patterns
			let inefficientEditSuggestion = ""
			if (fileExists && cline.diffViewProvider.originalContent) {
				const inefficientEdit = detectInefficientFileEdit(cline.diffViewProvider.originalContent, newContent)
				if (inefficientEdit.isInefficient) {
					// Show warning but don't block the operation
					vscode.window
						.showWarningMessage(
							`Inefficient file editing detected: Only ${Math.round((inefficientEdit.changeRatio || 0) * 100)}% of the file changed. Consider using targeted editing tools for better efficiency.`,
							"Learn More",
						)
						.then((selection) => {
							if (selection === "Learn More") {
								vscode.env.openExternal(
									vscode.Uri.parse(
										"https://github.com/RooCodeInc/Roo-Code/wiki/Efficient-File-Editing",
									),
								)
							}
						})

					// Prepare suggestion message to append to the result
					inefficientEditSuggestion = `\n\n⚠️ EFFICIENCY NOTICE: This write_to_file operation modified only ${Math.round((inefficientEdit.changeRatio || 0) * 100)}% of the file content.\n\n${inefficientEdit.suggestion}\n\nUsing targeted editing tools would be more efficient and create smaller, easier-to-review diffs.`
				}
			}

			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: fileExists ? undefined : newContent,
				diff: fileExists
					? formatResponse.createPrettyPatch(relPath, cline.diffViewProvider.originalContent, newContent)
					: undefined,
			} satisfies ClineSayTool)

			const didApprove = await askApproval("tool", completeMessage, undefined, isWriteProtected)

			if (!didApprove) {
				await cline.diffViewProvider.revertChanges()
				return
			}

			// Call saveChanges to update the DiffViewProvider properties
			await cline.diffViewProvider.saveChanges()

			// Track file edit operation
			if (relPath) {
				await cline.fileContextTracker.trackFileContext(relPath, "roo_edited" as RecordSource)
			}

			cline.didEditFile = true // used to determine if we should wait for busy terminal to update before sending api request

			// Get the formatted response message
			const message = await cline.diffViewProvider.pushToolWriteResult(cline, cline.cwd, !fileExists)

			pushToolResult(message + inefficientEditSuggestion)

			await cline.diffViewProvider.reset()

			return
		}
	} catch (error) {
		await handleError("writing file", error)
		await cline.diffViewProvider.reset()
		return
	}
}
