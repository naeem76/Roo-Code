import { describe, it, expect, vi, beforeEach } from "vitest"
import { webviewMessageHandler } from "../webviewMessageHandler"
import { saveTaskMessages } from "../../task-persistence"
import { checkpointRestore } from "../../checkpoints"

// Mock dependencies
vi.mock("../../task-persistence")
vi.mock("../../checkpoints")
vi.mock("vscode", () => ({
	window: {
		showErrorMessage: vi.fn(),
	},
}))

describe("webviewMessageHandler - checkpoint operations", () => {
	let mockProvider: any
	let mockCline: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Setup mock Cline instance
		mockCline = {
			taskId: "test-task-123",
			clineMessages: [
				{ ts: 1, type: "user", say: "user", text: "First message" },
				{ ts: 2, type: "assistant", say: "assistant", text: "Response" },
				{
					ts: 3,
					type: "user",
					say: "user",
					text: "Checkpoint message",
					checkpoint: { hash: "abc123", label: "Test checkpoint" },
				},
				{ ts: 4, type: "assistant", say: "assistant", text: "After checkpoint" },
			],
			apiConversationHistory: [
				{ ts: 1, role: "user", content: [{ type: "text", text: "First message" }] },
				{ ts: 2, role: "assistant", content: [{ type: "text", text: "Response" }] },
				{ ts: 3, role: "user", content: [{ type: "text", text: "Checkpoint message" }] },
				{ ts: 4, role: "assistant", content: [{ type: "text", text: "After checkpoint" }] },
			],
			checkpointRestore: vi.fn(),
			overwriteClineMessages: vi.fn(),
			overwriteApiConversationHistory: vi.fn(),
		}

		// Setup mock provider
		mockProvider = {
			getCurrentCline: vi.fn(() => mockCline),
			postMessageToWebview: vi.fn(),
			getTaskWithId: vi.fn(() => ({
				historyItem: { id: "test-task-123", messages: mockCline.clineMessages },
			})),
			initClineWithHistoryItem: vi.fn(),
			contextProxy: {
				globalStorageUri: { fsPath: "/test/storage" },
			},
		}
	})

	describe("delete operations with checkpoint restoration", () => {
		it("should save messages to disk after checkpoint restoration", async () => {
			// Simulate checkpoint restoration that removes messages
			mockCline.checkpointRestore.mockImplementation(async () => {
				// Simulate the effect of checkpoint restoration
				mockCline.clineMessages = mockCline.clineMessages.slice(0, 2)
			})

			// Call the handler with delete confirmation
			await webviewMessageHandler(mockProvider, {
				type: "deleteMessageConfirm",
				messageTs: 3,
				restoreCheckpoint: true,
			})

			// Verify checkpoint restore was called with delete operation
			expect(mockCline.checkpointRestore).toHaveBeenCalledWith({
				ts: 3,
				commitHash: "abc123",
				mode: "restore",
				operation: "delete",
			})

			// Verify saveTaskMessages was called after checkpoint restoration
			expect(saveTaskMessages).toHaveBeenCalledWith({
				messages: mockCline.clineMessages,
				taskId: "test-task-123",
				globalStoragePath: "/test/storage",
			})

			// Verify the save happened after the checkpoint restore
			const checkpointRestoreOrder = mockCline.checkpointRestore.mock.invocationCallOrder[0]
			const saveTaskMessagesOrder = (saveTaskMessages as any).mock.invocationCallOrder[0]
			expect(saveTaskMessagesOrder).toBeGreaterThan(checkpointRestoreOrder)
		})

		it("should save messages for non-checkpoint deletes", async () => {
			// Call the handler with delete confirmation (no checkpoint restoration)
			await webviewMessageHandler(mockProvider, {
				type: "deleteMessageConfirm",
				messageTs: 2,
				restoreCheckpoint: false,
			})

			// Verify saveTaskMessages was called
			expect(saveTaskMessages).toHaveBeenCalledWith({
				messages: expect.any(Array),
				taskId: "test-task-123",
				globalStoragePath: "/test/storage",
			})

			// Verify checkpoint restore was NOT called
			expect(mockCline.checkpointRestore).not.toHaveBeenCalled()
		})
	})

	describe("edit operations with checkpoint restoration", () => {
		it("should call checkpoint restore with edit operation", async () => {
			// Mock the pending edit storage
			mockCline.pendingEditOperation = null

			// Call the handler with edit confirmation
			await webviewMessageHandler(mockProvider, {
				type: "editMessageConfirm",
				messageTs: 3,
				text: "Edited checkpoint message",
				restoreCheckpoint: true,
			})

			// Verify checkpoint restore was called with edit operation
			expect(mockCline.checkpointRestore).toHaveBeenCalledWith({
				ts: 3,
				commitHash: "abc123",
				mode: "restore",
				operation: "edit",
			})

			// Verify the pending edit operation was stored
			expect(mockCline.pendingEditOperation).toEqual({
				messageTs: 3,
				editedContent: "Edited checkpoint message",
				images: undefined,
				messageIndex: 2,
				apiConversationHistoryIndex: 2,
				originalCheckpoint: { hash: "abc123", label: "Test checkpoint" },
			})
		})
	})
})
