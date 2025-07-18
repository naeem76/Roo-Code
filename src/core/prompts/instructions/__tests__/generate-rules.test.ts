import { describe, it, expect } from "vitest"
import {
	generateRulesInstructions,
	ruleTypeDefinitions,
	RulesGenerationOptions,
	RuleInstruction,
} from "../generate-rules"

describe("generateRulesInstructions", () => {
	it("should generate instructions with all options enabled", () => {
		const ruleInstructions: RuleInstruction[] = [ruleTypeDefinitions.general, ruleTypeDefinitions.code]

		const options: RulesGenerationOptions = {
			selectedRuleTypes: ["general", "code"],
			addToGitignore: true,
			alwaysAllowWriteProtected: true,
			includeCustomRules: true,
			customRulesText: "Always use TypeScript",
		}

		const result = generateRulesInstructions(ruleInstructions, options)

		expect(result).toContain("Analyze this codebase and generate comprehensive rules")
		expect(result).toContain("coding-standards.md")
		expect(result).toContain("implementation-rules.md")
		expect(result).toContain("The directory has already been created for you")
		expect(result).toContain("Add the generated files to .gitignore")
		expect(result).toContain("Always use TypeScript")
	})

	it("should generate instructions with minimal options", () => {
		const ruleInstructions: RuleInstruction[] = [ruleTypeDefinitions.general]

		const options: RulesGenerationOptions = {
			selectedRuleTypes: ["general"],
			addToGitignore: false,
			alwaysAllowWriteProtected: false,
			includeCustomRules: false,
			customRulesText: "",
		}

		const result = generateRulesInstructions(ruleInstructions, options)

		expect(result).toContain("Analyze this codebase and generate comprehensive rules")
		expect(result).toContain("coding-standards.md")
		expect(result).toContain("Create the necessary directories if they don't exist")
		expect(result).not.toContain("Add the generated files to .gitignore")
		expect(result).not.toContain("Additional rules from User")
	})

	it("should handle all rule types", () => {
		const allRuleTypes = Object.keys(ruleTypeDefinitions)
		const ruleInstructions: RuleInstruction[] = allRuleTypes.map(
			(type) => ruleTypeDefinitions[type as keyof typeof ruleTypeDefinitions],
		)

		const options: RulesGenerationOptions = {
			selectedRuleTypes: allRuleTypes,
			addToGitignore: false,
			alwaysAllowWriteProtected: false,
			includeCustomRules: false,
			customRulesText: "",
		}

		const result = generateRulesInstructions(ruleInstructions, options)

		expect(result).toContain("coding-standards.md")
		expect(result).toContain("implementation-rules.md")
		expect(result).toContain("architecture-rules.md")
		expect(result).toContain("debugging-rules.md")
		expect(result).toContain("documentation-rules.md")
	})
})

describe("ruleTypeDefinitions", () => {
	it("should have all expected rule types", () => {
		expect(ruleTypeDefinitions).toHaveProperty("general")
		expect(ruleTypeDefinitions).toHaveProperty("code")
		expect(ruleTypeDefinitions).toHaveProperty("architect")
		expect(ruleTypeDefinitions).toHaveProperty("debug")
		expect(ruleTypeDefinitions).toHaveProperty("docs-extractor")
	})

	it("should have proper structure for each rule type", () => {
		Object.values(ruleTypeDefinitions).forEach((rule) => {
			expect(rule).toHaveProperty("path")
			expect(rule).toHaveProperty("focus")
			expect(rule).toHaveProperty("analysisSteps")
			expect(Array.isArray(rule.analysisSteps)).toBe(true)
			expect(rule.analysisSteps.length).toBeGreaterThan(0)
		})
	})
})
