/**
 * Utility functions for managing Google Cloud environment variables
 * for provider-specific configurations
 */

/**
 * Temporarily sets the GOOGLE_CLOUD_PROJECT environment variable
 * and executes a function, then restores the original value
 */
export async function withGoogleCloudProject<T>(projectId: string | undefined, fn: () => Promise<T>): Promise<T> {
	if (!projectId) {
		// If no project ID is specified, just execute the function
		return await fn()
	}

	const originalValue = process.env.GOOGLE_CLOUD_PROJECT

	try {
		// Set the environment variable
		process.env.GOOGLE_CLOUD_PROJECT = projectId

		// Execute the function
		const result = await fn()

		return result
	} finally {
		// Restore the original value
		if (originalValue !== undefined) {
			process.env.GOOGLE_CLOUD_PROJECT = originalValue
		} else {
			delete process.env.GOOGLE_CLOUD_PROJECT
		}
	}
}

/**
 * Synchronous version for non-async operations
 */
export function withGoogleCloudProjectSync<T>(projectId: string | undefined, fn: () => T): T {
	if (!projectId) {
		// If no project ID is specified, just execute the function
		return fn()
	}

	const originalValue = process.env.GOOGLE_CLOUD_PROJECT

	try {
		// Set the environment variable
		process.env.GOOGLE_CLOUD_PROJECT = projectId

		// Execute the function
		const result = fn()

		return result
	} finally {
		// Restore the original value
		if (originalValue !== undefined) {
			process.env.GOOGLE_CLOUD_PROJECT = originalValue
		} else {
			delete process.env.GOOGLE_CLOUD_PROJECT
		}
	}
}
