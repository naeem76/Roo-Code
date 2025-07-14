import * as vscode from "vscode"
import { Anthropic } from "@anthropic-ai/sdk"
import { CodeIndexManager } from "../manager"

/**
 * Service that automatically triggers codebase indexing based on user prompts
 * and business logic changes without requiring manual user intervention.
 */
export class AutoIndexingService {
	private static instance: AutoIndexingService | undefined
	private codeIndexManager: CodeIndexManager | undefined
	private lastIndexingTime: number = 0
	private readonly indexingCooldownMs = 30000 // 30 seconds cooldown between auto-indexing

	// Keywords that suggest the user might benefit from codebase indexing
	private readonly indexingTriggerKeywords = [
		"find",
		"search",
		"locate",
		"where",
		"how does",
		"how is",
		"what does",
		"understand",
		"explain",
		"analyze",
		"explore",
		"investigate",
		"review",
		"refactor",
		"modify",
		"change",
		"update",
		"implement",
		"add feature",
		"bug",
		"error",
		"issue",
		"problem",
		"fix",
		"debug",
		"trace",
		"architecture",
		"structure",
		"design",
		"pattern",
		"flow",
		"workflow",
		"integration",
		"dependency",
		"relationship",
		"connection",
		"usage",
		"api",
		"endpoint",
		"route",
		"handler",
		"controller",
		"service",
		"component",
		"module",
		"class",
		"function",
		"method",
		"interface",
		"state",
		"reducer",
		"store",
		"context",
		"provider",
		"hook",
		"database",
		"model",
		"schema",
		"query",
		"migration",
		"entity",
	]

	// File patterns that indicate business logic changes
	private readonly businessLogicPatterns = [
		/\/(reducers?|store|state)\//i,
		/\/(api|handlers?|controllers?|services?)\//i,
		/\/(components?|ui|views?|pages?)\//i,
		/\/(models?|entities?|schemas?)\//i,
		/\/(routes?|routing)\//i,
		/\/(middleware|interceptors?)\//i,
		/\/(utils?|helpers?|lib)\//i,
		/\.(reducer|store|state|api|service|controller|handler)\./i,
		/\/(src|lib|app)\//i,
	]

	private constructor(codeIndexManager?: CodeIndexManager) {
		this.codeIndexManager = codeIndexManager
	}

	public static getInstance(codeIndexManager?: CodeIndexManager): AutoIndexingService {
		if (!AutoIndexingService.instance) {
			if (codeIndexManager === undefined || codeIndexManager === null) {
				throw new Error("CodeIndexManager is required to create AutoIndexingService instance")
			}
			AutoIndexingService.instance = new AutoIndexingService(codeIndexManager)
		}
		if (codeIndexManager && !AutoIndexingService.instance.codeIndexManager) {
			AutoIndexingService.instance.codeIndexManager = codeIndexManager
		}
		return AutoIndexingService.instance
	}

	/**
	 * Analyzes user content to determine if automatic indexing should be triggered
	 */
	public async analyzeUserPromptForIndexing(userContent: Anthropic.Messages.ContentBlockParam[]): Promise<boolean> {
		if (!this.shouldAttemptIndexing()) {
			return false
		}

		// Extract text content from user message
		const textContent = this.extractTextFromUserContent(userContent)
		if (!textContent) {
			return false
		}

		// Check if the prompt contains keywords that suggest codebase exploration
		const containsTriggerKeywords = this.containsIndexingTriggerKeywords(textContent)

		// Check if the prompt mentions specific files or code patterns
		const mentionsCodePatterns = this.mentionsCodePatterns(textContent)

		// Check if this is a new task (likely to benefit from fresh indexing)
		const isNewTask = this.isNewTaskPrompt(textContent)

		return containsTriggerKeywords || mentionsCodePatterns || isNewTask
	}

	/**
	 * Analyzes file changes to determine if they represent business logic changes
	 * that should trigger automatic indexing
	 */
	public shouldTriggerIndexingForFileChange(filePath: string): boolean {
		if (!this.shouldAttemptIndexing()) {
			return false
		}

		// Check if the file matches business logic patterns
		return this.businessLogicPatterns.some((pattern) => pattern.test(filePath))
	}

	/**
	 * Triggers automatic indexing if conditions are met
	 */
	public async triggerAutomaticIndexing(reason: string): Promise<boolean> {
		if (!this.shouldAttemptIndexing()) {
			console.log(`[AutoIndexingService] Skipping indexing - conditions not met: ${reason}`)
			return false
		}

		try {
			console.log(`[AutoIndexingService] Triggering automatic indexing: ${reason}`)

			// Update last indexing time to prevent rapid re-indexing
			this.lastIndexingTime = Date.now()

			// Start indexing asynchronously
			await this.codeIndexManager!.startIndexing()

			console.log(`[AutoIndexingService] Successfully triggered indexing: ${reason}`)
			return true
		} catch (error) {
			console.error(`[AutoIndexingService] Failed to trigger automatic indexing:`, error)
			return false
		}
	}

	/**
	 * Checks if indexing should be attempted based on current conditions
	 */
	private shouldAttemptIndexing(): boolean {
		// Check if code index manager is available and properly configured
		if (
			!this.codeIndexManager ||
			!this.codeIndexManager.isFeatureEnabled ||
			!this.codeIndexManager.isFeatureConfigured
		) {
			return false
		}

		// Check cooldown period to prevent over-indexing
		const timeSinceLastIndexing = Date.now() - this.lastIndexingTime
		if (timeSinceLastIndexing < this.indexingCooldownMs) {
			return false
		}

		return true
	}

	/**
	 * Extracts text content from user content blocks
	 */
	private extractTextFromUserContent(userContent: Anthropic.Messages.ContentBlockParam[]): string {
		const textBlocks: string[] = []

		for (const block of userContent) {
			if (block.type === "text") {
				textBlocks.push(block.text)
			} else if (block.type === "tool_result") {
				if (typeof block.content === "string") {
					textBlocks.push(block.content)
				} else if (Array.isArray(block.content)) {
					for (const contentBlock of block.content) {
						if (contentBlock.type === "text") {
							textBlocks.push(contentBlock.text)
						}
					}
				}
			}
		}

		return textBlocks.join(" ").toLowerCase()
	}

	/**
	 * Checks if text contains keywords that suggest indexing would be beneficial
	 */
	private containsIndexingTriggerKeywords(text: string): boolean {
		return this.indexingTriggerKeywords.some((keyword) => text.includes(keyword.toLowerCase()))
	}

	/**
	 * Checks if text mentions code patterns or file structures
	 */
	private mentionsCodePatterns(text: string): boolean {
		// Check for mentions of file extensions
		const codeFileExtensions = [
			".ts",
			".js",
			".tsx",
			".jsx",
			".py",
			".java",
			".cs",
			".cpp",
			".c",
			".go",
			".rs",
			".php",
		]
		const mentionsFileExtensions = codeFileExtensions.some((ext) => text.includes(ext))

		// Check for mentions of common code terms
		const codeTerms = ["function", "class", "component", "module", "import", "export", "interface", "type"]
		const mentionsCodeTerms = codeTerms.some((term) => text.includes(term))

		// Check for file path patterns
		const mentionsFilePaths =
			text.includes("/") && (text.includes("src") || text.includes("lib") || text.includes("app"))

		return mentionsFileExtensions || mentionsCodeTerms || mentionsFilePaths
	}

	/**
	 * Checks if this appears to be a new task prompt
	 */
	private isNewTaskPrompt(text: string): boolean {
		// Look for task-like language
		const taskIndicators = ["<task>", "please", "can you", "i need", "help me", "create", "build", "develop"]
		return taskIndicators.some((indicator) => text.includes(indicator))
	}

	/**
	 * Disposes of the service instance
	 */
	public static dispose(): void {
		AutoIndexingService.instance = undefined
	}
}
