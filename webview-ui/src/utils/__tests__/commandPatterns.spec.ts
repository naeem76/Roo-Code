import { describe, it, expect } from "vitest"
import { extractCommandPatterns, getPatternDescription } from "../commandPatterns"

describe("extractCommandPatterns", () => {
	describe("command chains", () => {
		it("should not include the full command chain as a pattern", () => {
			const patterns = extractCommandPatterns("cd backend && npm install")
			expect(patterns).not.toContain("cd backend && npm install")
			expect(patterns).toContain("cd")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm install")
		})

		it("should handle multiple operators", () => {
			const patterns = extractCommandPatterns("git status && git add . || git commit -m 'test'")
			expect(patterns).not.toContain("git status && git add . || git commit -m 'test'")
			expect(patterns).toContain("git")
			expect(patterns).toContain("git status")
			expect(patterns).toContain("git add")
			expect(patterns).toContain("git commit")
		})

		it("should handle pipe operators", () => {
			const patterns = extractCommandPatterns("grep map | head")
			expect(patterns).not.toContain("grep map | head")
			expect(patterns).toContain("grep")
			expect(patterns).toContain("head")
		})

		it("should handle semicolon separators", () => {
			const patterns = extractCommandPatterns("cd src; npm test")
			expect(patterns).not.toContain("cd src; npm test")
			expect(patterns).toContain("cd")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm test")
		})

		it("should handle complex chains from real examples", () => {
			const patterns = extractCommandPatterns(
				"unzip -l builds/roo-cline-3.21.5-error-boundary-component.vsix|grep map|head",
			)
			expect(patterns).not.toContain(
				"unzip -l builds/roo-cline-3.21.5-error-boundary-component.vsix|grep map|head",
			)
			expect(patterns).toContain("unzip")
			expect(patterns).toContain("grep")
			expect(patterns).toContain("head")
		})

		it("should handle chains with spaces around operators", () => {
			const patterns = extractCommandPatterns("git diff | xclip")
			expect(patterns).not.toContain("git diff | xclip")
			expect(patterns).toContain("git")
			expect(patterns).toContain("git diff")
			expect(patterns).toContain("xclip")
		})
	})

	describe("single commands", () => {
		it("should extract base command", () => {
			const patterns = extractCommandPatterns("git")
			expect(patterns).toEqual(["git"])
		})

		it("should extract command with subcommand", () => {
			const patterns = extractCommandPatterns("git status")
			expect(patterns).toContain("git")
			expect(patterns).toContain("git status")
		})

		it("should handle npm run commands", () => {
			const patterns = extractCommandPatterns("npm run test")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm run")
			// Should stop at 'run' to allow any script
		})

		it("should handle script files", () => {
			const patterns = extractCommandPatterns("../repackage.sh")
			expect(patterns).toEqual(["../repackage.sh"])
		})

		it("should stop at flags", () => {
			const patterns = extractCommandPatterns("git diff --stat")
			expect(patterns).toContain("git")
			expect(patterns).toContain("git diff")
			expect(patterns).not.toContain("git diff --stat")
		})

		it("should handle environment variables", () => {
			const patterns = extractCommandPatterns("NODE_ENV=production npm start")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm start")
			expect(patterns).not.toContain("NODE_ENV=production")
		})
	})

	describe("edge cases", () => {
		it("should handle empty command", () => {
			const patterns = extractCommandPatterns("")
			expect(patterns).toEqual([])
		})

		it("should handle whitespace only", () => {
			const patterns = extractCommandPatterns("   ")
			expect(patterns).toEqual([])
		})

		it("should handle quoted strings with operators", () => {
			const patterns = extractCommandPatterns('echo "test && test"')
			expect(patterns).toContain("echo")
			expect(patterns).not.toContain("test")
		})

		it("should return sorted unique patterns", () => {
			const patterns = extractCommandPatterns("git status && git add && git status")
			expect(patterns).toEqual(["git", "git add", "git status"])
		})
	})
})

describe("getPatternDescription", () => {
	it("should describe npm run patterns", () => {
		expect(getPatternDescription("npm run")).toBe("all npm run scripts")
	})

	it("should describe git patterns", () => {
		expect(getPatternDescription("git status")).toBe("git status commands")
	})

	it("should describe script files", () => {
		expect(getPatternDescription("./build.sh")).toBe("this specific script")
	})

	it("should describe cd", () => {
		expect(getPatternDescription("cd")).toBe("directory navigation")
	})

	it("should describe generic commands", () => {
		expect(getPatternDescription("ls")).toBe("ls commands")
	})
})
