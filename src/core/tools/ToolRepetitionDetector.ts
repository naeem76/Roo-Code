import { ToolUse } from "../../shared/tools"
import { t } from "../../i18n"

/**
 * Class for detecting consecutive identical tool calls
 * to prevent the AI from getting stuck in a loop.
 */
export class ToolRepetitionDetector {
	private previousToolCallJson: string | null = null
	private consecutiveIdenticalToolCallCount: number = 0
	private readonly consecutiveIdenticalToolCallLimit: number
	private toolFailureHistory: Array<{ toolName: string; timestamp: number; reason?: string }> = []
	private readonly maxHistorySize = 10

	/**
	 * Creates a new ToolRepetitionDetector
	 * @param limit The maximum number of identical consecutive tool calls allowed
	 */
	constructor(limit: number = 3) {
		this.consecutiveIdenticalToolCallLimit = limit
	}

	/**
	 * Checks if the current tool call is identical to the previous one
	 * and determines if execution should be allowed
	 *
	 * @param currentToolCallBlock ToolUse object representing the current tool call
	 * @returns Object indicating if execution is allowed and a message to show if not
	 */
	public check(currentToolCallBlock: ToolUse): {
		allowExecution: boolean
		askUser?: {
			messageKey: string
			messageDetail: string
		}
	} {
		// Serialize the block to a canonical JSON string for comparison
		const currentToolCallJson = this.serializeToolUse(currentToolCallBlock)

		// Compare with previous tool call
		if (this.previousToolCallJson === currentToolCallJson) {
			this.consecutiveIdenticalToolCallCount++
		} else {
			this.consecutiveIdenticalToolCallCount = 1 // Start with 1 for the first occurrence
			this.previousToolCallJson = currentToolCallJson
		}

		// Check if limit is reached (0 means unlimited)
		if (
			this.consecutiveIdenticalToolCallLimit > 0 &&
			this.consecutiveIdenticalToolCallCount >= this.consecutiveIdenticalToolCallLimit
		) {
			// Generate enhanced error message with context
			const recentFailures = this.getRecentFailureContext(currentToolCallBlock.name)
			const contextMessage = this.generateContextualErrorMessage(currentToolCallBlock.name, recentFailures)

			// Reset counters to allow recovery if user guides the AI past this point
			this.consecutiveIdenticalToolCallCount = 0
			this.previousToolCallJson = null

			// Return result indicating execution should not be allowed
			return {
				allowExecution: false,
				askUser: {
					messageKey: "mistake_limit_reached",
					messageDetail: contextMessage,
				},
			}
		}

		// Execution is allowed
		return { allowExecution: true }
	}

	/**
	 * Records a tool failure for better context in future error messages
	 */
	public recordToolFailure(toolName: string, reason?: string): void {
		this.toolFailureHistory.push({
			toolName,
			timestamp: Date.now(),
			reason,
		})

		// Keep history size manageable
		if (this.toolFailureHistory.length > this.maxHistorySize) {
			this.toolFailureHistory.shift()
		}
	}

	/**
	 * Gets recent failure context for a specific tool
	 */
	private getRecentFailureContext(toolName: string): Array<{ reason?: string; timestamp: number }> {
		const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
		return this.toolFailureHistory
			.filter((failure) => failure.toolName === toolName && failure.timestamp > fiveMinutesAgo)
			.map((failure) => ({ reason: failure.reason, timestamp: failure.timestamp }))
	}

	/**
	 * Generates a contextual error message based on recent failures
	 */
	private generateContextualErrorMessage(
		toolName: string,
		recentFailures: Array<{ reason?: string; timestamp: number }>,
	): string {
		let message = t("tools:toolRepetitionLimitReached", { toolName })

		if (recentFailures.length > 0) {
			message += "\n\nRecent issues with this tool:"
			const uniqueReasons = [...new Set(recentFailures.map((f) => f.reason).filter(Boolean))]

			if (uniqueReasons.length > 0) {
				message += "\n" + uniqueReasons.map((reason) => `• ${reason}`).join("\n")
			}

			message += "\n\nSuggestions:"
			message += "\n• Try a different approach or tool"
			message += "\n• Check if the parameters are correct"
			message += "\n• Consider breaking down the task into smaller steps"

			if (toolName === "apply_diff" || toolName === "write_to_file") {
				message += "\n• Use read_file first to understand the current file content"
			} else if (toolName === "execute_command") {
				message += "\n• Verify the command syntax and file paths"
			}
		}

		return message
	}

	/**
	 * Serializes a ToolUse object into a canonical JSON string for comparison
	 *
	 * @param toolUse The ToolUse object to serialize
	 * @returns JSON string representation of the tool use with sorted parameter keys
	 */
	private serializeToolUse(toolUse: ToolUse): string {
		// Create a new parameters object with alphabetically sorted keys
		const sortedParams: Record<string, unknown> = {}

		// Get parameter keys and sort them alphabetically
		const sortedKeys = Object.keys(toolUse.params).sort()

		// Populate the sorted parameters object in a type-safe way
		for (const key of sortedKeys) {
			if (Object.prototype.hasOwnProperty.call(toolUse.params, key)) {
				sortedParams[key] = toolUse.params[key as keyof typeof toolUse.params]
			}
		}

		// Create the object with the tool name and sorted parameters
		const toolObject = {
			name: toolUse.name,
			parameters: sortedParams,
		}

		// Convert to a canonical JSON string
		return JSON.stringify(toolObject)
	}
}
