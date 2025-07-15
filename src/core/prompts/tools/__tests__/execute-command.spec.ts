import { describe, it, expect } from "vitest"
import { getExecuteCommandDescription } from "../execute-command"
import { ToolArgs } from "../types"

describe("getExecuteCommandDescription", () => {
	const baseArgs: ToolArgs = {
		cwd: "/test/path",
		supportsComputerUse: false,
	}

	it("should not include suggestions section", () => {
		const args: ToolArgs = {
			...baseArgs,
			settings: {},
		}

		const description = getExecuteCommandDescription(args)

		// Check that the description does NOT include the suggestions parameter
		expect(description).not.toContain("<suggestions>")
		expect(description).not.toContain("- suggestions: (optional) Command patterns for the user to allow/deny")
		expect(description).not.toContain("Suggestion Guidelines")
		expect(description).not.toContain("For chained commands")
	})

	it("should include basic command and cwd parameters", () => {
		const args: ToolArgs = {
			...baseArgs,
			settings: {},
		}

		const description = getExecuteCommandDescription(args)

		// Check that basic parameters are always included
		expect(description).toContain("- command: (required)")
		expect(description).toContain("- cwd: (optional)")
		expect(description).toContain("execute_command")
		expect(description).toContain("/test/path")
	})

	it("should include usage examples", () => {
		const args: ToolArgs = {
			...baseArgs,
			settings: {},
		}

		const description = getExecuteCommandDescription(args)

		// Check that usage examples are included
		expect(description).toContain("Usage:")
		expect(description).toContain("<execute_command>")
		expect(description).toContain("Example: Requesting to execute npm run dev")
		expect(description).toContain("Example: Requesting to execute ls in a specific directory")
	})
})
