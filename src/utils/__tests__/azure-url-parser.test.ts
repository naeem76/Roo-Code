import { describe, it, expect } from 'vitest'
import { extractApiVersionFromUrl, isAzureOpenAiUrl, removeApiVersionFromUrl } from '../azure-url-parser'

describe('azure-url-parser', () => {
	describe('extractApiVersionFromUrl', () => {
		it('should extract API version from Azure OpenAI URL', () => {
			const url = 'https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions?api-version=2024-05-01-preview'
			const result = extractApiVersionFromUrl(url)
			expect(result).toBe('2024-05-01-preview')
		})

		it('should extract API version from URL with multiple query parameters', () => {
			const url = 'https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions?foo=bar&api-version=2024-12-01-preview&baz=qux'
			const result = extractApiVersionFromUrl(url)
			expect(result).toBe('2024-12-01-preview')
		})

		it('should return null when no api-version parameter exists', () => {
			const url = 'https://api.openai.com/v1/chat/completions'
			const result = extractApiVersionFromUrl(url)
			expect(result).toBeNull()
		})

		it('should return null for invalid URLs', () => {
			const invalidUrl = 'not-a-valid-url'
			const result = extractApiVersionFromUrl(invalidUrl)
			expect(result).toBeNull()
		})

		it('should handle empty api-version parameter', () => {
			const url = 'https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions?api-version='
			const result = extractApiVersionFromUrl(url)
			expect(result).toBe('')
		})

		it('should handle URL without query parameters', () => {
			const url = 'https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions'
			const result = extractApiVersionFromUrl(url)
			expect(result).toBeNull()
		})
	})

	describe('isAzureOpenAiUrl', () => {
		it('should return true for Azure OpenAI URLs with .openai.azure.com', () => {
			const url = 'https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions'
			const result = isAzureOpenAiUrl(url)
			expect(result).toBe(true)
		})

		it('should return true for Azure URLs ending with .azure.com', () => {
			const url = 'https://myservice.azure.com/api/v1'
			const result = isAzureOpenAiUrl(url)
			expect(result).toBe(true)
		})

		it('should return true for URLs with /openai/deployments/ path', () => {
			const url = 'https://custom-domain.com/openai/deployments/mymodel/chat/completions'
			const result = isAzureOpenAiUrl(url)
			expect(result).toBe(true)
		})

		it('should return false for regular OpenAI URLs', () => {
			const url = 'https://api.openai.com/v1/chat/completions'
			const result = isAzureOpenAiUrl(url)
			expect(result).toBe(false)
		})

		it('should return false for other API URLs', () => {
			const url = 'https://api.anthropic.com/v1/messages'
			const result = isAzureOpenAiUrl(url)
			expect(result).toBe(false)
		})

		it('should return false for invalid URLs', () => {
			const invalidUrl = 'not-a-valid-url'
			const result = isAzureOpenAiUrl(invalidUrl)
			expect(result).toBe(false)
		})

		it('should handle case insensitive hostname matching', () => {
			const url = 'https://MYRESOURCE.OPENAI.AZURE.COM/openai/deployments/mymodel'
			const result = isAzureOpenAiUrl(url)
			expect(result).toBe(true)
		})
	})

	describe('removeApiVersionFromUrl', () => {
		it('should remove api-version parameter from URL', () => {
			const url = 'https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions?api-version=2024-05-01-preview'
			const result = removeApiVersionFromUrl(url)
			expect(result).toBe('https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions')
		})

		it('should remove api-version parameter while preserving other parameters', () => {
			const url = 'https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions?foo=bar&api-version=2024-05-01-preview&baz=qux'
			const result = removeApiVersionFromUrl(url)
			expect(result).toBe('https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions?foo=bar&baz=qux')
		})

		it('should return original URL when no api-version parameter exists', () => {
			const url = 'https://api.openai.com/v1/chat/completions?foo=bar'
			const result = removeApiVersionFromUrl(url)
			expect(result).toBe(url)
		})

		it('should return original URL for invalid URLs', () => {
			const invalidUrl = 'not-a-valid-url'
			const result = removeApiVersionFromUrl(invalidUrl)
			expect(result).toBe(invalidUrl)
		})

		it('should handle URL with only api-version parameter', () => {
			const url = 'https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions?api-version=2024-05-01-preview'
			const result = removeApiVersionFromUrl(url)
			expect(result).toBe('https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions')
		})

		it('should handle URL without query parameters', () => {
			const url = 'https://myresource.openai.azure.com/openai/deployments/mymodel/chat/completions'
			const result = removeApiVersionFromUrl(url)
			expect(result).toBe(url)
		})
	})
})