// npx vitest run src/integrations/terminal/__tests__/TerminalRegistry.workingDirectory.spec.ts

import * as vscode from "vscode"
import { Terminal } from "../Terminal"
import { TerminalRegistry } from "../TerminalRegistry"

vi.mock("execa", () => ({
	execa: vi.fn(),
}))

describe("TerminalRegistry - Working Directory Tracking", () => {
	let mockCreateTerminal: any

	beforeEach(() => {
		// Clear any existing terminals
		TerminalRegistry["terminals"] = []

		mockCreateTerminal = vi.spyOn(vscode.window, "createTerminal").mockImplementation((...args: any[]) => {
			const mockShellIntegration = {
				executeCommand: vi.fn(),
				cwd: vscode.Uri.file("/test/path"), // Initial working directory
			}

			return {
				exitStatus: undefined,
				name: "Roo Code",
				processId: Promise.resolve(123),
				creationOptions: {},
				state: {
					isInteractedWith: true,
					shell: { id: "test-shell", executable: "/bin/bash", args: [] },
				},
				dispose: vi.fn(),
				hide: vi.fn(),
				show: vi.fn(),
				sendText: vi.fn(),
				shellIntegration: mockShellIntegration,
			} as any
		})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("getOrCreateTerminal with changed working directory", () => {
		it("should reuse task terminal regardless of current working directory when requiredCwd is false", async () => {
			// Create a terminal with initial working directory
			const terminal1 = await TerminalRegistry.getOrCreateTerminal("/test/path", false, "task1", "vscode")

			// Simulate the terminal's working directory changing (like after cd command)
			if (terminal1 instanceof Terminal) {
				// Mock the shell integration to return the new working directory
				Object.defineProperty(terminal1.terminal.shellIntegration!, "cwd", {
					value: vscode.Uri.file("/test/path/subdir"),
					writable: true,
					configurable: true,
				})
			}

			// Mark terminal as not busy
			terminal1.busy = false

			// Request a terminal for a different working directory but same task
			const terminal2 = await TerminalRegistry.getOrCreateTerminal("/test/path/other", false, "task1", "vscode")

			// Should reuse the same terminal since it's the same task and requiredCwd is false
			expect(terminal2).toBe(terminal1)
			expect(mockCreateTerminal).toHaveBeenCalledTimes(1) // Only one terminal created
		})

		it("should create new terminal when requiredCwd is true and current working directory doesn't match", async () => {
			// Create a terminal with initial working directory
			const terminal1 = await TerminalRegistry.getOrCreateTerminal("/test/path", false, "task1", "vscode")

			// Simulate the terminal's working directory changing (like after cd command)
			if (terminal1 instanceof Terminal) {
				// Mock the shell integration to return the new working directory
				Object.defineProperty(terminal1.terminal.shellIntegration!, "cwd", {
					value: vscode.Uri.file("/test/path/subdir"),
					writable: true,
					configurable: true,
				})
			}

			// Mark terminal as not busy
			terminal1.busy = false

			// Request a terminal for a different working directory with requiredCwd=true
			const terminal2 = await TerminalRegistry.getOrCreateTerminal("/test/path/other", true, "task1", "vscode")

			// Should create a new terminal since requiredCwd is true and directories don't match
			expect(terminal2).not.toBe(terminal1)
			expect(mockCreateTerminal).toHaveBeenCalledTimes(2) // Two terminals created
		})

		it("should reuse terminal when requiredCwd is true and current working directory matches", async () => {
			// Create a terminal with initial working directory
			const terminal1 = await TerminalRegistry.getOrCreateTerminal("/test/path", false, "task1", "vscode")

			// Simulate the terminal's working directory changing (like after cd command)
			if (terminal1 instanceof Terminal) {
				// Mock the shell integration to return the new working directory
				Object.defineProperty(terminal1.terminal.shellIntegration!, "cwd", {
					value: vscode.Uri.file("/test/path/subdir"),
					writable: true,
					configurable: true,
				})
			}

			// Mark terminal as not busy
			terminal1.busy = false

			// Request a terminal for the same working directory with requiredCwd=true
			const terminal2 = await TerminalRegistry.getOrCreateTerminal("/test/path/subdir", true, "task1", "vscode")

			// Should reuse the same terminal since directories match
			expect(terminal2).toBe(terminal1)
			expect(mockCreateTerminal).toHaveBeenCalledTimes(1) // Only one terminal created
		})

		it("should handle terminals without shell integration gracefully", async () => {
			// Create a terminal without shell integration
			mockCreateTerminal.mockImplementationOnce(
				(...args: any[]) =>
					({
						exitStatus: undefined,
						name: "Roo Code",
						processId: Promise.resolve(123),
						creationOptions: {},
						state: {
							isInteractedWith: true,
							shell: { id: "test-shell", executable: "/bin/bash", args: [] },
						},
						dispose: vi.fn(),
						hide: vi.fn(),
						show: vi.fn(),
						sendText: vi.fn(),
						shellIntegration: undefined, // No shell integration
					}) as any,
			)

			const terminal1 = await TerminalRegistry.getOrCreateTerminal("/test/path", false, "task1", "vscode")
			terminal1.busy = false

			// Request a terminal for the same task
			const terminal2 = await TerminalRegistry.getOrCreateTerminal("/test/path", false, "task1", "vscode")

			// Should reuse the same terminal since it's the same task
			expect(terminal2).toBe(terminal1)
			expect(mockCreateTerminal).toHaveBeenCalledTimes(1)
		})

		it("should create separate terminals for different tasks", async () => {
			// Create a terminal for task1
			const terminal1 = await TerminalRegistry.getOrCreateTerminal("/test/path", false, "task1", "vscode")

			// Create a terminal for task2 - should create a new terminal
			const terminal2 = await TerminalRegistry.getOrCreateTerminal("/test/path", false, "task2", "vscode")

			// Should be different terminals
			expect(terminal2).not.toBe(terminal1)
			expect(mockCreateTerminal).toHaveBeenCalledTimes(2)
		})
	})
})
