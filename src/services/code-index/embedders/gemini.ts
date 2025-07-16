import { OpenAICompatibleEmbedder } from "./openai-compatible"
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from "../interfaces/embedder"
import {
	GEMINI_MAX_ITEM_TOKENS,
	GEMINI_MAX_BATCH_TOKENS,
	GEMINI_INITIAL_RETRY_DELAY_MS,
	GEMINI_MAX_BATCH_RETRIES,
} from "../constants"
import { getModelDimension } from "../../../shared/embeddingModels"
import { t } from "../../../i18n"
import { TelemetryEventName } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

/**
 * Gemini embedder implementation that wraps the OpenAI Compatible embedder
 * with configuration for Google's Gemini embedding API.
 *
 * Supported models:
 * - text-embedding-004 (dimension: 768)
 * - gemini-embedding-001 (dimension: 3072)
 */
export class GeminiEmbedder implements IEmbedder {
	private readonly openAICompatibleEmbedder: OpenAICompatibleEmbedder
	private static readonly GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
	private static readonly DEFAULT_MODEL = "gemini-embedding-001"
	private readonly modelId: string

	/**
	 * Creates a new Gemini embedder
	 * @param apiKey The Gemini API key for authentication
	 * @param modelId The model ID to use (defaults to gemini-embedding-001)
	 */
	constructor(apiKey: string, modelId?: string) {
		if (!apiKey) {
			throw new Error(t("embeddings:validation.apiKeyRequired"))
		}

		// Use provided model or default
		this.modelId = modelId || GeminiEmbedder.DEFAULT_MODEL

		// Create an OpenAI Compatible embedder with Gemini's configuration
		this.openAICompatibleEmbedder = new OpenAICompatibleEmbedder(
			GeminiEmbedder.GEMINI_BASE_URL,
			apiKey,
			this.modelId,
			GEMINI_MAX_ITEM_TOKENS,
		)
	}

	/**
	 * Creates embeddings for the given texts using Gemini's embedding API with model-aware rate limiting
	 * @param texts Array of text strings to embed
	 * @param model Optional model identifier (uses constructor model if not provided)
	 * @returns Promise resolving to embedding response
	 */
	async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
		try {
			const modelToUse = model || this.modelId

			// Check if this is a high-dimensional model that needs special handling
			const modelDimension = getModelDimension("gemini", modelToUse)
			const isHighDimensionalModel = modelDimension && modelDimension >= 3000

			if (isHighDimensionalModel) {
				// Use custom batching and rate limiting for high-dimensional models
				return await this._createEmbeddingsWithCustomRateLimiting(texts, modelToUse)
			} else {
				// Use standard implementation for lower-dimensional models
				return await this.openAICompatibleEmbedder.createEmbeddings(texts, modelToUse)
			}
		} catch (error) {
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "GeminiEmbedder:createEmbeddings",
			})
			throw error
		}
	}

	/**
	 * Custom embedding implementation with enhanced rate limiting for high-dimensional models
	 * @param texts Array of text strings to embed
	 * @param model Model identifier to use
	 * @returns Promise resolving to embedding response
	 */
	private async _createEmbeddingsWithCustomRateLimiting(texts: string[], model: string): Promise<EmbeddingResponse> {
		const allEmbeddings: number[][] = []
		const usage = { promptTokens: 0, totalTokens: 0 }
		const remainingTexts = [...texts]

		while (remainingTexts.length > 0) {
			const currentBatch: string[] = []
			let currentBatchTokens = 0
			const processedIndices: number[] = []

			// Use smaller batch sizes for high-dimensional models
			for (let i = 0; i < remainingTexts.length; i++) {
				const text = remainingTexts[i]
				const itemTokens = Math.ceil(text.length / 4)

				if (itemTokens > GEMINI_MAX_ITEM_TOKENS) {
					console.warn(
						t("embeddings:textExceedsTokenLimit", {
							index: i,
							itemTokens,
							maxTokens: GEMINI_MAX_ITEM_TOKENS,
						}),
					)
					processedIndices.push(i)
					continue
				}

				if (currentBatchTokens + itemTokens <= GEMINI_MAX_BATCH_TOKENS) {
					currentBatch.push(text)
					currentBatchTokens += itemTokens
					processedIndices.push(i)
				} else {
					break
				}
			}

			// Remove processed items from remainingTexts (in reverse order to maintain correct indices)
			for (let i = processedIndices.length - 1; i >= 0; i--) {
				remainingTexts.splice(processedIndices[i], 1)
			}

			if (currentBatch.length > 0) {
				const batchResult = await this._embedBatchWithGeminiRateLimiting(currentBatch, model)
				allEmbeddings.push(...batchResult.embeddings)
				usage.promptTokens += batchResult.usage.promptTokens
				usage.totalTokens += batchResult.usage.totalTokens
			}
		}

		return { embeddings: allEmbeddings, usage }
	}

	/**
	 * Helper method to handle batch embedding with Gemini-specific retries and rate limiting
	 * @param batchTexts Array of texts to embed in this batch
	 * @param model Model identifier to use
	 * @returns Promise resolving to embeddings and usage statistics
	 */
	private async _embedBatchWithGeminiRateLimiting(
		batchTexts: string[],
		model: string,
	): Promise<{ embeddings: number[][]; usage: { promptTokens: number; totalTokens: number } }> {
		for (let attempts = 0; attempts < GEMINI_MAX_BATCH_RETRIES; attempts++) {
			try {
				// Delegate to the underlying OpenAI Compatible embedder for the actual API call
				const response = await this.openAICompatibleEmbedder.createEmbeddings(batchTexts, model)
				return {
					embeddings: response.embeddings,
					usage: response.usage || { promptTokens: 0, totalTokens: 0 },
				}
			} catch (error) {
				TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
					location: "GeminiEmbedder:_embedBatchWithGeminiRateLimiting",
					attempt: attempts + 1,
				})

				const hasMoreAttempts = attempts < GEMINI_MAX_BATCH_RETRIES - 1

				// Check if it's a rate limit error (429)
				const httpError = error as any
				if (httpError?.status === 429 && hasMoreAttempts) {
					// Use longer delays for Gemini high-dimensional models
					const delayMs = GEMINI_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempts)
					console.warn(
						t("embeddings:rateLimitRetry", {
							delayMs,
							attempt: attempts + 1,
							maxRetries: GEMINI_MAX_BATCH_RETRIES,
						}),
					)
					await new Promise((resolve) => setTimeout(resolve, delayMs))
					continue
				}

				// Log the error for debugging
				console.error(`Gemini embedder error (attempt ${attempts + 1}/${GEMINI_MAX_BATCH_RETRIES}):`, error)

				// If it's the last attempt or not a rate limit error, throw the error
				if (!hasMoreAttempts) {
					throw new Error(t("embeddings:failedMaxAttempts", { attempts: GEMINI_MAX_BATCH_RETRIES }))
				}
			}
		}

		throw new Error(t("embeddings:failedMaxAttempts", { attempts: GEMINI_MAX_BATCH_RETRIES }))
	}

	/**
	 * Validates the Gemini embedder configuration by delegating to the underlying OpenAI-compatible embedder
	 * @returns Promise resolving to validation result with success status and optional error message
	 */
	async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
		try {
			// Delegate validation to the OpenAI-compatible embedder
			// The error messages will be specific to Gemini since we're using Gemini's base URL
			return await this.openAICompatibleEmbedder.validateConfiguration()
		} catch (error) {
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "GeminiEmbedder:validateConfiguration",
			})
			throw error
		}
	}

	/**
	 * Returns information about this embedder
	 */
	get embedderInfo(): EmbedderInfo {
		return {
			name: "gemini",
		}
	}
}
