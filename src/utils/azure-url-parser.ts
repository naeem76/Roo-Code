/**
 * Utility functions for parsing Azure OpenAI URLs and extracting API versions
 */

/**
 * Extracts the API version from an Azure OpenAI URL query parameter
 * @param url The Azure OpenAI URL that may contain an api-version query parameter
 * @returns The extracted API version string, or null if not found
 */
export function extractApiVersionFromUrl(url: string): string | null {
	try {
		const urlObj = new URL(url)
		return urlObj.searchParams.get('api-version')
	} catch (error) {
		// Invalid URL format
		return null
	}
}

/**
 * Checks if a URL appears to be an Azure OpenAI URL
 * @param url The URL to check
 * @returns True if the URL appears to be an Azure OpenAI URL
 */
export function isAzureOpenAiUrl(url: string): boolean {
	try {
		const urlObj = new URL(url)
		const host = urlObj.host.toLowerCase()
		
		// Check for Azure OpenAI hostname patterns
		return host.includes('.openai.azure.com') || 
		       host.endsWith('.azure.com') ||
		       urlObj.pathname.includes('/openai/deployments/')
	} catch (error) {
		return false
	}
}

/**
 * Removes the api-version query parameter from a URL
 * @param url The URL to clean
 * @returns The URL without the api-version parameter
 */
export function removeApiVersionFromUrl(url: string): string {
	try {
		const urlObj = new URL(url)
		urlObj.searchParams.delete('api-version')
		return urlObj.toString()
	} catch (error) {
		// Return original URL if parsing fails
		return url
	}
}