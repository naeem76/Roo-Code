import type { TodoItem } from "@roo-code/types"

/**
 * Represents a file that was analyzed during task execution
 */
export interface AnalyzedFile {
	/** File path relative to workspace */
	path: string
	/** Content hash to detect changes */
	contentHash: string
	/** When this file was last analyzed */
	lastAnalyzed: number
	/** Key insights discovered about this file */
	insights: string[]
	/** File size at time of analysis */
	size: number
	/** File modification time at analysis */
	lastModified: number
}

/**
 * Represents discovered patterns or architectural insights
 */
export interface ArchitecturalInsight {
	/** Unique identifier for this insight */
	id: string
	/** Type of insight (e.g., 'pattern', 'dependency', 'structure') */
	type: 'pattern' | 'dependency' | 'structure' | 'convention' | 'issue'
	/** Human-readable description */
	description: string
	/** Files related to this insight */
	relatedFiles: string[]
	/** Confidence level (0-1) */
	confidence: number
	/** When this insight was discovered */
	discoveredAt: number
}

/**
 * Represents the working context of a task
 */
export interface WorkingContext {
	/** Current working directory */
	cwd: string
	/** Files that have been analyzed */
	analyzedFiles: Map<string, AnalyzedFile>
	/** Architectural insights discovered */
	insights: ArchitecturalInsight[]
	/** Current todo list state */
	todoList?: TodoItem[]
	/** Key decisions made during the task */
	decisions: TaskDecision[]
	/** Important discoveries about the codebase */
	codebaseKnowledge: CodebaseKnowledge
}

/**
 * Represents a decision made during task execution
 */
export interface TaskDecision {
	/** Unique identifier */
	id: string
	/** What decision was made */
	decision: string
	/** Why this decision was made */
	reasoning: string
	/** When the decision was made */
	timestamp: number
	/** Files affected by this decision */
	affectedFiles: string[]
}

/**
 * Represents knowledge about the codebase structure and patterns
 */
export interface CodebaseKnowledge {
	/** Main technology stack detected */
	techStack: string[]
	/** Project structure patterns */
	projectStructure: {
		type: 'monorepo' | 'single-package' | 'multi-package'
		mainDirectories: string[]
		configFiles: string[]
	}
	/** Coding conventions discovered */
	conventions: {
		naming: string[]
		fileOrganization: string[]
		patterns: string[]
	}
	/** Dependencies and their purposes */
	dependencies: {
		name: string
		purpose: string
		files: string[]
	}[]
}

/**
 * Complete context snapshot for a task
 */
export interface ContextSnapshot {
	/** Snapshot version for compatibility */
	version: string
	/** Task ID this snapshot belongs to */
	taskId: string
	/** When this snapshot was created */
	createdAt: number
	/** Working context at time of snapshot */
	context: WorkingContext
	/** Hash of the snapshot for integrity */
	hash: string
}

/**
 * Options for creating context snapshots
 */
export interface ContextSnapshotOptions {
	/** Whether to include file content hashes */
	includeContentHashes?: boolean
	/** Maximum number of insights to store */
	maxInsights?: number
	/** Whether to compress the snapshot */
	compress?: boolean
}

/**
 * Result of context snapshot operations
 */
export interface ContextSnapshotResult {
	/** Whether the operation was successful */
	success: boolean
	/** Error message if operation failed */
	error?: string
	/** Size of the snapshot in bytes */
	size?: number
	/** Number of files included */
	fileCount?: number
	/** Number of insights included */
	insightCount?: number
}