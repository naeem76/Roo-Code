import { describe, it, expect } from "vitest"
import { detectCodeOmission, detectInefficientFileEdit } from "../detect-omission"

describe("detectCodeOmission", () => {
	it("should return false for files with less than 20 lines", () => {
		const original = "line1\nline2\nline3"
		const newContent = "line1\nline2\nline3"
		const result = detectCodeOmission(original, newContent, 10)
		expect(result).toBe(false)
	})

	it("should detect omission keywords in comments", () => {
		const original = "function test() {\n  return 1;\n}"
		const newContent = "function test() {\n  // rest of code unchanged\n  return 1;\n}"
		const result = detectCodeOmission(original, newContent, 50)
		expect(result).toBe(true)
	})

	it("should not flag if comment existed in original", () => {
		const original = "function test() {\n  // rest of code unchanged\n  return 1;\n}"
		const newContent = "function test() {\n  // rest of code unchanged\n  return 1;\n}"
		const result = detectCodeOmission(original, newContent, 50)
		expect(result).toBe(false)
	})
})

describe("detectInefficientFileEdit", () => {
	it("should return false for small files", () => {
		const original = "line1\nline2\nline3"
		const newContent = "line1\nmodified\nline3"
		const result = detectInefficientFileEdit(original, newContent)
		expect(result.isInefficient).toBe(false)
	})

	it("should detect inefficient edits when less than 30% changed", () => {
		const original = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n")
		const newContent = original.replace("line5", "modified5")
		const result = detectInefficientFileEdit(original, newContent)
		expect(result.isInefficient).toBe(true)
		expect(result.suggestion).toContain("apply_diff")
	})

	it("should not flag efficient edits when more than 30% changed", () => {
		const original = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join("\n")
		const newContent = Array.from({ length: 10 }, (_, i) => `modified${i + 1}`).join("\n")
		const result = detectInefficientFileEdit(original, newContent)
		expect(result.isInefficient).toBe(false)
	})

	it("should suggest insert_content for additions only", () => {
		const original = Array.from({ length: 15 }, (_, i) => `line${i + 1}`).join("\n")
		const newContent = original + "\nnewline16\nnewline17"
		const result = detectInefficientFileEdit(original, newContent)
		expect(result.isInefficient).toBe(true)
		expect(result.suggestion).toContain("insert_content")
	})

	it("should calculate change ratio correctly", () => {
		const original = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join("\n")
		const newContent = original.replace("line1", "modified1")
		const result = detectInefficientFileEdit(original, newContent)
		expect(result.changeRatio).toBe(0.1) // 1 out of 10 lines changed
	})
})
