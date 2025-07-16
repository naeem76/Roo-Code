import OpenAI from "openai"
import { Anthropic } from "@anthropic-ai/sdk" // Keep for type usage only

import { litellmDefaultModelId, litellmDefaultModelInfo } from "@roo-code/types"

import { calculateApiCostOpenAI } from "../../shared/cost"

import { ApiHandlerOptions } from "../../shared/api"

import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format"

import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { RouterProvider } from "./router-provider"

/**
 * LiteLLM provider handler
 *
 * This handler uses the LiteLLM API to proxy requests to various LLM providers.
 * It follows the OpenAI API format for compatibility.
 */
export class LiteLLMHandler extends RouterProvider implements SingleCompletionHandler {
	constructor(options: ApiHandlerOptions) {
		super({
			options,
			name: "litellm",
			baseURL: `${options.litellmBaseUrl || "http://localhost:4000"}`,
			apiKey: options.litellmApiKey || "dummy-key",
			modelId: options.litellmModelId,
			defaultModelId: litellmDefaultModelId,
			defaultModelInfo: litellmDefaultModelInfo,
		})
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const { id: modelId, info } = await this.fetchModel()

		const baseOpenAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(messages),
		]

		// Apply prompt caching if enabled
		const openAiMessages = this.options.litellmUsePromptCache
			? this.addCacheControlToMessages(baseOpenAiMessages)
			: baseOpenAiMessages

		// Required by some providers; others default to max tokens allowed
		let maxTokens: number | undefined = info.maxTokens ?? undefined

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: modelId,
			max_tokens: maxTokens,
			messages: openAiMessages,
			stream: true,
			stream_options: {
				include_usage: true,
			},
		}

		if (this.supportsTemperature(modelId)) {
			requestOptions.temperature = this.options.modelTemperature ?? 0
		}

		try {
			const { data: completion } = await this.client.chat.completions.create(requestOptions).withResponse()

			let lastUsage

			for await (const chunk of completion) {
				const delta = chunk.choices[0]?.delta
				const usage = chunk.usage as LiteLLMUsage

				if (delta?.content) {
					yield { type: "text", text: delta.content }
				}

				if (usage) {
					lastUsage = usage
				}
			}

			if (lastUsage) {
				// Extract cache-related information if available
				const cacheWriteTokens =
					lastUsage.cache_creation_input_tokens || lastUsage.prompt_cache_miss_tokens || 0
				const cacheReadTokens =
					lastUsage.cache_read_input_tokens ||
					lastUsage.prompt_cache_hit_tokens ||
					lastUsage.prompt_tokens_details?.cached_tokens ||
					0

				const usageData: ApiStreamUsageChunk = {
					type: "usage",
					inputTokens: lastUsage.prompt_tokens || 0,
					outputTokens: lastUsage.completion_tokens || 0,
					cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
					cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
				}

				usageData.totalCost = calculateApiCostOpenAI(
					info,
					usageData.inputTokens,
					usageData.outputTokens,
					usageData.cacheWriteTokens,
					usageData.cacheReadTokens,
				)

				yield usageData
			}
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`LiteLLM streaming error: ${error.message}`)
			}
			throw error
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		const { id: modelId, info } = await this.fetchModel()

		try {
			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: modelId,
				messages: [{ role: "user", content: prompt }],
			}

			if (this.supportsTemperature(modelId)) {
				requestOptions.temperature = this.options.modelTemperature ?? 0
			}

			requestOptions.max_tokens = info.maxTokens

			const response = await this.client.chat.completions.create(requestOptions)
			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`LiteLLM completion error: ${error.message}`)
			}
			throw error
		}
	}

	/**
	 * Add cache control metadata to messages for prompt caching
	 * Based on Cline's implementation: adds cache_control to system message and last two user messages
	 */
	private addCacheControlToMessages(
		messages: OpenAI.Chat.ChatCompletionMessageParam[],
	): OpenAI.Chat.ChatCompletionMessageParam[] {
		const cacheControl = { cache_control: { type: "ephemeral" } }

		// Find user message indices
		const userMsgIndices = messages.reduce(
			(acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
			[] as number[],
		)

		const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
		const secondLastUserMsgIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

		return messages.map((message, index) => {
			// Add cache control to system message (first message)
			if (index === 0 && message.role === "system") {
				return { ...message, ...cacheControl }
			}

			// Add cache control to last two user messages
			if (index === lastUserMsgIndex || index === secondLastUserMsgIndex) {
				return { ...message, ...cacheControl }
			}

			return message
		})
	}
}

// LiteLLM usage may include an extra field for Anthropic use cases.
interface LiteLLMUsage extends OpenAI.CompletionUsage {
	cache_creation_input_tokens?: number
	prompt_cache_miss_tokens?: number
	cache_read_input_tokens?: number
	prompt_cache_hit_tokens?: number
}
