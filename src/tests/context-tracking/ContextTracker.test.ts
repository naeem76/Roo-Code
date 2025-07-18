import { describe, test, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { ContextTracker } from "../../core/context-tracking/ContextTracker"

describe("ContextTracker", () => {
	let contextTracker: ContextTracker
	let tempDir: string
	let globalStoragePath: string

	beforeEach(async () => {
		// Create temporary directories for testing
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "context-tracker-test-"))
		globalStoragePath = await fs.mkdtemp(path.join(os.tmpdir(), "context-storage-test-"))
		
		contextTracker = new ContextTracker("test-task-id", tempDir, globalStoragePath)
		await contextTracker.initialize()
	})

	afterEach(async () => {
		// Cleanup
		await contextTracker.dispose()
		await fs.rm(tempDir, { recursive: true, force: true })
		await fs.rm(globalStoragePath, { recursive: true, force: true })
	})

	test("should initialize with empty context", () => {
		const context = contextTracker.getContext()
		expect(context.cwd).toBe(tempDir)
		expect(context.analyzedFiles.size).toBe(0)
		expect(context.insights).toHaveLength(0)
		expect(context.decisions).toHaveLength(0)
	})

	test("should record file analysis", async () => {
		// Create a test file
		const testFile = "test.ts"
		const testFilePath = path.join(tempDir, testFile)
		const testContent = `
export class TestClass {
	async testMethod(): Promise<void> {
		console.log("test");
	}
}
`
		await fs.writeFile(testFilePath, testContent)

		// Analyze the file
		const insights = await contextTracker.analyzeFileContent(testFile)
		
		expect(insights).toContain("TypeScript file")
		expect(insights).toContain("Class inheritance pattern")
		expect(insights).toContain("Async/await pattern")

		const context = contextTracker.getContext()
		expect(context.analyzedFiles.has(testFile)).toBe(true)
		
		const analyzedFile = context.analyzedFiles.get(testFile)
		expect(analyzedFile).toBeDefined()
		expect(analyzedFile!.path).toBe(testFile)
		expect(analyzedFile!.insights).toEqual(insights)
	})

	test("should add architectural insights", () => {
		contextTracker.addInsight("pattern", "Service pattern detected", ["service.ts"], 0.9)
		
		const context = contextTracker.getContext()
		expect(context.insights).toHaveLength(1)
		
		const insight = context.insights[0]
		expect(insight.type).toBe("pattern")
		expect(insight.description).toBe("Service pattern detected")
		expect(insight.relatedFiles).toEqual(["service.ts"])
		expect(insight.confidence).toBe(0.9)
	})

	test("should record task decisions", () => {
		contextTracker.recordDecision(
			"Use TypeScript for implementation",
			"TypeScript provides better type safety",
			["src/main.ts"]
		)
		
		const context = contextTracker.getContext()
		expect(context.decisions).toHaveLength(1)
		
		const decision = context.decisions[0]
		expect(decision.decision).toBe("Use TypeScript for implementation")
		expect(decision.reasoning).toBe("TypeScript provides better type safety")
		expect(decision.affectedFiles).toEqual(["src/main.ts"])
	})

	test("should update codebase knowledge", () => {
		contextTracker.updateCodebaseKnowledge({
			techStack: ["React", "TypeScript"],
			conventions: {
				naming: ["camelCase"],
				fileOrganization: ["feature-based"],
				patterns: ["hooks"]
			}
		})
		
		const context = contextTracker.getContext()
		expect(context.codebaseKnowledge.techStack).toContain("React")
		expect(context.codebaseKnowledge.techStack).toContain("TypeScript")
		expect(context.codebaseKnowledge.conventions.naming).toContain("camelCase")
	})

	test("should generate context summary", async () => {
		// Add some context data
		const testFile = "test.ts"
		const testFilePath = path.join(tempDir, testFile)
		await fs.writeFile(testFilePath, "export class Test {}")
		
		await contextTracker.analyzeFileContent(testFile)
		contextTracker.addInsight("pattern", "Class pattern detected")
		contextTracker.recordDecision("Use classes", "Better organization")
		
		const summary = contextTracker.generateContextSummary()
		
		expect(summary).toContain("Analyzed 1 files")
		expect(summary).toContain("test.ts")
		expect(summary).toContain("Key insights discovered")
		expect(summary).toContain("Class pattern detected")
		expect(summary).toContain("Recent decisions")
		expect(summary).toContain("Use classes")
	})

	test("should create and restore snapshots", async () => {
		// Add some context data
		contextTracker.addInsight("pattern", "Test insight")
		contextTracker.recordDecision("Test decision", "Test reasoning")
		
		// Create snapshot
		const success = await contextTracker.createSnapshot()
		expect(success).toBe(true)
		
		// Create new tracker and verify it loads the snapshot
		const newTracker = new ContextTracker("test-task-id", tempDir, globalStoragePath)
		await newTracker.initialize()
		
		const context = newTracker.getContext()
		expect(context.insights).toHaveLength(1)
		expect(context.insights[0].description).toBe("Test insight")
		expect(context.decisions).toHaveLength(1)
		expect(context.decisions[0].decision).toBe("Test decision")
		
		await newTracker.dispose()
	})

	test("should check if file was analyzed recently", async () => {
		const testFile = "test.ts"
		const testFilePath = path.join(tempDir, testFile)
		await fs.writeFile(testFilePath, "export class Test {}")
		
		// File not analyzed yet
		expect(await contextTracker.isFileAnalyzedRecently(testFile)).toBe(false)
		
		// Analyze file
		await contextTracker.analyzeFileContent(testFile)
		
		// File should be considered recently analyzed
		expect(await contextTracker.isFileAnalyzedRecently(testFile)).toBe(true)
		
		// Should not be recent with very short max age
		expect(await contextTracker.isFileAnalyzedRecently(testFile, 1)).toBe(false)
	})

	test("should get insights for specific files", () => {
		contextTracker.addInsight("pattern", "Insight 1", ["file1.ts"])
		contextTracker.addInsight("structure", "Insight 2", ["file2.ts"])
		contextTracker.addInsight("pattern", "Insight 3", ["file1.ts", "file3.ts"])
		
		const insights = contextTracker.getInsightsForFiles(["file1.ts"])
		expect(insights).toHaveLength(2)
		expect(insights.map(i => i.description)).toContain("Insight 1")
		expect(insights.map(i => i.description)).toContain("Insight 3")
	})

	test("should get top insights by confidence", () => {
		contextTracker.addInsight("pattern", "Low confidence", [], 0.3)
		contextTracker.addInsight("structure", "High confidence", [], 0.9)
		contextTracker.addInsight("pattern", "Medium confidence", [], 0.6)
		
		const topInsights = contextTracker.getTopInsights(2)
		expect(topInsights).toHaveLength(2)
		expect(topInsights[0].description).toBe("High confidence")
		expect(topInsights[1].description).toBe("Medium confidence")
	})
})