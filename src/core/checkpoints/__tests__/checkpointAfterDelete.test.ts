import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Task } from "../../task/Task"
import { ClineProvider } from "../../webview/ClineProvider"
import { checkpointSave } from "../index"
import * as vscode from "vscode"

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		showErrorMessage: vi.fn(),
	},
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path })),
	},
}))

// Mock other dependencies
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureCheckpointCreated: vi.fn(),
		},
	},
}))

vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn(() => "/test/workspace"),
}))

describe("Checkpoint after message deletion", () => {
	let mockProvider: any
	let mockTask: any
	let mockCheckpointService: any

	beforeEach(() => {
		// Create mock checkpoint service
		mockCheckpointService = {
			isInitialized: false,
			saveCheckpoint: vi.fn().mockResolvedValue({ commit: "test-commit-hash" }),
			on: vi.fn(),
			initShadowGit: vi.fn().mockResolvedValue(undefined),
		}

		// Create mock provider
		mockProvider = {
			context: {
				globalStorageUri: { fsPath: "/test/storage" },
			},
			log: vi.fn(),
			postMessageToWebview: vi.fn(),
			postStateToWebview: vi.fn(),
		}

		// Create mock task
		mockTask = {
			taskId: "test-task-id",
			enableCheckpoints: true,
			checkpointService: undefined,
			checkpointServiceInitializing: false,
			providerRef: {
				deref: () => mockProvider,
			},
			clineMessages: [],
			pendingUserMessageCheckpoint: undefined,
		}

		// Mock the RepoPerTaskCheckpointService.create to return our mock
		vi.mock("../../../services/checkpoints", () => ({
			RepoPerTaskCheckpointService: {
				create: vi.fn(() => mockCheckpointService),
			},
		}))
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("should wait for checkpoint service initialization before saving", async () => {
		// Simulate service initialization after a delay
		setTimeout(() => {
			mockCheckpointService.isInitialized = true
		}, 100)

		// Call checkpointSave
		const savePromise = checkpointSave(mockTask, true)

		// Initially, service should not be initialized
		expect(mockCheckpointService.isInitialized).toBe(false)

		// Wait for the save to complete
		const result = await savePromise

		// Service should now be initialized
		expect(mockCheckpointService.isInitialized).toBe(true)

		// saveCheckpoint should have been called
		expect(mockCheckpointService.saveCheckpoint).toHaveBeenCalledWith(
			expect.stringContaining("Task: test-task-id"),
			{ allowEmpty: true },
		)

		// Result should contain the commit hash
		expect(result).toEqual({ commit: "test-commit-hash" })

		// Task should still have checkpoints enabled
		expect(mockTask.enableCheckpoints).toBe(true)
	})

	it("should handle timeout when service doesn't initialize", async () => {
		// Service never initializes
		mockCheckpointService.isInitialized = false

		// Call checkpointSave with a task that has no checkpoint service
		const taskWithNoService = {
			...mockTask,
			checkpointService: undefined,
			enableCheckpoints: false,
		}

		const result = await checkpointSave(taskWithNoService, true)

		// Result should be undefined
		expect(result).toBeUndefined()

		// saveCheckpoint should not have been called
		expect(mockCheckpointService.saveCheckpoint).not.toHaveBeenCalled()
	})

	it("should preserve checkpoint data through message deletion flow", async () => {
		// Initialize service
		mockCheckpointService.isInitialized = true

		// Simulate saving checkpoint before user message
		const checkpointResult = await checkpointSave(mockTask, true)
		expect(checkpointResult).toEqual({ commit: "test-commit-hash" })

		// Simulate setting pendingUserMessageCheckpoint
		if (checkpointResult && "commit" in checkpointResult) {
			mockTask.pendingUserMessageCheckpoint = {
				hash: checkpointResult.commit,
				timestamp: Date.now(),
				type: "user_message",
			}
		}

		// Verify checkpoint data is preserved
		expect(mockTask.pendingUserMessageCheckpoint).toBeDefined()
		expect(mockTask.pendingUserMessageCheckpoint.hash).toBe("test-commit-hash")

		// Simulate message deletion and reinitialization
		mockTask.clineMessages = []
		mockTask.checkpointService = undefined
		mockTask.checkpointServiceInitializing = false

		// Re-initialize checkpoint service
		setTimeout(() => {
			mockCheckpointService.isInitialized = true
			mockTask.checkpointService = mockCheckpointService
		}, 50)

		// Save checkpoint again after deletion
		const newCheckpointResult = await checkpointSave(mockTask, true)

		// Should still work after reinitialization
		expect(newCheckpointResult).toEqual({ commit: "test-commit-hash" })
		expect(mockTask.enableCheckpoints).toBe(true)
	})
})
