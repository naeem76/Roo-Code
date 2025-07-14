import { AutoIndexingService } from "../AutoIndexingService"

// Mock TelemetryService
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureEvent: vi.fn(),
		},
	},
}))

describe("AutoIndexingService", () => {
	let mockCodeIndexManager: any

	beforeEach(() => {
		// Clear singleton instance before each test
		;(AutoIndexingService as any)._instance = undefined

		// Mock CodeIndexManager with all required properties
		mockCodeIndexManager = {
			startIndexing: vi.fn().mockResolvedValue(undefined),
			state: "Standby",
			isFeatureEnabled: true,
			isFeatureConfigured: true,
		}
	})

	afterEach(() => {
		vi.clearAllMocks()
		// Clear singleton instance after each test
		;(AutoIndexingService as any)._instance = undefined
	})

	describe("getInstance", () => {
		it("should return the same instance when called multiple times", () => {
			const instance1 = AutoIndexingService.getInstance(mockCodeIndexManager)
			const instance2 = AutoIndexingService.getInstance(mockCodeIndexManager)
			expect(instance1).toBe(instance2)
		})

		it("should create instance with valid CodeIndexManager", () => {
			const instance = AutoIndexingService.getInstance(mockCodeIndexManager)
			expect(instance).toBeInstanceOf(AutoIndexingService)
		})
	})

	describe("analyzeUserPromptForIndexing", () => {
		it("should return true for prompts containing indexing trigger keywords", async () => {
			const autoIndexingService = AutoIndexingService.getInstance(mockCodeIndexManager)
			// Reset the lastIndexingTime to allow indexing
			;(autoIndexingService as any).lastIndexingTime = 0

			const testCases = [
				"explore the codebase",
				"find all functions",
				"search for components",
				"understand the architecture",
				"analyze the code structure",
			]

			for (const text of testCases) {
				const userContent = [{ type: "text" as const, text }]
				const result = await autoIndexingService.analyzeUserPromptForIndexing(userContent)
				expect(result).toBe(true)
			}
		})

		it("should return false for prompts without trigger keywords", async () => {
			const autoIndexingService = AutoIndexingService.getInstance(mockCodeIndexManager)
			// Reset the lastIndexingTime to allow indexing
			;(autoIndexingService as any).lastIndexingTime = 0

			const userContent = [{ type: "text" as const, text: "hello world" }]
			const result = await autoIndexingService.analyzeUserPromptForIndexing(userContent)
			expect(result).toBe(false)
		})

		it("should handle empty content", async () => {
			const autoIndexingService = AutoIndexingService.getInstance(mockCodeIndexManager)
			// Reset the lastIndexingTime to allow indexing
			;(autoIndexingService as any).lastIndexingTime = 0

			const userContent = [{ type: "text" as const, text: "" }]
			const result = await autoIndexingService.analyzeUserPromptForIndexing(userContent)
			expect(result).toBe(false)
		})
	})

	describe("shouldTriggerIndexingForFileChange", () => {
		it("should return true for business logic files", () => {
			const autoIndexingService = AutoIndexingService.getInstance(mockCodeIndexManager)
			// Reset the lastIndexingTime to allow indexing
			;(autoIndexingService as any).lastIndexingTime = 0

			const businessLogicFiles = [
				"/src/reducers/userReducer.ts",
				"/app/api/handlers/user.ts",
				"/components/UserProfile.tsx",
				"/src/services/authService.ts",
				"/lib/utils/helper.ts",
			]

			for (const filePath of businessLogicFiles) {
				const result = autoIndexingService.shouldTriggerIndexingForFileChange(filePath)
				expect(result).toBe(true)
			}
		})

		it("should return false for non-business logic files", () => {
			const autoIndexingService = AutoIndexingService.getInstance(mockCodeIndexManager)
			// Reset the lastIndexingTime to allow indexing
			;(autoIndexingService as any).lastIndexingTime = 0

			const nonBusinessLogicFiles = [
				"/README.md",
				"/package.json",
				"/tsconfig.json",
				"/.gitignore",
				"/docs/guide.md",
			]

			for (const filePath of nonBusinessLogicFiles) {
				const result = autoIndexingService.shouldTriggerIndexingForFileChange(filePath)
				expect(result).toBe(false)
			}
		})
	})

	describe("core functionality", () => {
		it("should have proper singleton behavior", () => {
			const instance1 = AutoIndexingService.getInstance(mockCodeIndexManager)
			const instance2 = AutoIndexingService.getInstance(mockCodeIndexManager)
			expect(instance1).toBe(instance2)
		})

		it("should analyze user prompts correctly", async () => {
			const autoIndexingService = AutoIndexingService.getInstance(mockCodeIndexManager)
			;(autoIndexingService as any).lastIndexingTime = 0

			// Test positive cases
			const positiveContent = [{ type: "text" as const, text: "explore the codebase structure" }]
			const positiveResult = await autoIndexingService.analyzeUserPromptForIndexing(positiveContent)
			expect(positiveResult).toBe(true)

			// Test negative cases
			const negativeContent = [{ type: "text" as const, text: "hello world" }]
			const negativeResult = await autoIndexingService.analyzeUserPromptForIndexing(negativeContent)
			expect(negativeResult).toBe(false)
		})

		it("should detect business logic file changes correctly", () => {
			const autoIndexingService = AutoIndexingService.getInstance(mockCodeIndexManager)
			;(autoIndexingService as any).lastIndexingTime = 0

			// Test positive cases
			expect(autoIndexingService.shouldTriggerIndexingForFileChange("/src/components/App.tsx")).toBe(true)
			expect(autoIndexingService.shouldTriggerIndexingForFileChange("/api/handlers/user.ts")).toBe(true)
			expect(autoIndexingService.shouldTriggerIndexingForFileChange("/reducers/auth.ts")).toBe(true)

			// Test negative cases
			expect(autoIndexingService.shouldTriggerIndexingForFileChange("/README.md")).toBe(false)
			expect(autoIndexingService.shouldTriggerIndexingForFileChange("/package.json")).toBe(false)
			expect(autoIndexingService.shouldTriggerIndexingForFileChange("/.gitignore")).toBe(false)
		})
	})
})
