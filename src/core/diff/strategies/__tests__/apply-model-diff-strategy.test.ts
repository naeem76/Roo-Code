import { describe, it, expect, vi, beforeEach } from "vitest"
import { ApplyModelDiffStrategy } from "../apply-model-diff-strategy"
import { Task } from "../../../task/Task"

// Mock the Task class
const mockTask = {
	providerRef: {
		deref: () => ({
			getSettings: () => ({
				applyModelEnabled: false,
				applyModelProvider: "openai",
				applyModelId: "gpt-4",
				applyModelApiKey: "test-key",
				applyModelBaseUrl: "https://api.openai.com/v1",
				applyModelTemperature: 0.1,
			}),
		}),
	},
} as unknown as Task

describe("ApplyModelDiffStrategy", () => {
	let strategy: ApplyModelDiffStrategy

	beforeEach(() => {
		strategy = new ApplyModelDiffStrategy(mockTask, 1.0)
	})

	it("should have correct name", () => {
		expect(strategy.getName()).toBe("ApplyModel")
	})

	it("should return tool description", () => {
		const description = strategy.getToolDescription({ cwd: "/test" })
		expect(description).toContain("apply_diff")
		expect(description).toContain("AI-powered apply model")
		expect(description).toContain("/test")
	})

	it("should handle disabled apply model", async () => {
		const originalContent = "function test() { return 1; }"
		const changeDescription = "Add a comment to the function"

		const result = await strategy.applyDiff(originalContent, changeDescription)

		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error).toContain("Apply model is not enabled")
		}
	})

	it("should handle array-based diff content", async () => {
		const originalContent = "function test() { return 1; }"
		const diffItems = [
			{ content: "Add a comment to the function", startLine: 1 },
			{ content: "Add error handling", startLine: 2 },
		]

		const result = await strategy.applyDiff(originalContent, diffItems)

		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error).toContain("Apply model is not enabled")
		}
	})

	it("should return progress status", () => {
		const toolUse = {
			type: "tool_use" as const,
			name: "apply_diff" as const,
			params: { diff: "test changes" },
			partial: false,
		}

		const status = strategy.getProgressStatus(toolUse)
		expect(status).toHaveProperty("icon", "wand")
	})

	it("should handle partial tool use", () => {
		const toolUse = {
			type: "tool_use" as const,
			name: "apply_diff" as const,
			params: { diff: "test changes" },
			partial: true,
		}

		const status = strategy.getProgressStatus(toolUse)
		expect(status).toHaveProperty("icon", "wand")
		expect(status).toHaveProperty("text", "Analyzing...")
	})

	it("should handle successful result", () => {
		const toolUse = {
			type: "tool_use" as const,
			name: "apply_diff" as const,
			params: { diff: "test changes" },
			partial: false,
		}

		const result = { success: true as const, content: "modified content" }
		const status = strategy.getProgressStatus(toolUse, result)
		expect(status).toHaveProperty("text", "Applied")
	})

	it("should handle failed result", () => {
		const toolUse = {
			type: "tool_use" as const,
			name: "apply_diff" as const,
			params: { diff: "test changes" },
			partial: false,
		}

		const result = { success: false as const, error: "test error" }
		const status = strategy.getProgressStatus(toolUse, result)
		expect(status).toHaveProperty("text", "Failed")
	})
})