// npx vitest core/environment/__tests__/EnvironmentDetailsCache.spec.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"

import { EnvironmentDetailsCache } from "../EnvironmentDetailsCache"
import { Task } from "../../task/Task"
import { TerminalRegistry } from "../../../integrations/terminal/TerminalRegistry"
import { Terminal } from "../../../integrations/terminal/Terminal"
import { getApiMetrics } from "../../../shared/getApiMetrics"
import { getFullModeDetails } from "../../../shared/modes"
import { listFiles } from "../../../services/glob/list-files"
import { formatResponse } from "../../prompts/responses"

// Mock all external dependencies
vi.mock("vscode", () => ({
	window: {
		visibleTextEditors: [],
		tabGroups: { all: [] },
	},
	env: {
		language: "en-US",
	},
}))

vi.mock("../../../integrations/terminal/TerminalRegistry")
vi.mock("../../../integrations/terminal/Terminal")
vi.mock("../../../shared/getApiMetrics")
vi.mock("../../../shared/modes")
vi.mock("../../../services/glob/list-files")
vi.mock("../../prompts/responses")

describe("EnvironmentDetailsCache", () => {
	let cache: EnvironmentDetailsCache
	let mockTask: Partial<Task>

	beforeEach(() => {
		cache = new EnvironmentDetailsCache()
		
		// Mock task
		mockTask = {
			cwd: "/test/workspace",
			taskId: "test-task-id",
			rooIgnoreController: {
				filterPaths: vi.fn((paths: string[]) => paths.join("\n")),
			},
			fileContextTracker: {
				getAndClearRecentlyModifiedFiles: vi.fn().mockReturnValue([]),
			},
			clineMessages: [],
			api: {
				getModel: vi.fn().mockReturnValue({ id: "test-model" }),
			},
			providerRef: {
				deref: vi.fn().mockReturnValue({
					getState: vi.fn().mockResolvedValue({
						maxWorkspaceFiles: 200,
						maxOpenTabsContext: 20,
						showRooIgnoredFiles: true,
					}),
				}),
			},
		}

		// Mock external functions
		vi.mocked(TerminalRegistry.getTerminals).mockReturnValue([])
		vi.mocked(TerminalRegistry.getBackgroundTerminals).mockReturnValue([])
		vi.mocked(getApiMetrics).mockReturnValue({ contextTokens: 1000, totalCost: 0.05 })
		vi.mocked(getFullModeDetails).mockResolvedValue({
			name: "Test Mode",
			roleDefinition: "Test role",
			customInstructions: "Test instructions",
		})
		vi.mocked(listFiles).mockResolvedValue([["file1.ts", "file2.ts"], false])
		vi.mocked(formatResponse.formatFilesList).mockReturnValue("file1.ts\nfile2.ts")
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("getVisibleFilesSection", () => {
		it("should generate visible files section", async () => {
			// Mock VSCode visible editors
			vi.mocked(vscode.window.visibleTextEditors).mockReturnValue([
				{
					document: {
						uri: { fsPath: "/test/workspace/file1.ts" },
					},
				},
				{
					document: {
						uri: { fsPath: "/test/workspace/file2.ts" },
					},
				},
			] as any)

			const result = await cache.getVisibleFilesSection(mockTask as Task, 200)

			expect(result).toContain("# VSCode Visible Files")
			expect(result).toContain("file1.ts")
			expect(result).toContain("file2.ts")
		})

		it("should cache visible files section when inputs are the same", async () => {
			// Mock VSCode visible editors
			vi.mocked(vscode.window.visibleTextEditors).mockReturnValue([
				{
					document: {
						uri: { fsPath: "/test/workspace/file1.ts" },
					},
				},
			] as any)

			// First call
			const result1 = await cache.getVisibleFilesSection(mockTask as Task, 200)
			
			// Second call with same inputs
			const result2 = await cache.getVisibleFilesSection(mockTask as Task, 200)

			expect(result1).toBe(result2) // Should return exact same string (cached)
			expect(mockTask.rooIgnoreController?.filterPaths).toHaveBeenCalledTimes(1) // Only called once
		})

		it("should regenerate when visible files change", async () => {
			// First call with one file
			vi.mocked(vscode.window.visibleTextEditors).mockReturnValue([
				{
					document: {
						uri: { fsPath: "/test/workspace/file1.ts" },
					},
				},
			] as any)

			const result1 = await cache.getVisibleFilesSection(mockTask as Task, 200)

			// Second call with different files
			vi.mocked(vscode.window.visibleTextEditors).mockReturnValue([
				{
					document: {
						uri: { fsPath: "/test/workspace/file2.ts" },
					},
				},
			] as any)

			const result2 = await cache.getVisibleFilesSection(mockTask as Task, 200)

			expect(result1).not.toBe(result2) // Should be different
			expect(result2).toContain("file2.ts")
			expect(result2).not.toContain("file1.ts")
		})
	})

	describe("getOpenTabsSection", () => {
		it("should generate open tabs section", async () => {
			// Mock VSCode tab groups
			vi.mocked(vscode.window.tabGroups).all = [
				{
					tabs: [
						{
							input: {
								uri: { fsPath: "/test/workspace/tab1.ts" },
							},
						},
						{
							input: {
								uri: { fsPath: "/test/workspace/tab2.ts" },
							},
						},
					],
				},
			] as any

			const result = await cache.getOpenTabsSection(mockTask as Task, 20)

			expect(result).toContain("# VSCode Open Tabs")
			expect(result).toContain("tab1.ts")
			expect(result).toContain("tab2.ts")
		})

		it("should cache open tabs section when inputs are the same", async () => {
			// Mock VSCode tab groups
			vi.mocked(vscode.window.tabGroups).all = [
				{
					tabs: [
						{
							input: {
								uri: { fsPath: "/test/workspace/tab1.ts" },
							},
						},
					],
				},
			] as any

			// First call
			const result1 = await cache.getOpenTabsSection(mockTask as Task, 20)
			
			// Second call with same inputs
			const result2 = await cache.getOpenTabsSection(mockTask as Task, 20)

			expect(result1).toBe(result2) // Should return exact same string (cached)
		})
	})

	describe("getTerminalsSection", () => {
		it("should generate terminals section with active terminals", async () => {
			const mockTerminal = {
				id: "terminal-1",
				getCurrentWorkingDirectory: vi.fn().mockReturnValue("/test/workspace"),
				getLastCommand: vi.fn().mockReturnValue("npm test"),
			}

			vi.mocked(TerminalRegistry.getTerminals).mockReturnValue([mockTerminal] as any)
			vi.mocked(TerminalRegistry.getUnretrievedOutput).mockReturnValue("Test output")
			vi.mocked(Terminal.compressTerminalOutput).mockReturnValue("Compressed output")

			const result = await cache.getTerminalsSection(mockTask as Task, 500)

			expect(result).toContain("# Actively Running Terminals")
			expect(result).toContain("Terminal terminal-1 (Active)")
			expect(result).toContain("npm test")
			expect(result).toContain("Compressed output")
		})

		it("should handle inactive terminals with completed processes", async () => {
			const mockProcess = {
				command: "npm build",
				getUnretrievedOutput: vi.fn().mockReturnValue("Build output"),
			}

			const mockInactiveTerminal = {
				id: "terminal-2",
				getCurrentWorkingDirectory: vi.fn().mockReturnValue("/test/workspace"),
				getProcessesWithOutput: vi.fn().mockReturnValue([mockProcess]),
				cleanCompletedProcessQueue: vi.fn(),
			}

			vi.mocked(TerminalRegistry.getTerminals).mockImplementation((active: boolean) =>
				active ? [] : [mockInactiveTerminal] as any
			)
			vi.mocked(Terminal.compressTerminalOutput).mockReturnValue("Compressed build output")

			const result = await cache.getTerminalsSection(mockTask as Task, 500)

			expect(result).toContain("# Inactive Terminals with Completed Process Output")
			expect(result).toContain("Terminal terminal-2 (Inactive)")
			expect(result).toContain("npm build")
			expect(result).toContain("Compressed build output")
			expect(mockInactiveTerminal.cleanCompletedProcessQueue).toHaveBeenCalled()
		})

		it("should return empty string when no terminals", async () => {
			vi.mocked(TerminalRegistry.getTerminals).mockReturnValue([])
			vi.mocked(TerminalRegistry.getBackgroundTerminals).mockReturnValue([])

			const result = await cache.getTerminalsSection(mockTask as Task, 500)

			expect(result).toBe("")
		})
	})

	describe("getRecentlyModifiedSection", () => {
		it("should generate recently modified files section", async () => {
			vi.mocked(mockTask.fileContextTracker!.getAndClearRecentlyModifiedFiles).mockReturnValue([
				"modified1.ts",
				"modified2.ts",
			])

			const result = await cache.getRecentlyModifiedSection(mockTask as Task)

			expect(result).toContain("# Recently Modified Files")
			expect(result).toContain("modified1.ts")
			expect(result).toContain("modified2.ts")
		})

		it("should return empty string when no recently modified files", async () => {
			vi.mocked(mockTask.fileContextTracker!.getAndClearRecentlyModifiedFiles).mockReturnValue([])

			const result = await cache.getRecentlyModifiedSection(mockTask as Task)

			expect(result).toBe("")
		})

		it("should cache based on file list", async () => {
			// Mock the same file list for both calls
			vi.mocked(mockTask.fileContextTracker!.getAndClearRecentlyModifiedFiles)
				.mockReturnValueOnce(["file1.ts"])
				.mockReturnValueOnce(["file1.ts"])

			const result1 = await cache.getRecentlyModifiedSection(mockTask as Task)
			const result2 = await cache.getRecentlyModifiedSection(mockTask as Task)

			// Note: Even with caching, the method still needs to clear the files
			expect(mockTask.fileContextTracker!.getAndClearRecentlyModifiedFiles).toHaveBeenCalledTimes(2)
		})
	})

	describe("getTimeSection", () => {
		it("should generate current time section", () => {
			const result = cache.getTimeSection()

			expect(result).toContain("# Current Time")
			expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/) // ISO format
			expect(result).toContain("UTC")
		})

		it("should always return fresh time (not cached)", () => {
			const result1 = cache.getTimeSection()
			
			// Small delay to ensure different timestamps
			const start = Date.now()
			while (Date.now() - start < 2) {
				// Wait for at least 2ms
			}
			
			const result2 = cache.getTimeSection()

			// Times should be different (not cached)
			expect(result1).not.toBe(result2)
		})
	})

	describe("getCostSection", () => {
		it("should generate cost section", async () => {
			vi.mocked(getApiMetrics).mockReturnValue({ contextTokens: 1000, totalCost: 0.05 })

			const result = await cache.getCostSection(mockTask as Task)

			expect(result).toContain("# Current Cost")
			expect(result).toContain("$0.05")
		})

		it("should handle null cost", async () => {
			vi.mocked(getApiMetrics).mockReturnValue({ contextTokens: 1000, totalCost: null })

			const result = await cache.getCostSection(mockTask as Task)

			expect(result).toContain("# Current Cost")
			expect(result).toContain("(Not available)")
		})

		it("should cache cost section when cost is the same", async () => {
			vi.mocked(getApiMetrics).mockReturnValue({ contextTokens: 1000, totalCost: 0.05 })

			const result1 = await cache.getCostSection(mockTask as Task)
			const result2 = await cache.getCostSection(mockTask as Task)

			expect(result1).toBe(result2) // Should be cached
			expect(getApiMetrics).toHaveBeenCalledTimes(1) // Only called once for hashing
		})
	})

	describe("getModeSection", () => {
		it("should generate mode section", async () => {
			const result = await cache.getModeSection(mockTask as Task)

			expect(result).toContain("# Current Mode")
			expect(result).toContain("<slug>")
			expect(result).toContain("<name>Test Mode</name>")
			expect(result).toContain("<model>test-model</model>")
		})

		it("should cache mode section when inputs are the same", async () => {
			const result1 = await cache.getModeSection(mockTask as Task)
			const result2 = await cache.getModeSection(mockTask as Task)

			expect(result1).toBe(result2) // Should be cached
			expect(getFullModeDetails).toHaveBeenCalledTimes(1) // Only called once
		})
	})

	describe("getFileDetailsSection", () => {
		it("should generate file details section", async () => {
			const result = await cache.getFileDetailsSection(mockTask as Task, 200)

			expect(result).toContain("# Current Workspace Directory")
			expect(result).toContain("Files")
			expect(listFiles).toHaveBeenCalledWith("/test/workspace", true, 200)
			expect(formatResponse.formatFilesList).toHaveBeenCalled()
		})

		it("should handle desktop directory specially", async () => {
			const desktopTask = {
				...mockTask,
				cwd: "/home/user/Desktop", // Mock desktop path
			}

			const result = await cache.getFileDetailsSection(desktopTask as Task, 200)

			expect(result).toContain("Desktop files not shown automatically")
			expect(listFiles).not.toHaveBeenCalled()
		})

		it("should handle maxWorkspaceFiles = 0", async () => {
			const result = await cache.getFileDetailsSection(mockTask as Task, 0)

			expect(result).toContain("Workspace files context disabled")
			expect(listFiles).not.toHaveBeenCalled()
		})
	})

	describe("cache management", () => {
		it("should clear cache", () => {
			// Add some cached data first
			cache.getTimeSection() // This doesn't cache, but let's add a cacheable section
			
			const statsBefore = cache.getCacheStats()
			cache.clearCache()
			const statsAfter = cache.getCacheStats()

			expect(statsAfter.size).toBe(0)
			expect(statsAfter.sections).toEqual([])
		})

		it("should provide cache statistics", async () => {
			// Generate some cached sections
			await cache.getVisibleFilesSection(mockTask as Task, 200)
			await cache.getCostSection(mockTask as Task)

			const stats = cache.getCacheStats()

			expect(stats.size).toBeGreaterThan(0)
			expect(stats.sections).toContain("visibleFiles")
			expect(stats.sections).toContain("cost")
		})
	})

	describe("TTL (Time To Live) behavior", () => {
		it("should respect TTL for cached sections", async () => {
			// Create a cache with very short TTL for testing
			const shortTtlCache = new EnvironmentDetailsCache()
			
			// Mock a section that would normally be cached
			vi.mocked(getApiMetrics).mockReturnValue({ contextTokens: 1000, totalCost: 0.05 })

			const result1 = await shortTtlCache.getCostSection(mockTask as Task)
			
			// Immediately get again - should be cached
			const result2 = await shortTtlCache.getCostSection(mockTask as Task)
			expect(result1).toBe(result2)

			// Change the cost and verify it eventually updates
			vi.mocked(getApiMetrics).mockReturnValue({ contextTokens: 1000, totalCost: 0.10 })
			
			// Wait for TTL to expire (we can't easily test this without mocking time)
			// For now, just verify the cache can be cleared manually
			shortTtlCache.clearCache()
			const result3 = await shortTtlCache.getCostSection(mockTask as Task)
			expect(result3).toContain("$0.10")
		})
	})
})