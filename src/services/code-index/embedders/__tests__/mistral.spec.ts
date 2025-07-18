import { describe, it, expect, vi, beforeEach, MockedFunction } from "vitest"
import { MistralEmbedder } from "../mistral"
import { OpenAICompatibleEmbedder } from "../openai-compatible"

// Mock the OpenAICompatibleEmbedder
vi.mock("../openai-compatible")
const MockedOpenAICompatibleEmbedder = vi.mocked(OpenAICompatibleEmbedder)

// Mock telemetry
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureEvent: vi.fn(),
		},
	},
}))

// Mock i18n
vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string) => key),
}))

describe("MistralEmbedder", () => {
	let embedder: MistralEmbedder
	let mockCreateEmbeddings: MockedFunction<any>
	let mockValidateConfiguration: MockedFunction<any>

	beforeEach(() => {
		vi.clearAllMocks()

		// Setup mocks for OpenAICompatibleEmbedder
		mockCreateEmbeddings = vi.fn()
		mockValidateConfiguration = vi.fn()

		MockedOpenAICompatibleEmbedder.prototype.createEmbeddings = mockCreateEmbeddings
		MockedOpenAICompatibleEmbedder.prototype.validateConfiguration = mockValidateConfiguration
	})

	describe("constructor", () => {
		it("should initialize with provided API key and default model", () => {
			// Arrange
			const apiKey = "test-mistral-api-key"

			// Act
			embedder = new MistralEmbedder(apiKey)

			// Assert
			expect(MockedOpenAICompatibleEmbedder).toHaveBeenCalledWith(
				"https://api.mistral.ai/v1",
				apiKey,
				"codestral-embed",
				8192,
			)
		})

		it("should initialize with provided API key and custom model", () => {
			// Arrange
			const apiKey = "test-mistral-api-key"
			const modelId = "custom-mistral-model"

			// Act
			embedder = new MistralEmbedder(apiKey, modelId)

			// Assert
			expect(MockedOpenAICompatibleEmbedder).toHaveBeenCalledWith(
				"https://api.mistral.ai/v1",
				apiKey,
				"custom-mistral-model",
				8192,
			)
		})

		it("should throw error when API key is not provided", () => {
			// Act & Assert
			expect(() => new MistralEmbedder("")).toThrow("validation.apiKeyRequired")
		})
	})

	describe("embedderInfo", () => {
		it("should return correct embedder info", () => {
			// Arrange
			embedder = new MistralEmbedder("test-api-key")

			// Act
			const info = embedder.embedderInfo

			// Assert
			expect(info).toEqual({
				name: "mistral",
			})
		})
	})

	describe("createEmbeddings", () => {
		describe("success cases", () => {
			it("should delegate to OpenAI Compatible embedder with default model", async () => {
				// Arrange
				embedder = new MistralEmbedder("test-api-key")
				const texts = ["test text 1", "test text 2"]
				const mockResponse = {
					embeddings: [
						[0.1, 0.2],
						[0.3, 0.4],
					],
					usage: { promptTokens: 10, totalTokens: 15 },
				}
				mockCreateEmbeddings.mockResolvedValue(mockResponse)

				// Act
				const result = await embedder.createEmbeddings(texts)

				// Assert
				expect(mockCreateEmbeddings).toHaveBeenCalledWith(texts, "codestral-embed")
				expect(result).toEqual(mockResponse)
			})

			it("should delegate to OpenAI Compatible embedder with custom model", async () => {
				// Arrange
				embedder = new MistralEmbedder("test-api-key", "custom-model")
				const texts = ["test text 1", "test text 2"]
				const mockResponse = {
					embeddings: [
						[0.1, 0.2],
						[0.3, 0.4],
					],
					usage: { promptTokens: 10, totalTokens: 15 },
				}
				mockCreateEmbeddings.mockResolvedValue(mockResponse)

				// Act
				const result = await embedder.createEmbeddings(texts, "codestral-embed")

				// Assert
				expect(mockCreateEmbeddings).toHaveBeenCalledWith(texts, "codestral-embed")
				expect(result).toEqual(mockResponse)
			})

			it("should handle errors from OpenAI Compatible embedder", async () => {
				// Arrange
				embedder = new MistralEmbedder("test-api-key")
				const texts = ["test text"]
				mockCreateEmbeddings.mockRejectedValue(new Error("Embedding failed"))

				// Act & Assert
				await expect(embedder.createEmbeddings(texts)).rejects.toThrow("Embedding failed")
			})
		})
	})

	describe("validateConfiguration", () => {
		it("should delegate to OpenAI Compatible embedder and return success", async () => {
			// Arrange
			embedder = new MistralEmbedder("test-api-key")
			mockValidateConfiguration.mockResolvedValue({ valid: true })

			// Act
			const result = await embedder.validateConfiguration()

			// Assert
			expect(mockValidateConfiguration).toHaveBeenCalled()
			expect(result).toEqual({ valid: true })
		})

		it("should delegate to OpenAI Compatible embedder and return error", async () => {
			// Arrange
			embedder = new MistralEmbedder("test-api-key")
			mockValidateConfiguration.mockResolvedValue({
				valid: false,
				error: "embeddings:validation.authenticationFailed",
			})

			// Act
			const result = await embedder.validateConfiguration()

			// Assert
			expect(result).toEqual({
				valid: false,
				error: "embeddings:validation.authenticationFailed",
			})
		})

		it("should handle validation errors", async () => {
			// Arrange
			embedder = new MistralEmbedder("test-api-key")
			mockValidateConfiguration.mockRejectedValue(new Error("Validation failed"))

			// Act & Assert
			await expect(embedder.validateConfiguration()).rejects.toThrow("Validation failed")
		})
	})
})
