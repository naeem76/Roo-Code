import { fastembed } from "@mastra/fastembed"
import { ApiHandlerOptions } from "../../../shared/api"
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from "../interfaces"
import { getModelQueryPrefix } from "../../../shared/embeddingModels"
import { MAX_ITEM_TOKENS } from "../constants"
import { t } from "../../../i18n"
import { withValidationErrorHandling, sanitizeErrorMessage } from "../shared/validation-helpers"
import { TelemetryService } from "@roo-code/telemetry"
import { TelemetryEventName } from "@roo-code/types"

/**
 * FastEmbed implementation of the embedder interface for local CPU-based embeddings
 */
export class FastEmbedEmbedder implements IEmbedder {
	private readonly defaultModel: string
	private readonly availableModels: Record<string, any>

	constructor(options: ApiHandlerOptions & { fastEmbedModel?: string }) {
		// Available FastEmbed models
		this.availableModels = {
			"bge-small-en-v1.5": fastembed.small,
			"bge-base-en-v1.5": fastembed.base,
		}

		// Set default model
		this.defaultModel = options.fastEmbedModel || "bge-small-en-v1.5"

		// Validate that the selected model is available
		if (!this.availableModels[this.defaultModel]) {
			console.warn(
				`[FastEmbedEmbedder] Model "${this.defaultModel}" not available. Using "bge-small-en-v1.5" as fallback.`,
			)
			this.defaultModel = "bge-small-en-v1.5"
		}
	}

	/**
	 * Creates embeddings for the given texts using FastEmbed
	 * @param texts Array of text strings to embed
	 * @param model Optional model identifier (currently supports bge-small-en-v1.5 and bge-base-en-v1.5)
	 * @returns Promise resolving to embedding response
	 */
	async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
		// Handle empty input
		if (texts.length === 0) {
			return {
				embeddings: [],
				usage: {
					promptTokens: 0,
					totalTokens: 0,
				},
			}
		}

		const modelToUse = model || this.defaultModel

		// Get the FastEmbed model instance
		const fastEmbedModel = this.availableModels[modelToUse]
		if (!fastEmbedModel) {
			throw new Error(
				t("embeddings:fastembed.modelNotSupported", {
					model: modelToUse,
					availableModels: Object.keys(this.availableModels).join(", "),
				}),
			)
		}

		// Apply model-specific query prefix if required
		const queryPrefix = getModelQueryPrefix("fastembed", modelToUse)
		const processedTexts = queryPrefix
			? texts.map((text, index) => {
					// Prevent double-prefixing
					if (text.startsWith(queryPrefix)) {
						return text
					}
					const prefixedText = `${queryPrefix}${text}`
					const estimatedTokens = Math.ceil(prefixedText.length / 4)
					if (estimatedTokens > MAX_ITEM_TOKENS) {
						console.warn(
							t("embeddings:textWithPrefixExceedsTokenLimit", {
								index,
								estimatedTokens,
								maxTokens: MAX_ITEM_TOKENS,
							}),
						)
						// Return original text if adding prefix would exceed limit
						return text
					}
					return prefixedText
				})
			: texts

		try {
			// Filter out texts that are too long
			const validTexts = processedTexts.filter((text, index) => {
				const estimatedTokens = Math.ceil(text.length / 4)
				if (estimatedTokens > MAX_ITEM_TOKENS) {
					console.warn(
						t("embeddings:textExceedsTokenLimit", {
							index,
							itemTokens: estimatedTokens,
							maxTokens: MAX_ITEM_TOKENS,
						}),
					)
					return false
				}
				return true
			})

			if (validTexts.length === 0) {
				throw new Error(t("embeddings:fastembed.noValidTexts"))
			}

			// Process texts in batches according to model's maxEmbeddingsPerCall
			const maxBatchSize = fastEmbedModel.maxEmbeddingsPerCall || 256
			const allEmbeddings: number[][] = []

			for (let i = 0; i < validTexts.length; i += maxBatchSize) {
				const batch = validTexts.slice(i, i + maxBatchSize)

				// Call FastEmbed's doEmbed method
				const batchResult = await fastEmbedModel.doEmbed({
					values: batch,
				})

				// FastEmbed returns embeddings in the format we expect
				if (Array.isArray(batchResult) && batchResult.length > 0) {
					allEmbeddings.push(...batchResult)
				} else {
					throw new Error(t("embeddings:fastembed.invalidResponseFormat"))
				}
			}

			// FastEmbed doesn't provide usage statistics, so we estimate
			const estimatedTokens = validTexts.reduce((total, text) => total + Math.ceil(text.length / 4), 0)

			return {
				embeddings: allEmbeddings,
				usage: {
					promptTokens: estimatedTokens,
					totalTokens: estimatedTokens,
				},
			}
		} catch (error: any) {
			// Capture telemetry before reformatting the error
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
				stack: error instanceof Error ? sanitizeErrorMessage(error.stack || "") : undefined,
				location: "FastEmbedEmbedder:createEmbeddings",
			})

			// Log the original error for debugging purposes
			console.error("FastEmbed embedding failed:", error)

			// Re-throw a more specific error for the caller
			throw new Error(t("embeddings:fastembed.embeddingFailed", { message: error.message }))
		}
	}

	/**
	 * Validates the FastEmbed embedder configuration by testing a simple embedding
	 * @returns Promise resolving to validation result with success status and optional error message
	 */
	async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
		return withValidationErrorHandling(
			async () => {
				try {
					// Get the default model
					const fastEmbedModel = this.availableModels[this.defaultModel]
					if (!fastEmbedModel) {
						return {
							valid: false,
							error: t("embeddings:fastembed.modelNotSupported", {
								model: this.defaultModel,
								availableModels: Object.keys(this.availableModels).join(", "),
							}),
						}
					}

					// Test with a simple embedding request
					const testResult = await fastEmbedModel.doEmbed({
						values: ["test"],
					})

					// Check if we got a valid response
					if (!Array.isArray(testResult) || testResult.length === 0) {
						return {
							valid: false,
							error: t("embeddings:fastembed.invalidResponseFormat"),
						}
					}

					// Check if the embedding has the expected structure
					const firstEmbedding = testResult[0]
					if (!Array.isArray(firstEmbedding) || firstEmbedding.length === 0) {
						return {
							valid: false,
							error: t("embeddings:fastembed.invalidEmbeddingFormat"),
						}
					}

					return { valid: true }
				} catch (error) {
					// Capture telemetry for validation errors
					TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
						error: sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
						stack: error instanceof Error ? sanitizeErrorMessage(error.stack || "") : undefined,
						location: "FastEmbedEmbedder:validateConfiguration",
					})
					throw error
				}
			},
			"fastembed",
			{
				beforeStandardHandling: (error: any) => {
					// Handle FastEmbed-specific errors
					if (
						error?.message?.includes("model not found") ||
						error?.message?.includes("Model not supported")
					) {
						return {
							valid: false,
							error: t("embeddings:fastembed.modelNotSupported", {
								model: this.defaultModel,
								availableModels: Object.keys(this.availableModels).join(", "),
							}),
						}
					}
					// Let standard handling take over
					return undefined
				},
			},
		)
	}

	get embedderInfo(): EmbedderInfo {
		return {
			name: "fastembed",
		}
	}
}
