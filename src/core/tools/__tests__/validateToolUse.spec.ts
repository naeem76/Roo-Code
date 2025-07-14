// npx vitest run src/core/tools/__tests__/validateToolUse.spec.ts

import type { ModeConfig } from "@roo-code/types"

import { isToolAllowedForMode, modes } from "../../../shared/modes"
import { TOOL_GROUPS } from "../../../shared/tools"

import { validateToolUse } from "../validateToolUse"

const codeMode = modes.find((m) => m.slug === "code")?.slug || "code"
const architectMode = modes.find((m) => m.slug === "architect")?.slug || "architect"
const askMode = modes.find((m) => m.slug === "ask")?.slug || "ask"

describe("mode-validator", () => {
	describe("isToolAllowedForMode", () => {
		describe("code mode", () => {
			it("allows all code mode tools", () => {
				// Code mode has all groups
				Object.entries(TOOL_GROUPS).forEach(([_, config]) => {
					config.tools.forEach((tool: string) => {
						expect(isToolAllowedForMode(tool, codeMode, [])).toBe(true)
					})
				})
			})

			it("disallows unknown tools", () => {
				expect(isToolAllowedForMode("unknown_tool" as any, codeMode, [])).toBe(false)
			})
		})

		describe("architect mode", () => {
			it("allows configured tools", () => {
				// Architect mode has read, browser, and mcp groups
				const architectTools = [
					...TOOL_GROUPS.read.tools,
					...TOOL_GROUPS.browser.tools,
					...TOOL_GROUPS.mcp.tools,
				]
				architectTools.forEach((tool) => {
					expect(isToolAllowedForMode(tool, architectMode, [])).toBe(true)
				})
			})
		})

		describe("ask mode", () => {
			it("allows configured tools", () => {
				// Ask mode has read, browser, and mcp groups
				const askTools = [...TOOL_GROUPS.read.tools, ...TOOL_GROUPS.browser.tools, ...TOOL_GROUPS.mcp.tools]
				askTools.forEach((tool) => {
					expect(isToolAllowedForMode(tool, askMode, [])).toBe(true)
				})
			})
		})

		describe("custom modes", () => {
			it("allows tools from custom mode configuration", () => {
				const customModes: ModeConfig[] = [
					{
						slug: "custom-mode",
						name: "Custom Mode",
						roleDefinition: "Custom role",
						groups: ["read", "edit"] as const,
					},
				]
				// Should allow tools from read and edit groups
				expect(isToolAllowedForMode("read_file", "custom-mode", customModes)).toBe(true)
				expect(isToolAllowedForMode("write_to_file", "custom-mode", customModes)).toBe(true)
				// Should not allow tools from other groups
				expect(isToolAllowedForMode("execute_command", "custom-mode", customModes)).toBe(false)
			})

			it("allows custom mode to override built-in mode", () => {
				const customModes: ModeConfig[] = [
					{
						slug: codeMode,
						name: "Custom Code Mode",
						roleDefinition: "Custom role",
						groups: ["read"] as const,
					},
				]
				// Should allow tools from read group
				expect(isToolAllowedForMode("read_file", codeMode, customModes)).toBe(true)
				// Should not allow tools from other groups
				expect(isToolAllowedForMode("write_to_file", codeMode, customModes)).toBe(false)
			})

			it("respects tool requirements in custom modes", () => {
				const customModes: ModeConfig[] = [
					{
						slug: "custom-mode",
						name: "Custom Mode",
						roleDefinition: "Custom role",
						groups: ["edit"] as const,
					},
				]
				const requirements = { apply_diff: false }

				// Should respect disabled requirement even if tool group is allowed
				expect(isToolAllowedForMode("apply_diff", "custom-mode", customModes, requirements)).toBe(false)

				// Should allow other edit tools
				expect(isToolAllowedForMode("write_to_file", "custom-mode", customModes, requirements)).toBe(true)
			})
		})

		describe("tool requirements", () => {
			it("respects tool requirements when provided", () => {
				const requirements = { apply_diff: false }
				expect(isToolAllowedForMode("apply_diff", codeMode, [], requirements)).toBe(false)

				const enabledRequirements = { apply_diff: true }
				expect(isToolAllowedForMode("apply_diff", codeMode, [], enabledRequirements)).toBe(true)
			})

			it("allows tools when their requirements are not specified", () => {
				const requirements = { some_other_tool: true }
				expect(isToolAllowedForMode("apply_diff", codeMode, [], requirements)).toBe(true)
			})

			it("handles undefined and empty requirements", () => {
				expect(isToolAllowedForMode("apply_diff", codeMode, [], undefined)).toBe(true)
				expect(isToolAllowedForMode("apply_diff", codeMode, [], {})).toBe(true)
			})

			it("prioritizes requirements over mode configuration", () => {
				const requirements = { apply_diff: false }
				// Even in code mode which allows all tools, disabled requirement should take precedence
				expect(isToolAllowedForMode("apply_diff", codeMode, [], requirements)).toBe(false)
			})
		})

		describe("disableTaskLists", () => {
			it("disallows update_todo_list when disableTaskLists is true", () => {
				const customModes: ModeConfig[] = [
					{
						slug: "no-tasks-mode",
						name: "No Tasks Mode",
						roleDefinition: "A mode without task lists",
						groups: ["read"] as const,
						disableTaskLists: true,
					},
				]
				// Should not allow update_todo_list tool
				expect(isToolAllowedForMode("update_todo_list", "no-tasks-mode", customModes)).toBe(false)
				// Should still allow other always available tools
				expect(isToolAllowedForMode("ask_followup_question", "no-tasks-mode", customModes)).toBe(true)
				expect(isToolAllowedForMode("attempt_completion", "no-tasks-mode", customModes)).toBe(true)
			})

			it("allows update_todo_list when disableTaskLists is false", () => {
				const customModes: ModeConfig[] = [
					{
						slug: "tasks-mode",
						name: "Tasks Mode",
						roleDefinition: "A mode with task lists",
						groups: ["read"] as const,
						disableTaskLists: false,
					},
				]
				// Should allow update_todo_list tool
				expect(isToolAllowedForMode("update_todo_list", "tasks-mode", customModes)).toBe(true)
			})

			it("allows update_todo_list when disableTaskLists is undefined", () => {
				const customModes: ModeConfig[] = [
					{
						slug: "default-mode",
						name: "Default Mode",
						roleDefinition: "A mode with default task list behavior",
						groups: ["read"] as const,
					},
				]
				// Should allow update_todo_list tool by default
				expect(isToolAllowedForMode("update_todo_list", "default-mode", customModes)).toBe(true)
			})

			it("allows update_todo_list in built-in modes", () => {
				// Built-in modes should always allow update_todo_list
				expect(isToolAllowedForMode("update_todo_list", codeMode, [])).toBe(true)
				expect(isToolAllowedForMode("update_todo_list", architectMode, [])).toBe(true)
				expect(isToolAllowedForMode("update_todo_list", askMode, [])).toBe(true)
			})
		})
	})

	describe("validateToolUse", () => {
		it("throws error for disallowed tools in architect mode", () => {
			expect(() => validateToolUse("unknown_tool" as any, "architect", [])).toThrow(
				'Tool "unknown_tool" is not allowed in architect mode.',
			)
		})

		it("does not throw for allowed tools in architect mode", () => {
			expect(() => validateToolUse("read_file", "architect", [])).not.toThrow()
		})

		it("throws error when tool requirement is not met", () => {
			const requirements = { apply_diff: false }
			expect(() => validateToolUse("apply_diff", codeMode, [], requirements)).toThrow(
				'Tool "apply_diff" is not allowed in code mode.',
			)
		})

		it("does not throw when tool requirement is met", () => {
			const requirements = { apply_diff: true }
			expect(() => validateToolUse("apply_diff", codeMode, [], requirements)).not.toThrow()
		})

		it("handles undefined requirements gracefully", () => {
			expect(() => validateToolUse("apply_diff", codeMode, [], undefined)).not.toThrow()
		})
	})
})
