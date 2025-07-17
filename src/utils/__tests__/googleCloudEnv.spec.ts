// npx vitest run src/utils/__tests__/googleCloudEnv.spec.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest"

import { withGoogleCloudProject, withGoogleCloudProjectSync } from "../googleCloudEnv"

describe("googleCloudEnv", () => {
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

	describe("withGoogleCloudProject", () => {
		it("should set and restore GOOGLE_CLOUD_PROJECT environment variable", async () => {
			const testProjectId = "test-project-123"
			let capturedEnvValue: string | undefined

			const result = await withGoogleCloudProject(testProjectId, async () => {
				capturedEnvValue = process.env.GOOGLE_CLOUD_PROJECT
				return "test-result"
			})

			expect(capturedEnvValue).toBe(testProjectId)
			expect(process.env.GOOGLE_CLOUD_PROJECT).toBeUndefined()
			expect(result).toBe("test-result")
		})

		it("should restore original value if it existed", async () => {
			const originalProjectId = "original-project"
			const testProjectId = "test-project-123"
			process.env.GOOGLE_CLOUD_PROJECT = originalProjectId

			await withGoogleCloudProject(testProjectId, async () => {
				expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(testProjectId)
				return "test-result"
			})

			expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(originalProjectId)
		})

		it("should not modify environment if projectId is undefined", async () => {
			const originalProjectId = "original-project"
			process.env.GOOGLE_CLOUD_PROJECT = originalProjectId

			await withGoogleCloudProject(undefined, async () => {
				expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(originalProjectId)
				return "test-result"
			})

			expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(originalProjectId)
		})

		it("should restore environment even if function throws", async () => {
			const testProjectId = "test-project-123"

			try {
				await withGoogleCloudProject(testProjectId, async () => {
					expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(testProjectId)
					throw new Error("Test error")
				})
			} catch (error) {
				expect(error).toBeInstanceOf(Error)
			}

			expect(process.env.GOOGLE_CLOUD_PROJECT).toBeUndefined()
		})
	})

	describe("withGoogleCloudProjectSync", () => {
		it("should set and restore GOOGLE_CLOUD_PROJECT environment variable synchronously", () => {
			const testProjectId = "test-project-123"
			let capturedEnvValue: string | undefined

			const result = withGoogleCloudProjectSync(testProjectId, () => {
				capturedEnvValue = process.env.GOOGLE_CLOUD_PROJECT
				return "test-result"
			})

			expect(capturedEnvValue).toBe(testProjectId)
			expect(process.env.GOOGLE_CLOUD_PROJECT).toBeUndefined()
			expect(result).toBe("test-result")
		})

		it("should restore original value if it existed", () => {
			const originalProjectId = "original-project"
			const testProjectId = "test-project-123"
			process.env.GOOGLE_CLOUD_PROJECT = originalProjectId

			withGoogleCloudProjectSync(testProjectId, () => {
				expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(testProjectId)
				return "test-result"
			})

			expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(originalProjectId)
		})

		it("should not modify environment if projectId is undefined", () => {
			const originalProjectId = "original-project"
			process.env.GOOGLE_CLOUD_PROJECT = originalProjectId

			withGoogleCloudProjectSync(undefined, () => {
				expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(originalProjectId)
				return "test-result"
			})

			expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(originalProjectId)
		})

		it("should restore environment even if function throws", () => {
			const testProjectId = "test-project-123"

			try {
				withGoogleCloudProjectSync(testProjectId, () => {
					expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(testProjectId)
					throw new Error("Test error")
				})
			} catch (error) {
				expect(error).toBeInstanceOf(Error)
			}

			expect(process.env.GOOGLE_CLOUD_PROJECT).toBeUndefined()
		})
	})
})
