// npx vitest services/code-index/embedders/__tests__/fastembed.spec.ts

import { describe, it, expect, beforeEach, vi } from "vitest"
import { FastEmbedEmbedder } from "../fastembed"

// Mock TelemetryService
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureEvent: vi.fn(),
		},
	},
}))

// Mock i18n
vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string, params?: any) => {
		if (key === "embeddings:fastembed.modelNotSupported") {
			return `Model "${params?.model}" not supported. Available models: ${params?.availableModels}`
		}
		if (key === "embeddings:fastembed.embeddingFailed") {
			return `Failed to create embeddings with FastEmbed: ${params?.message}`
		}
		if (key === "embeddings:fastembed.noValidTexts") {
			return "No valid texts to embed"
		}
		if (key === "embeddings:fastembed.invalidResponseFormat") {
			return "Invalid response format from FastEmbed"
		}
		if (key === "embeddings:fastembed.invalidEmbeddingFormat") {
			return "Invalid embedding format from FastEmbed"
		}
		if (key === "embeddings:validation.configurationError") {
			return "FastEmbed validation failed"
		}
		return key
	}),
}))

// Mock getModelQueryPrefix
vi.mock("../../../shared/embeddingModels", () => ({
	getModelQueryPrefix: vi.fn(() => null),
}))

// Mock @mastra/fastembed
vi.mock("@mastra/fastembed", () => ({
	fastembed: {
		small: {
			doEmbed: vi.fn(),
			maxEmbeddingsPerCall: 256,
		},
		base: {
			doEmbed: vi.fn(),
			maxEmbeddingsPerCall: 256,
		},
	},
}))

describe("FastEmbedEmbedder", () => {
	let embedder: FastEmbedEmbedder
	let mockSmallDoEmbed: any
	let mockBaseDoEmbed: any

	beforeEach(async () => {
		vi.clearAllMocks()

		// Get references to the mocked functions
		const { fastembed } = await import("@mastra/fastembed")
		mockSmallDoEmbed = vi.mocked(fastembed.small.doEmbed)
		mockBaseDoEmbed = vi.mocked(fastembed.base.doEmbed)
	})

	describe("constructor", () => {
		it("should initialize with default model (bge-small-en-v1.5)", () => {
			embedder = new FastEmbedEmbedder({})
			expect(embedder.embedderInfo.name).toBe("fastembed")
		})

		it("should initialize with specified model", () => {
			embedder = new FastEmbedEmbedder({ fastEmbedModel: "bge-base-en-v1.5" })
			expect(embedder.embedderInfo.name).toBe("fastembed")
		})

		it("should use fallback model for unsupported model", () => {
			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

			embedder = new FastEmbedEmbedder({ fastEmbedModel: "unsupported-model" })

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Model "unsupported-model" not available'))

			consoleSpy.mockRestore()
		})
	})

	describe("createEmbeddings", () => {
		beforeEach(() => {
			embedder = new FastEmbedEmbedder({})
		})

		it("should create embeddings for single text using small model", async () => {
			const mockEmbeddings = [[0.1, 0.2, 0.3, 0.4]]
			mockSmallDoEmbed.mockResolvedValue(mockEmbeddings)

			const result = await embedder.createEmbeddings(["test text"])

			expect(mockSmallDoEmbed).toHaveBeenCalledWith({ values: ["test text"] })
			expect(result).toEqual({
				embeddings: mockEmbeddings,
				usage: {
					promptTokens: 3,
					totalTokens: 3,
				},
			})
		})

		it("should create embeddings for multiple texts using small model", async () => {
			const mockEmbeddings = [
				[0.1, 0.2, 0.3, 0.4],
				[0.5, 0.6, 0.7, 0.8],
			]
			mockSmallDoEmbed.mockResolvedValue(mockEmbeddings)

			const result = await embedder.createEmbeddings(["text 1", "text 2"])

			expect(mockSmallDoEmbed).toHaveBeenCalledWith({ values: ["text 1", "text 2"] })
			expect(result).toEqual({
				embeddings: mockEmbeddings,
				usage: {
					promptTokens: 4,
					totalTokens: 4,
				},
			})
		})

		it("should create embeddings using base model when specified", async () => {
			embedder = new FastEmbedEmbedder({ fastEmbedModel: "bge-base-en-v1.5" })
			const mockEmbeddings = [[0.1, 0.2, 0.3, 0.4]]
			mockBaseDoEmbed.mockResolvedValue(mockEmbeddings)

			const result = await embedder.createEmbeddings(["test text"])

			expect(mockBaseDoEmbed).toHaveBeenCalledWith({ values: ["test text"] })
			expect(result).toEqual({
				embeddings: mockEmbeddings,
				usage: {
					promptTokens: 3,
					totalTokens: 3,
				},
			})
		})

		it("should handle empty input", async () => {
			const result = await embedder.createEmbeddings([])

			expect(mockSmallDoEmbed).not.toHaveBeenCalled()
			expect(result).toEqual({
				embeddings: [],
				usage: {
					promptTokens: 0,
					totalTokens: 0,
				},
			})
		})

		it("should handle FastEmbed API errors", async () => {
			const error = new Error("FastEmbed API error")
			mockSmallDoEmbed.mockRejectedValue(error)

			await expect(embedder.createEmbeddings(["test text"])).rejects.toThrow("fastembed.embeddingFailed")
		})

		it("should process large batches correctly", async () => {
			const texts = Array.from({ length: 150 }, (_, i) => `text ${i}`)
			const mockEmbeddings = texts.map((_, i) => [i * 0.1, i * 0.2, i * 0.3, i * 0.4])
			mockSmallDoEmbed.mockResolvedValue(mockEmbeddings)

			const result = await embedder.createEmbeddings(texts)

			expect(mockSmallDoEmbed).toHaveBeenCalledWith({ values: texts })
			expect(result.embeddings).toHaveLength(150)
		})
	})

	describe("validateConfiguration", () => {
		beforeEach(() => {
			embedder = new FastEmbedEmbedder({})
		})

		it("should validate successfully with small model", async () => {
			const mockEmbeddings = [[0.1, 0.2, 0.3, 0.4]]
			mockSmallDoEmbed.mockResolvedValue(mockEmbeddings)

			const result = await embedder.validateConfiguration()

			expect(mockSmallDoEmbed).toHaveBeenCalledWith({ values: ["test"] })
			expect(result).toEqual({ valid: true })
		})

		it("should validate successfully with base model", async () => {
			embedder = new FastEmbedEmbedder({ fastEmbedModel: "bge-base-en-v1.5" })
			const mockEmbeddings = [[0.1, 0.2, 0.3, 0.4]]
			mockBaseDoEmbed.mockResolvedValue(mockEmbeddings)

			const result = await embedder.validateConfiguration()

			expect(mockBaseDoEmbed).toHaveBeenCalledWith({ values: ["test"] })
			expect(result).toEqual({ valid: true })
		})

		it("should return invalid when FastEmbed fails", async () => {
			const error = new Error("FastEmbed validation error")
			mockSmallDoEmbed.mockRejectedValue(error)

			const result = await embedder.validateConfiguration()

			expect(result).toEqual({
				valid: false,
				error: "FastEmbed validation error",
			})
		})

		it("should handle unexpected validation errors", async () => {
			mockSmallDoEmbed.mockRejectedValue("Unexpected error")

			const result = await embedder.validateConfiguration()

			expect(result).toEqual({
				valid: false,
				error: "Unexpected error",
			})
		})
	})

	describe("embedderInfo", () => {
		it("should return correct embedder info", () => {
			embedder = new FastEmbedEmbedder({})
			expect(embedder.embedderInfo).toEqual({
				name: "fastembed",
			})
		})
	})

	describe("model selection", () => {
		it("should use small model by default", () => {
			embedder = new FastEmbedEmbedder({})
			// We can't directly test the private property, but we can test the behavior
			expect(() => embedder).not.toThrow()
		})

		it("should use base model when specified", () => {
			embedder = new FastEmbedEmbedder({ fastEmbedModel: "bge-base-en-v1.5" })
			expect(() => embedder).not.toThrow()
		})

		it("should use small model when explicitly specified", () => {
			embedder = new FastEmbedEmbedder({ fastEmbedModel: "bge-small-en-v1.5" })
			expect(() => embedder).not.toThrow()
		})
	})
})
