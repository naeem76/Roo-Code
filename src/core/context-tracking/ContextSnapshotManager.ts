import * as fs from "fs/promises"
import * as path from "path"
import * as crypto from "crypto"
import { safeWriteJson } from "../../utils/safeWriteJson"

import type {
	ContextSnapshot,
	WorkingContext,
	AnalyzedFile,
	ArchitecturalInsight,
	TaskDecision,
	CodebaseKnowledge,
	ContextSnapshotOptions,
	ContextSnapshotResult,
} from "./ContextSnapshot"

// Local TodoItem type definition to avoid import issues during development
interface TodoItem {
	id: string
	content: string
	status: "pending" | "in_progress" | "completed"
}

/**
 * Manages context snapshots for tasks, enabling smart resumption
 */
export class ContextSnapshotManager {
	private readonly globalStoragePath: string
	private readonly snapshotsDir: string

	constructor(globalStoragePath: string) {
		this.globalStoragePath = globalStoragePath
		this.snapshotsDir = path.join(globalStoragePath, "context-snapshots")
	}

	/**
	 * Initialize the snapshots directory
	 */
	async initialize(): Promise<void> {
		try {
			await fs.mkdir(this.snapshotsDir, { recursive: true })
		} catch (error) {
			console.error("Failed to initialize context snapshots directory:", error)
		}
	}

	/**
	 * Create a context snapshot for a task
	 */
	async createSnapshot(
		taskId: string,
		context: WorkingContext,
		options: ContextSnapshotOptions = {},
	): Promise<ContextSnapshotResult> {
		try {
			const snapshot: ContextSnapshot = {
				version: "1.0.0",
				taskId,
				createdAt: Date.now(),
				context: this.sanitizeContext(context, options),
				hash: "",
			}

			// Generate hash for integrity
			const snapshotData = JSON.stringify(snapshot)
			snapshot.hash = crypto.createHash("sha256").update(snapshotData).digest("hex")

			// Save to file
			const snapshotPath = this.getSnapshotPath(taskId)
			await safeWriteJson(snapshotPath, snapshot)

			return {
				success: true,
				size: Buffer.byteLength(snapshotData, "utf8"),
				fileCount: snapshot.context.analyzedFiles.size,
				insightCount: snapshot.context.insights.length,
			}
		} catch (error) {
			console.error("Failed to create context snapshot:", error)
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			}
		}
	}

	/**
	 * Load a context snapshot for a task
	 */
	async loadSnapshot(taskId: string): Promise<ContextSnapshot | null> {
		try {
			const snapshotPath = this.getSnapshotPath(taskId)
			const snapshotData = await fs.readFile(snapshotPath, "utf8")
			const snapshot: ContextSnapshot = JSON.parse(snapshotData)

			// Verify integrity
			const expectedHash = snapshot.hash
			const actualHash = crypto
				.createHash("sha256")
				.update(JSON.stringify({ ...snapshot, hash: "" }))
				.digest("hex")

			if (expectedHash !== actualHash) {
				console.warn(`Context snapshot integrity check failed for task ${taskId}`)
				return null
			}

			// Convert analyzedFiles back to Map
			if (snapshot.context.analyzedFiles && typeof snapshot.context.analyzedFiles === "object") {
				snapshot.context.analyzedFiles = new Map(Object.entries(snapshot.context.analyzedFiles as any))
			}

			return snapshot
		} catch (error) {
			if ((error as any).code !== "ENOENT") {
				console.error("Failed to load context snapshot:", error)
			}
			return null
		}
	}

	/**
	 * Check if a snapshot exists for a task
	 */
	async hasSnapshot(taskId: string): Promise<boolean> {
		try {
			const snapshotPath = this.getSnapshotPath(taskId)
			await fs.access(snapshotPath)
			return true
		} catch {
			return false
		}
	}

	/**
	 * Delete a context snapshot
	 */
	async deleteSnapshot(taskId: string): Promise<boolean> {
		try {
			const snapshotPath = this.getSnapshotPath(taskId)
			await fs.unlink(snapshotPath)
			return true
		} catch (error) {
			if ((error as any).code !== "ENOENT") {
				console.error("Failed to delete context snapshot:", error)
			}
			return false
		}
	}

	/**
	 * Get all available snapshots
	 */
	async listSnapshots(): Promise<{ taskId: string; createdAt: number; size: number }[]> {
		try {
			const files = await fs.readdir(this.snapshotsDir)
			const snapshots = []

			for (const file of files) {
				if (file.endsWith(".json")) {
					const taskId = file.replace(".json", "")
					const filePath = path.join(this.snapshotsDir, file)
					const stats = await fs.stat(filePath)
					snapshots.push({
						taskId,
						createdAt: stats.mtime.getTime(),
						size: stats.size,
					})
				}
			}

			return snapshots.sort((a, b) => b.createdAt - a.createdAt)
		} catch (error) {
			console.error("Failed to list context snapshots:", error)
			return []
		}
	}

	/**
	 * Clean up old snapshots (keep only the most recent N snapshots)
	 */
	async cleanupOldSnapshots(keepCount: number = 50): Promise<number> {
		try {
			const snapshots = await this.listSnapshots()
			const toDelete = snapshots.slice(keepCount)
			let deletedCount = 0

			for (const snapshot of toDelete) {
				if (await this.deleteSnapshot(snapshot.taskId)) {
					deletedCount++
				}
			}

			return deletedCount
		} catch (error) {
			console.error("Failed to cleanup old snapshots:", error)
			return 0
		}
	}

	/**
	 * Get the file path for a task's snapshot
	 */
	private getSnapshotPath(taskId: string): string {
		return path.join(this.snapshotsDir, `${taskId}.json`)
	}

	/**
	 * Sanitize context data before saving
	 */
	private sanitizeContext(context: WorkingContext, options: ContextSnapshotOptions): WorkingContext {
		const sanitized = { ...context }

		// Convert Map to object for JSON serialization
		if (sanitized.analyzedFiles instanceof Map) {
			sanitized.analyzedFiles = Object.fromEntries(sanitized.analyzedFiles) as any
		}

		// Limit insights if specified
		if (options.maxInsights && sanitized.insights.length > options.maxInsights) {
			sanitized.insights = sanitized.insights
				.sort((a, b) => b.confidence - a.confidence)
				.slice(0, options.maxInsights)
		}

		return sanitized
	}

	/**
	 * Create an empty working context
	 */
	static createEmptyContext(cwd: string): WorkingContext {
		return {
			cwd,
			analyzedFiles: new Map(),
			insights: [],
			decisions: [],
			codebaseKnowledge: {
				techStack: [],
				projectStructure: {
					type: "single-package",
					mainDirectories: [],
					configFiles: [],
				},
				conventions: {
					naming: [],
					fileOrganization: [],
					patterns: [],
				},
				dependencies: [],
			},
		}
	}

	/**
	 * Merge two working contexts
	 */
	static mergeContexts(base: WorkingContext, overlay: WorkingContext): WorkingContext {
		const merged: WorkingContext = {
			cwd: overlay.cwd || base.cwd,
			analyzedFiles: new Map([...base.analyzedFiles, ...overlay.analyzedFiles]),
			insights: [...base.insights, ...overlay.insights],
			decisions: [...base.decisions, ...overlay.decisions],
			todoList: overlay.todoList || base.todoList,
			codebaseKnowledge: {
				techStack: [...new Set([...base.codebaseKnowledge.techStack, ...overlay.codebaseKnowledge.techStack])],
				projectStructure: {
					type: overlay.codebaseKnowledge.projectStructure.type || base.codebaseKnowledge.projectStructure.type,
					mainDirectories: [
						...new Set([
							...base.codebaseKnowledge.projectStructure.mainDirectories,
							...overlay.codebaseKnowledge.projectStructure.mainDirectories,
						]),
					],
					configFiles: [
						...new Set([
							...base.codebaseKnowledge.projectStructure.configFiles,
							...overlay.codebaseKnowledge.projectStructure.configFiles,
						]),
					],
				},
				conventions: {
					naming: [
						...new Set([
							...base.codebaseKnowledge.conventions.naming,
							...overlay.codebaseKnowledge.conventions.naming,
						]),
					],
					fileOrganization: [
						...new Set([
							...base.codebaseKnowledge.conventions.fileOrganization,
							...overlay.codebaseKnowledge.conventions.fileOrganization,
						]),
					],
					patterns: [
						...new Set([
							...base.codebaseKnowledge.conventions.patterns,
							...overlay.codebaseKnowledge.conventions.patterns,
						]),
					],
				},
				dependencies: [...base.codebaseKnowledge.dependencies, ...overlay.codebaseKnowledge.dependencies],
			},
		}

		// Remove duplicate insights based on ID
		const seenInsightIds = new Set()
		merged.insights = merged.insights.filter((insight) => {
			if (seenInsightIds.has(insight.id)) {
				return false
			}
			seenInsightIds.add(insight.id)
			return true
		})

		return merged
	}
}