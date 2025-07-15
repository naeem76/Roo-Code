import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { webviewMessageHandler } from "../webviewMessageHandler"
import { ClineProvider } from "../ClineProvider"
import { Package } from "../../../shared/package"

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	workspace: {
		getConfiguration: vi.fn(),
	},
	ConfigurationTarget: {
		Global: 1,
	},
}))

// Mock Package
vi.mock("../../../shared/package", () => ({
	Package: {
		name: "roo-code",
	},
}))

describe("webviewMessageHandler - allowedCommands and deniedCommands", () => {
	let mockProvider: any
	let mockContextProxy: any
	let mockConfigUpdate: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Setup mock for workspace configuration
		mockConfigUpdate = vi.fn().mockResolvedValue(undefined)
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
			update: mockConfigUpdate,
		} as any)

		// Create mock context proxy
		mockContextProxy = {
			getValue: vi.fn(),
			setValue: vi.fn(),
		}

		// Create mock provider
		mockProvider = {
			contextProxy: mockContextProxy,
			postStateToWebview: vi.fn().mockResolvedValue(undefined),
			log: vi.fn(),
		} as any
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("allowedCommands", () => {
		it("should update the allowed commands list", async () => {
			// Create message with new allowed commands
			const message = {
				type: "allowedCommands",
				commands: ["npm test", "git status", "npm run build"],
			}

			// Call handler
			await webviewMessageHandler(mockProvider, message as any)

			// Verify the commands were updated
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("allowedCommands", [
				"npm test",
				"git status",
				"npm run build",
			])

			// Note: We no longer update VS Code workspace settings, only global state
		})

		it("should handle removing patterns from allowed commands", async () => {
			// Setup initial state
			mockContextProxy.getValue.mockReturnValue(["npm test", "git status", "npm run build"])

			// Create message that removes "git status"
			const message = {
				type: "allowedCommands",
				commands: ["npm test", "npm run build"],
			}

			// Call handler
			await webviewMessageHandler(mockProvider, message as any)

			// Verify the pattern was removed
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("allowedCommands", ["npm test", "npm run build"])

			// Note: We no longer update VS Code workspace settings, only global state
		})

		it("should handle empty allowed commands list", async () => {
			// Create message with empty commands
			const message = {
				type: "allowedCommands",
				commands: [],
			}

			// Call handler
			await webviewMessageHandler(mockProvider, message as any)

			// Verify the commands were cleared
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("allowedCommands", [])

			// Note: We no longer update VS Code workspace settings, only global state
		})

		it("should filter out invalid commands", async () => {
			// Create message with some invalid commands
			const message = {
				type: "allowedCommands",
				commands: ["npm test", "", "  ", null, undefined, 123, "git status"],
			}

			// Call handler
			await webviewMessageHandler(mockProvider, message as any)

			// Verify only valid commands were kept
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("allowedCommands", ["npm test", "git status"])
		})
	})

	describe("deniedCommands", () => {
		it("should update the denied commands list", async () => {
			// Create message with new denied commands
			const message = {
				type: "deniedCommands",
				commands: ["rm -rf", "sudo", "chmod 777"],
			}

			// Call handler
			await webviewMessageHandler(mockProvider, message as any)

			// Verify the commands were updated
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("deniedCommands", ["rm -rf", "sudo", "chmod 777"])

			// Note: We no longer update VS Code workspace settings, only global state
		})

		it("should handle removing patterns from denied commands", async () => {
			// Setup initial state
			mockContextProxy.getValue.mockReturnValue(["rm -rf", "sudo", "chmod 777"])

			// Create message that removes "sudo"
			const message = {
				type: "deniedCommands",
				commands: ["rm -rf", "chmod 777"],
			}

			// Call handler
			await webviewMessageHandler(mockProvider, message as any)

			// Verify the pattern was removed
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("deniedCommands", ["rm -rf", "chmod 777"])

			// Note: We no longer update VS Code workspace settings, only global state
		})

		it("should handle empty denied commands list", async () => {
			// Create message with empty commands
			const message = {
				type: "deniedCommands",
				commands: [],
			}

			// Call handler
			await webviewMessageHandler(mockProvider, message as any)

			// Verify the commands were cleared
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("deniedCommands", [])

			// Note: We no longer update VS Code workspace settings, only global state
		})

		it("should filter out invalid commands", async () => {
			// Create message with some invalid commands
			const message = {
				type: "deniedCommands",
				commands: ["rm -rf", "", "  ", null, undefined, false, "sudo"],
			}

			// Call handler
			await webviewMessageHandler(mockProvider, message as any)

			// Verify only valid commands were kept
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("deniedCommands", ["rm -rf", "sudo"])
		})
	})

	describe("interaction between allowed and denied commands", () => {
		it("should handle switching a command from allowed to denied", async () => {
			// First, set up allowed commands
			await webviewMessageHandler(mockProvider, {
				type: "allowedCommands",
				commands: ["npm test", "git status"],
			} as any)

			// Then move "git status" to denied
			await webviewMessageHandler(mockProvider, {
				type: "allowedCommands",
				commands: ["npm test"],
			} as any)

			await webviewMessageHandler(mockProvider, {
				type: "deniedCommands",
				commands: ["git status"],
			} as any)

			// Verify both lists were updated correctly
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("allowedCommands", ["npm test"])
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("deniedCommands", ["git status"])
		})
	})
})
