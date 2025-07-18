import { ToolProgressStatus } from "@roo-code/types"

import { ToolUse, DiffStrategy, DiffResult, DiffItem } from "../../../shared/tools"
import { Task } from "../../task/Task"
import { ProviderSettings } from "@roo-code/types"

/**
 * ApplyModelDiffStrategy uses a separate "apply" model to generate and apply diffs
 * instead of having the main chat model generate the diff format.
 * This reduces token consumption and improves reliability for file edits.
 */
export class ApplyModelDiffStrategy implements DiffStrategy {
	private task: Task
	private fuzzyThreshold: number

	constructor(task: Task, fuzzyThreshold?: number) {
		this.task = task
		this.fuzzyThreshold = fuzzyThreshold ?? 1.0
	}

	getName(): string {
		return "ApplyModel"
	}

	getToolDescription(args: { cwd: string; toolOptions?: { [key: string]: string } }): string {
		return `## apply_diff

Description: Request to apply targeted modifications to an existing file using an AI-powered apply model. This tool uses a separate specialized model to understand your intent and apply changes directly to the file content, reducing the need for precise diff formatting and improving reliability.

The apply model will analyze the original file content and your change description to generate the appropriate modifications automatically.

Parameters:
- path: (required) The path of the file to modify (relative to the current workspace directory ${args.cwd})
- changes: (required) A description of the changes you want to make to the file. Be specific about what you want to change, add, or remove.

Usage:
<apply_diff>
<path>File path here</path>
<changes>
Describe the changes you want to make to the file. For example:
- "Add a new function called calculateTotal that takes an array of numbers and returns their sum"
- "Update the existing validateUser function to also check for email format"
- "Remove the deprecated legacy_function and replace its usage with new_function"
- "Add error handling to the database connection code"
</changes>
</apply_diff>

Example:

<apply_diff>
<path>src/utils.ts</path>
<changes>
Add a new function called formatCurrency that takes a number and returns a formatted currency string with dollar sign and two decimal places. Place it after the existing formatDate function.
</changes>
</apply_diff>`
	}

	async applyDiff(
		originalContent: string,
		diffContent: string | DiffItem[],
		_paramStartLine?: number,
		_paramEndLine?: number,
	): Promise<DiffResult> {
		// Handle array-based input (from multi-file operations)
		if (Array.isArray(diffContent)) {
			// For array input, combine all change descriptions
			const combinedChanges = diffContent.map(item => item.content).join('\n\n')
			return this.applyChangesWithModel(originalContent, combinedChanges)
		}

		// Handle string-based input (legacy and single operations)
		return this.applyChangesWithModel(originalContent, diffContent)
	}

	private async applyChangesWithModel(originalContent: string, changeDescription: string): Promise<DiffResult> {
		try {
			// Get apply model configuration from task settings
			const applyModelConfig = this.getApplyModelConfig()
			if (!applyModelConfig.enabled) {
				return {
					success: false,
					error: "Apply model is not enabled. Please configure an apply model in settings."
				}
			}

			// Create a prompt for the apply model
			const prompt = this.createApplyPrompt(originalContent, changeDescription)

			// Call the apply model to generate the modified content
			const modifiedContent = await this.callApplyModel(prompt, applyModelConfig)

			// Validate that the content was actually changed
			if (modifiedContent === originalContent) {
				return {
					success: false,
					error: "Apply model returned unchanged content. The requested changes may not be applicable or clear enough."
				}
			}

			return {
				success: true,
				content: modifiedContent
			}
		} catch (error) {
			return {
				success: false,
				error: `Apply model failed: ${error instanceof Error ? error.message : String(error)}`
			}
		}
	}

	private getApplyModelConfig() {
		// Get apply model configuration from task's provider settings
		// For now, we'll use a placeholder implementation
		// In the full implementation, this would access the provider settings
		return {
			enabled: false, // Will be updated when provider integration is complete
			provider: undefined,
			modelId: undefined,
			apiKey: undefined,
			baseUrl: undefined,
			temperature: 0.1, // Low temperature for consistent edits
		}
	}

	private createApplyPrompt(originalContent: string, changeDescription: string): string {
		return `You are an expert code editor. Your task is to apply the requested changes to the provided file content.

IMPORTANT INSTRUCTIONS:
1. Apply ONLY the changes described in the change request
2. Preserve all existing code structure, formatting, and style
3. Do not add comments about what you changed
4. Return the complete modified file content
5. If the change cannot be applied, return the original content unchanged

ORIGINAL FILE CONTENT:
\`\`\`
${originalContent}
\`\`\`

REQUESTED CHANGES:
${changeDescription}

MODIFIED FILE CONTENT:`
	}

	private async callApplyModel(prompt: string, config: any): Promise<string> {
		// This is a simplified implementation. In a real implementation, you would:
		// 1. Create an API client for the specified provider
		// 2. Make the API call with the prompt
		// 3. Parse and return the response
		
		// For now, we'll throw an error to indicate this needs to be implemented
		throw new Error("Apply model API integration not yet implemented. This feature requires connecting to external apply models like Morph Fast Apply or Relace's Instant Apply.")
	}

	getProgressStatus(toolUse: ToolUse, result?: DiffResult): ToolProgressStatus {
		const changes = toolUse.params.diff // Use 'diff' parameter which exists in the ToolUse interface
		if (changes) {
			const icon = "wand"
			if (toolUse.partial) {
				return { icon, text: "Analyzing..." }
			} else if (result) {
				if (result.success) {
					return { icon, text: "Applied" }
				} else {
					return { icon, text: "Failed" }
				}
			}
		}
		return {}
	}
}