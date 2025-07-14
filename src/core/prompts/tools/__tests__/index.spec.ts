// npx vitest run src/core/prompts/tools/__tests__/index.spec.ts

import type { ModeConfig } from "@roo-code/types"

import { getToolDescriptionsForMode } from "../index"

describe("getToolDescriptionsForMode", () => {
	describe("disableTaskLists", () => {
		it("excludes update_todo_list from tool descriptions when disableTaskLists is true", () => {
			const customModes: ModeConfig[] = [
				{
					slug: "no-tasks-mode",
					name: "No Tasks Mode",
					roleDefinition: "A mode without task lists",
					groups: ["read"] as const,
					disableTaskLists: true,
				},
			]

			const toolDescriptions = getToolDescriptionsForMode(
				"no-tasks-mode",
				"/test/cwd",
				false, // supportsComputerUse
				undefined, // codeIndexManager
				undefined, // diffStrategy
				undefined, // browserViewportSize
				undefined, // mcpHub
				customModes,
				{}, // experiments
				false, // partialReadsEnabled
				{}, // settings
			)

			// Should not contain update_todo_list tool description
			expect(toolDescriptions).not.toContain("update_todo_list")
			expect(toolDescriptions).not.toContain("## update_todo_list")

			// Should still contain other always available tools
			expect(toolDescriptions).toContain("ask_followup_question")
			expect(toolDescriptions).toContain("attempt_completion")
		})

		it("includes update_todo_list in tool descriptions when disableTaskLists is false", () => {
			const customModes: ModeConfig[] = [
				{
					slug: "tasks-mode",
					name: "Tasks Mode",
					roleDefinition: "A mode with task lists",
					groups: ["read"] as const,
					disableTaskLists: false,
				},
			]

			const toolDescriptions = getToolDescriptionsForMode(
				"tasks-mode",
				"/test/cwd",
				false, // supportsComputerUse
				undefined, // codeIndexManager
				undefined, // diffStrategy
				undefined, // browserViewportSize
				undefined, // mcpHub
				customModes,
				{}, // experiments
				false, // partialReadsEnabled
				{}, // settings
			)

			// Should contain update_todo_list tool description
			expect(toolDescriptions).toContain("## update_todo_list")
		})

		it("includes update_todo_list in tool descriptions when disableTaskLists is undefined", () => {
			const customModes: ModeConfig[] = [
				{
					slug: "default-mode",
					name: "Default Mode",
					roleDefinition: "A mode with default task list behavior",
					groups: ["read"] as const,
				},
			]

			const toolDescriptions = getToolDescriptionsForMode(
				"default-mode",
				"/test/cwd",
				false, // supportsComputerUse
				undefined, // codeIndexManager
				undefined, // diffStrategy
				undefined, // browserViewportSize
				undefined, // mcpHub
				customModes,
				{}, // experiments
				false, // partialReadsEnabled
				{}, // settings
			)

			// Should contain update_todo_list tool description by default
			expect(toolDescriptions).toContain("## update_todo_list")
		})

		it("includes update_todo_list in built-in mode tool descriptions", () => {
			const toolDescriptions = getToolDescriptionsForMode(
				"code",
				"/test/cwd",
				false, // supportsComputerUse
				undefined, // codeIndexManager
				undefined, // diffStrategy
				undefined, // browserViewportSize
				undefined, // mcpHub
				[], // customModes
				{}, // experiments
				false, // partialReadsEnabled
				{}, // settings
			)

			// Built-in modes should always include update_todo_list
			expect(toolDescriptions).toContain("## update_todo_list")
		})
	})
})
