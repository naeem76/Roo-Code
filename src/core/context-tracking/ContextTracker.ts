import * as crypto from "crypto"
import * as fs from "fs/promises"
import * as path from "path"

import type {
	WorkingContext,
	AnalyzedFile,
	ArchitecturalInsight,
	TaskDecision,
	CodebaseKnowledge,
} from "./ContextSnapshot"
import { ContextSnapshotManager } from "./ContextSnapshotManager"

// Local TodoItem type definition
interface TodoItem {
	id: string
	content: string
	status: "pending" | "in_progress" | "completed"
}

/**
 * Tracks and captures context during task execution
 */
export class ContextTracker {
	private context: WorkingContext
	private snapshotManager: ContextSnapshotManager
	private taskId: string
	private autoSnapshotInterval?: NodeJS.Timeout

	constructor(taskId: string, cwd: string, globalStoragePath: string) {
		this.taskId = taskId
		this.context = ContextSnapshotManager.createEmptyContext(cwd)
		this.snapshotManager = new ContextSnapshotManager(globalStoragePath)
	}

	/**
	 * Initialize the context tracker
	 */
	async initialize(): Promise<void> {
		await this.snapshotManager.initialize()

		// Try to load existing snapshot
		const existingSnapshot = await this.snapshotManager.loadSnapshot(this.taskId)
		if (existingSnapshot) {
			this.context = existingSnapshot.context
			console.log(`Loaded existing context snapshot for task ${this.taskId}`)
		}

		// Start auto-snapshot timer (every 5 minutes)
		this.startAutoSnapshot()
	}

	/**
	 * Record that a file has been analyzed
	 */
	async recordFileAnalysis(filePath: string, insights: string[] = []): Promise<void> {
		try {
			const fullPath = path.resolve(this.context.cwd, filePath)
			const stats = await fs.stat(fullPath)
			const content = await fs.readFile(fullPath, "utf8")
			const contentHash = crypto.createHash("md5").update(content).digest("hex")

			const analyzedFile: AnalyzedFile = {
				path: filePath,
				contentHash,
				lastAnalyzed: Date.now(),
				insights,
				size: stats.size,
				lastModified: stats.mtime.getTime(),
			}

			this.context.analyzedFiles.set(filePath, analyzedFile)
		} catch (error) {
			console.warn(`Failed to record file analysis for ${filePath}:`, error)
		}
	}

	/**
	 * Add an architectural insight
	 */
	addInsight(
		type: ArchitecturalInsight["type"],
		description: string,
		relatedFiles: string[] = [],
		confidence: number = 0.8,
	): void {
		const insight: ArchitecturalInsight = {
			id: crypto.randomUUID(),
			type,
			description,
			relatedFiles,
			confidence,
			discoveredAt: Date.now(),
		}

		this.context.insights.push(insight)
	}

	/**
	 * Record a task decision
	 */
	recordDecision(decision: string, reasoning: string, affectedFiles: string[] = []): void {
		const taskDecision: TaskDecision = {
			id: crypto.randomUUID(),
			decision,
			reasoning,
			timestamp: Date.now(),
			affectedFiles,
		}

		this.context.decisions.push(taskDecision)
	}

	/**
	 * Update codebase knowledge
	 */
	updateCodebaseKnowledge(updates: Partial<CodebaseKnowledge>): void {
		if (updates.techStack) {
			this.context.codebaseKnowledge.techStack = [
				...new Set([...this.context.codebaseKnowledge.techStack, ...updates.techStack]),
			]
		}

		if (updates.projectStructure) {
			Object.assign(this.context.codebaseKnowledge.projectStructure, updates.projectStructure)
		}

		if (updates.conventions) {
			const conventions = this.context.codebaseKnowledge.conventions
			if (updates.conventions.naming) {
				conventions.naming = [...new Set([...conventions.naming, ...updates.conventions.naming])]
			}
			if (updates.conventions.fileOrganization) {
				conventions.fileOrganization = [
					...new Set([...conventions.fileOrganization, ...updates.conventions.fileOrganization]),
				]
			}
			if (updates.conventions.patterns) {
				conventions.patterns = [...new Set([...conventions.patterns, ...updates.conventions.patterns])]
			}
		}

		if (updates.dependencies) {
			this.context.codebaseKnowledge.dependencies = [
				...this.context.codebaseKnowledge.dependencies,
				...updates.dependencies,
			]
		}
	}

	/**
	 * Update the todo list
	 */
	updateTodoList(todoList: TodoItem[]): void {
		this.context.todoList = todoList
	}

	/**
	 * Get the current context
	 */
	getContext(): WorkingContext {
		return { ...this.context }
	}

	/**
	 * Check if a file has been analyzed recently
	 */
	async isFileAnalyzedRecently(filePath: string, maxAgeMs: number = 300000): Promise<boolean> {
		const analyzedFile = this.context.analyzedFiles.get(filePath)
		if (!analyzedFile) {
			return false
		}

		// Check if file has been modified since analysis
		try {
			const fullPath = path.resolve(this.context.cwd, filePath)
			const stats = await fs.stat(fullPath)
			if (stats.mtime.getTime() > analyzedFile.lastModified) {
				return false
			}
		} catch {
			return false
		}

		// Check if analysis is recent enough
		return Date.now() - analyzedFile.lastAnalyzed < maxAgeMs
	}

	/**
	 * Get insights related to specific files
	 */
	getInsightsForFiles(filePaths: string[]): ArchitecturalInsight[] {
		return this.context.insights.filter((insight) =>
			insight.relatedFiles.some((file) => filePaths.includes(file)),
		)
	}

	/**
	 * Get the most confident insights
	 */
	getTopInsights(limit: number = 10): ArchitecturalInsight[] {
		return this.context.insights
			.sort((a, b) => b.confidence - a.confidence)
			.slice(0, limit)
	}

	/**
	 * Create a snapshot of the current context
	 */
	async createSnapshot(): Promise<boolean> {
		const result = await this.snapshotManager.createSnapshot(this.taskId, this.context)
		return result.success
	}

	/**
	 * Start automatic snapshot creation
	 */
	private startAutoSnapshot(): void {
		// Create snapshot every 5 minutes
		this.autoSnapshotInterval = setInterval(async () => {
			await this.createSnapshot()
		}, 5 * 60 * 1000)
	}

	/**
	 * Stop automatic snapshot creation
	 */
	stopAutoSnapshot(): void {
		if (this.autoSnapshotInterval) {
			clearInterval(this.autoSnapshotInterval)
			this.autoSnapshotInterval = undefined
		}
	}

	/**
	 * Cleanup and create final snapshot
	 */
	async dispose(): Promise<void> {
		this.stopAutoSnapshot()
		await this.createSnapshot()
	}

	/**
	 * Analyze file content and extract insights
	 */
	async analyzeFileContent(filePath: string): Promise<string[]> {
		try {
			const fullPath = path.resolve(this.context.cwd, filePath)
			const content = await fs.readFile(fullPath, "utf8")
			const insights: string[] = []

			// Basic analysis patterns
			const ext = path.extname(filePath).toLowerCase()

			// Detect technology stack
			if (ext === ".ts" || ext === ".tsx") {
				insights.push("TypeScript file")
				if (content.includes("import React")) {
					insights.push("React component")
					this.updateCodebaseKnowledge({ techStack: ["React", "TypeScript"] })
				}
				if (content.includes("import * as vscode")) {
					insights.push("VSCode extension code")
					this.updateCodebaseKnowledge({ techStack: ["VSCode Extension"] })
				}
			}

			// Detect patterns
			if (content.includes("export class") && content.includes("extends")) {
				insights.push("Class inheritance pattern")
			}
			if (content.includes("interface ") && content.includes("export")) {
				insights.push("TypeScript interface definition")
			}
			if (content.includes("async ") && content.includes("await ")) {
				insights.push("Async/await pattern")
			}

			// Detect architectural patterns
			if (filePath.includes("Manager") || filePath.includes("Service")) {
				insights.push("Service/Manager pattern")
			}
			if (filePath.includes("Provider")) {
				insights.push("Provider pattern")
			}

			await this.recordFileAnalysis(filePath, insights)
			return insights
		} catch (error) {
			console.warn(`Failed to analyze file content for ${filePath}:`, error)
			return []
		}
	}

	/**
	 * Generate context summary for task resumption
	 */
	generateContextSummary(): string {
		const summary = []

		// Files analyzed
		if (this.context.analyzedFiles.size > 0) {
			summary.push(`Analyzed ${this.context.analyzedFiles.size} files:`)
			const recentFiles = Array.from(this.context.analyzedFiles.entries())
				.sort(([, a], [, b]) => b.lastAnalyzed - a.lastAnalyzed)
				.slice(0, 5)
				.map(([path]) => `  - ${path}`)
			summary.push(...recentFiles)
		}

		// Key insights
		if (this.context.insights.length > 0) {
			summary.push(`\nKey insights discovered:`)
			const topInsights = this.getTopInsights(3).map((insight) => `  - ${insight.description}`)
			summary.push(...topInsights)
		}

		// Technology stack
		if (this.context.codebaseKnowledge.techStack.length > 0) {
			summary.push(`\nTechnology stack: ${this.context.codebaseKnowledge.techStack.join(", ")}`)
		}

		// Recent decisions
		if (this.context.decisions.length > 0) {
			summary.push(`\nRecent decisions:`)
			const recentDecisions = this.context.decisions
				.sort((a, b) => b.timestamp - a.timestamp)
				.slice(0, 2)
				.map((decision) => `  - ${decision.decision}`)
			summary.push(...recentDecisions)
		}

		return summary.join("\n")
	}
}