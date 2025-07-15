import { describe, it, expect } from "vitest"
import { getExecuteCommandDescription } from "../execute-command"
import { ToolArgs } from "../types"

describe("getExecuteCommandDescription", () => {
	const baseArgs: ToolArgs = {
		cwd: "/test/path",
		supportsComputerUse: false,
	}

	it("should include suggestions section when disableLlmCommandSuggestions is false", () => {
		const args: ToolArgs = {
			...baseArgs,
			settings: {
				disableLlmCommandSuggestions: false,
			},
		}

		const description = getExecuteCommandDescription(args)

		// Check that the description includes the suggestions parameter
		expect(description).toContain("<suggestions>")
		expect(description).toContain("- suggestions: (optional) Command patterns for the user to allow/deny")
		expect(description).toContain("Suggestion Guidelines")
		// Check for chained command guidance
		expect(description).toContain("For chained commands")
		expect(description).toContain("cd backend && npm install")
	})

	it("should include suggestions section when disableLlmCommandSuggestions is not set", () => {
		const args: ToolArgs = {
			...baseArgs,
			settings: {},
		}

		const description = getExecuteCommandDescription(args)

		// Check that the description includes the suggestions parameter
		expect(description).toContain("<suggestions>")
		expect(description).toContain("- suggestions: (optional) Command patterns for the user to allow/deny")
		expect(description).toContain("Suggestion Guidelines")
	})

	it("should exclude suggestions section when disableLlmCommandSuggestions is true", () => {
		const args: ToolArgs = {
			...baseArgs,
			settings: {
				disableLlmCommandSuggestions: true,
			},
		}

		const description = getExecuteCommandDescription(args)

		// Check that the description does NOT include the suggestions parameter
		expect(description).not.toContain("<suggestions>")
		expect(description).not.toContain("- suggestions: (optional) Command patterns for the user to allow/deny")
		expect(description).not.toContain("Suggestion Guidelines")
	})

	it("should include basic command and cwd parameters regardless of settings", () => {
		const args: ToolArgs = {
			...baseArgs,
			settings: {
				disableLlmCommandSuggestions: true,
			},
		}

		const description = getExecuteCommandDescription(args)

		// Check that basic parameters are always included
		expect(description).toContain("- command: (required)")
		expect(description).toContain("- cwd: (optional)")
		expect(description).toContain("execute_command")
	})
})
