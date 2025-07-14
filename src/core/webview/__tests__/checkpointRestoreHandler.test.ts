import { describe, it, expect, vi, beforeEach } from "vitest"
import { handleCheckpointRestoreOperation } from "../checkpointRestoreHandler"
import { hasValidCheckpoint } from "../../checkpoints/utils"
import { saveTaskMessages } from "../../task-persistence"
import * as vscode from "vscode"

vi.mock("../../task-persistence", () => ({
	saveTaskMessages: vi.fn(),
}))

vi.mock("vscode", () => ({
	window: {
		showErrorMessage: vi.fn(),
	},
}))

describe("checkpointRestoreHandler", () => {
	let mockProvider: any
	let mockCline: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockProvider = {
			contextProxy: {
				globalStorageUri: {
					fsPath: "/test/global/storage",
				},
			},
			getTaskWithId: vi.fn().mockResolvedValue({
				historyItem: { id: "task123", messages: [] },
			}),
			initClineWithHistoryItem: vi.fn(),
			setPendingEditOperation: vi.fn(),
		}

		mockCline = {
			taskId: "task123",
			clineMessages: [
				{ ts: 1, text: "Message 1" },
				{ ts: 2, text: "Message 2", checkpoint: { hash: "abc123" } },
				{ ts: 3, text: "Message 3" },
			],
			checkpointRestore: vi.fn(),
		}
	})

	describe("hasValidCheckpoint", () => {
		it("should return true for valid checkpoint", () => {
			const message = { checkpoint: { hash: "abc123" } }
			expect(hasValidCheckpoint(message)).toBe(true)
		})

		it("should return false for missing checkpoint", () => {
			const message = { text: "No checkpoint" }
			expect(hasValidCheckpoint(message)).toBe(false)
		})

		it("should return false for invalid checkpoint structure", () => {
			expect(hasValidCheckpoint({ checkpoint: "invalid" })).toBe(false)
			expect(hasValidCheckpoint({ checkpoint: {} })).toBe(false)
			expect(hasValidCheckpoint({ checkpoint: { hash: 123 } })).toBe(false)
		})

		it("should return false for empty hash", () => {
			expect(hasValidCheckpoint({ checkpoint: { hash: "" } })).toBe(false)
		})
	})

	describe("handleCheckpointRestoreOperation", () => {
		describe("delete operation", () => {
			it("should handle delete operation correctly", async () => {
				await handleCheckpointRestoreOperation({
					provider: mockProvider,
					currentCline: mockCline,
					messageTs: 2,
					messageIndex: 1,
					checkpoint: { hash: "abc123" },
					operation: "delete",
				})

				// Should call checkpointRestore with correct params
				expect(mockCline.checkpointRestore).toHaveBeenCalledWith({
					ts: 2,
					commitHash: "abc123",
					mode: "restore",
					operation: "delete",
				})

				// Should save messages after restoration
				expect(saveTaskMessages).toHaveBeenCalledWith({
					messages: mockCline.clineMessages,
					taskId: "task123",
					globalStoragePath: "/test/global/storage",
				})

				// Should reinitialize the task
				expect(mockProvider.getTaskWithId).toHaveBeenCalledWith("task123")
				expect(mockProvider.initClineWithHistoryItem).toHaveBeenCalledWith({
					id: "task123",
					messages: [],
				})
			})
		})

		describe("edit operation", () => {
			it("should handle edit operation correctly", async () => {
				const editData = {
					editedContent: "Edited content",
					images: ["image1.png"],
					apiConversationHistoryIndex: 1,
				}

				await handleCheckpointRestoreOperation({
					provider: mockProvider,
					currentCline: mockCline,
					messageTs: 2,
					messageIndex: 1,
					checkpoint: { hash: "abc123" },
					operation: "edit",
					editData,
				})

				// Should call setPendingEditOperation on provider
				expect(mockProvider.setPendingEditOperation).toHaveBeenCalledWith("task-task123", {
					messageTs: 2,
					editedContent: "Edited content",
					images: ["image1.png"],
					messageIndex: 1,
					apiConversationHistoryIndex: 1,
					originalCheckpoint: { hash: "abc123" },
				})

				// Should call checkpointRestore with correct params
				expect(mockCline.checkpointRestore).toHaveBeenCalledWith({
					ts: 2,
					commitHash: "abc123",
					mode: "restore",
					operation: "edit",
				})

				// Should NOT save messages or reinitialize for edit
				expect(saveTaskMessages).not.toHaveBeenCalled()
				expect(mockProvider.initClineWithHistoryItem).not.toHaveBeenCalled()
			})
		})

		describe("error handling", () => {
			it("should handle errors and show error message", async () => {
				const error = new Error("Checkpoint restore failed")
				mockCline.checkpointRestore.mockRejectedValue(error)

				await expect(
					handleCheckpointRestoreOperation({
						provider: mockProvider,
						currentCline: mockCline,
						messageTs: 2,
						messageIndex: 1,
						checkpoint: { hash: "abc123" },
						operation: "delete",
					}),
				).rejects.toThrow("Checkpoint restore failed")

				expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
					"Error during checkpoint restore: Checkpoint restore failed",
				)
			})
		})
	})
})
