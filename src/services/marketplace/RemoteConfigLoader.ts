import axios from "axios"
import * as yaml from "yaml"
import { z } from "zod"
import { getRooCodeApiUrl } from "@roo-code/cloud"
import type { MarketplaceItem, MarketplaceItemType } from "@roo-code/types"
import { modeMarketplaceItemSchema, mcpMarketplaceItemSchema } from "@roo-code/types"
import { modes } from "../../shared/modes"

// Response schemas for YAML API responses
const modeMarketplaceResponse = z.object({
	items: z.array(modeMarketplaceItemSchema),
})

const mcpMarketplaceResponse = z.object({
	items: z.array(mcpMarketplaceItemSchema),
})

export class RemoteConfigLoader {
	private apiBaseUrl: string
	private cache: Map<string, { data: MarketplaceItem[]; timestamp: number }> = new Map()
	private cacheDuration = 5 * 60 * 1000 // 5 minutes

	constructor() {
		this.apiBaseUrl = getRooCodeApiUrl()
	}

	async loadAllItems(): Promise<MarketplaceItem[]> {
		const items: MarketplaceItem[] = []

		const [modes, mcps] = await Promise.all([this.fetchModes(), this.fetchMcps()])

		items.push(...modes, ...mcps)
		return items
	}

	/**
	 * Convert built-in modes to marketplace format
	 */
	private getBuiltInModes(): MarketplaceItem[] {
		return modes.map((mode) => ({
			type: "mode" as const,
			id: mode.slug,
			name: mode.name,
			description: mode.description || mode.whenToUse || "Built-in mode",
			author: "Roo Code",
			tags: ["built-in", "core"],
			content: yaml.stringify({
				slug: mode.slug,
				name: mode.name,
				roleDefinition: mode.roleDefinition,
				whenToUse: mode.whenToUse,
				description: mode.description,
				groups: mode.groups,
				customInstructions: mode.customInstructions,
			}),
		}))
	}

	private async fetchModes(): Promise<MarketplaceItem[]> {
		const cacheKey = "modes"
		const cached = this.getFromCache(cacheKey)
		if (cached) return cached

		let apiModes: MarketplaceItem[] = []
		
		try {
			const data = await this.fetchWithRetry<string>(`${this.apiBaseUrl}/api/marketplace/modes`)

			// Parse and validate YAML response
			const yamlData = yaml.parse(data)
			const validated = modeMarketplaceResponse.parse(yamlData)

			apiModes = validated.items.map((item: any) => ({
				type: "mode" as const,
				...item,
			}))
		} catch (error) {
			console.warn("Failed to fetch modes from API, using built-in modes only:", error)
		}

		// Get built-in modes
		const builtInModes = this.getBuiltInModes()

		// Combine built-in modes with API modes, with API modes taking precedence for duplicates
		const allModes = [...builtInModes]
		
		// Add API modes, replacing any built-in modes with the same ID
		apiModes.forEach((apiMode) => {
			const existingIndex = allModes.findIndex((mode) => mode.id === apiMode.id)
			if (existingIndex !== -1) {
				// Replace built-in mode with API version
				allModes[existingIndex] = apiMode
			} else {
				// Add new API mode
				allModes.push(apiMode)
			}
		})

		this.setCache(cacheKey, allModes)
		return allModes
	}

	private async fetchMcps(): Promise<MarketplaceItem[]> {
		const cacheKey = "mcps"
		const cached = this.getFromCache(cacheKey)
		if (cached) return cached

		const data = await this.fetchWithRetry<string>(`${this.apiBaseUrl}/api/marketplace/mcps`)

		// Parse and validate YAML response
		const yamlData = yaml.parse(data)
		const validated = mcpMarketplaceResponse.parse(yamlData)

		const items: MarketplaceItem[] = validated.items.map((item: any) => ({
			type: "mcp" as const,
			...item,
		}))

		this.setCache(cacheKey, items)
		return items
	}

	private async fetchWithRetry<T>(url: string, maxRetries = 3): Promise<T> {
		let lastError: Error

		for (let i = 0; i < maxRetries; i++) {
			try {
				const response = await axios.get(url, {
					timeout: 10000, // 10 second timeout
					headers: {
						Accept: "application/json",
						"Content-Type": "application/json",
					},
				})
				return response.data as T
			} catch (error) {
				lastError = error as Error
				if (i < maxRetries - 1) {
					// Exponential backoff: 1s, 2s, 4s
					const delay = Math.pow(2, i) * 1000
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		throw lastError!
	}

	async getItem(id: string, type: MarketplaceItemType): Promise<MarketplaceItem | null> {
		const items = await this.loadAllItems()
		return items.find((item) => item.id === id && item.type === type) || null
	}

	private getFromCache(key: string): MarketplaceItem[] | null {
		const cached = this.cache.get(key)
		if (!cached) return null

		const now = Date.now()
		if (now - cached.timestamp > this.cacheDuration) {
			this.cache.delete(key)
			return null
		}

		return cached.data
	}

	private setCache(key: string, data: MarketplaceItem[]): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now(),
		})
	}

	clearCache(): void {
		this.cache.clear()
	}
}
