// npx vitest run src/api/providers/__tests__/gemini-google-cloud-project.spec.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

import { GeminiHandler } from "../gemini"

// Mock the @google/genai module
const mockGenerateContentStream = vi.fn()
const mockGenerateContent = vi.fn()
const mockCountTokens = vi.fn()

vi.mock("@google/genai", () => ({
	GoogleGenAI: vi.fn().mockImplementation(() => ({
		models: {
			generateContentStream: mockGenerateContentStream,
			generateContent: mockGenerateContent,
			countTokens: mockCountTokens,
		},
	})),
}))

describe("GeminiHandler Google Cloud Project", () => {
	let originalValue: string | undefined

	beforeEach(() => {
		// Store the original value
		originalValue = process.env.GOOGLE_CLOUD_PROJECT
		// Clean up the environment variable
		delete process.env.GOOGLE_CLOUD_PROJECT
	})

	afterEach(() => {
		// Restore the original value
		if (originalValue !== undefined) {
			process.env.GOOGLE_CLOUD_PROJECT = originalValue
		} else {
			delete process.env.GOOGLE_CLOUD_PROJECT
		}
	})

	it("should set GOOGLE_CLOUD_PROJECT during createMessage when specified in profile", async () => {
		const testProjectId = "test-project-123"
		const handler = new GeminiHandler({
			geminiApiKey: "test-key",
			googleCloudProject: testProjectId,
		})

		// Mock the generateContentStream to capture the environment variable
		let capturedEnvValue: string | undefined
		const mockStream = {
			async *[Symbol.asyncIterator]() {
				capturedEnvValue = process.env.GOOGLE_CLOUD_PROJECT
				yield { text: "test response" }
			},
		}

		mockGenerateContentStream.mockResolvedValue(mockStream)

		// Execute createMessage
		const generator = handler.createMessage("test system", [{ role: "user", content: "test message" }])

		// Consume the generator
		const results = []
		for await (const chunk of generator) {
			results.push(chunk)
		}

		// Verify the environment variable was set during execution
		expect(capturedEnvValue).toBe(testProjectId)
		// Verify it was restored after execution
		expect(process.env.GOOGLE_CLOUD_PROJECT).toBeUndefined()
	})

	it("should set GOOGLE_CLOUD_PROJECT during completePrompt when specified in profile", async () => {
		const testProjectId = "test-project-456"
		const handler = new GeminiHandler({
			geminiApiKey: "test-key",
			googleCloudProject: testProjectId,
		})

		// Mock the generateContent to capture the environment variable
		let capturedEnvValue: string | undefined
		mockGenerateContent.mockImplementation(async () => {
			capturedEnvValue = process.env.GOOGLE_CLOUD_PROJECT
			return { text: "test response" } as any
		})

		// Execute completePrompt
		await handler.completePrompt("test prompt")

		// Verify the environment variable was set during execution
		expect(capturedEnvValue).toBe(testProjectId)
		// Verify it was restored after execution
		expect(process.env.GOOGLE_CLOUD_PROJECT).toBeUndefined()
	})

	it("should set GOOGLE_CLOUD_PROJECT during countTokens when specified in profile", async () => {
		const testProjectId = "test-project-789"
		const handler = new GeminiHandler({
			geminiApiKey: "test-key",
			googleCloudProject: testProjectId,
		})

		// Mock the countTokens to capture the environment variable
		let capturedEnvValue: string | undefined
		mockCountTokens.mockImplementation(async () => {
			capturedEnvValue = process.env.GOOGLE_CLOUD_PROJECT
			return { totalTokens: 100 }
		})

		// Execute countTokens
		await handler.countTokens([{ type: "text", text: "test content" }])

		// Verify the environment variable was set during execution
		expect(capturedEnvValue).toBe(testProjectId)
		// Verify it was restored after execution
		expect(process.env.GOOGLE_CLOUD_PROJECT).toBeUndefined()
	})

	it("should not modify GOOGLE_CLOUD_PROJECT when not specified in profile", async () => {
		const originalProjectId = "original-project"
		process.env.GOOGLE_CLOUD_PROJECT = originalProjectId

		const handler = new GeminiHandler({
			geminiApiKey: "test-key",
			// No googleCloudProject specified
		})

		// Mock the generateContent
		let capturedEnvValue: string | undefined
		mockGenerateContent.mockImplementation(async () => {
			capturedEnvValue = process.env.GOOGLE_CLOUD_PROJECT
			return { text: "test response" } as any
		})

		// Execute completePrompt
		await handler.completePrompt("test prompt")

		// Verify the environment variable was not modified
		expect(capturedEnvValue).toBe(originalProjectId)
		expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(originalProjectId)
	})

	it("should restore original GOOGLE_CLOUD_PROJECT value after execution", async () => {
		const originalProjectId = "original-project"
		const testProjectId = "test-project-123"
		process.env.GOOGLE_CLOUD_PROJECT = originalProjectId

		const handler = new GeminiHandler({
			geminiApiKey: "test-key",
			googleCloudProject: testProjectId,
		})

		// Mock the generateContent
		let capturedEnvValue: string | undefined
		mockGenerateContent.mockImplementation(async () => {
			capturedEnvValue = process.env.GOOGLE_CLOUD_PROJECT
			return { text: "test response" } as any
		})

		// Execute completePrompt
		await handler.completePrompt("test prompt")

		// Verify the test project was set during execution
		expect(capturedEnvValue).toBe(testProjectId)
		// Verify the original value was restored
		expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(originalProjectId)
	})
})
