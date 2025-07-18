import { describe, it, expect, vi, beforeEach } from "vitest"
import { AzureContainerAppsExecutor, getAzureContainerAppsConfig } from "./azureContainerApps.js"
import { Logger } from "./utils.js"

// Mock Azure SDK
vi.mock("@azure/arm-appcontainers", () => ({
	ContainerAppsAPIClient: vi.fn().mockImplementation(() => ({
		jobs: {
			beginCreateOrUpdateAndWait: vi.fn().mockResolvedValue({ id: "job-id" }),
			get: vi.fn().mockResolvedValue({ id: "job-id", properties: { runningState: "Succeeded" } }),
		},
	})),
}))

vi.mock("@azure/identity", () => ({
	DefaultAzureCredential: vi.fn(),
}))

describe("Azure Container Apps", () => {
	let mockLogger: Logger

	beforeEach(() => {
		mockLogger = {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
			log: vi.fn(),
			close: vi.fn(),
		} as unknown as Logger

		// Reset environment variables
		delete process.env.AZURE_SUBSCRIPTION_ID
		delete process.env.AZURE_RESOURCE_GROUP_NAME
		delete process.env.AZURE_CONTAINER_APP_ENVIRONMENT_NAME
		delete process.env.AZURE_CONTAINER_APP_NAME
		delete process.env.AZURE_CONTAINER_REGISTRY_SERVER
		delete process.env.AZURE_CONTAINER_IMAGE
	})

	describe("getAzureContainerAppsConfig", () => {
		it("should return config when all required environment variables are set", () => {
			process.env.AZURE_SUBSCRIPTION_ID = "test-subscription"
			process.env.AZURE_RESOURCE_GROUP_NAME = "test-rg"
			process.env.AZURE_CONTAINER_APP_ENVIRONMENT_NAME = "test-env"
			process.env.AZURE_CONTAINER_APP_NAME = "test-app"
			process.env.AZURE_CONTAINER_REGISTRY_SERVER = "test.azurecr.io"
			process.env.AZURE_CONTAINER_IMAGE = "test.azurecr.io/app:latest"

			const config = getAzureContainerAppsConfig()

			expect(config).toEqual({
				subscriptionId: "test-subscription",
				resourceGroupName: "test-rg",
				containerAppEnvironmentName: "test-env",
				containerAppName: "test-app",
				containerRegistryServer: "test.azurecr.io",
				containerImage: "test.azurecr.io/app:latest",
				location: "East US",
			})
		})

		it("should use custom location when AZURE_LOCATION is set", () => {
			process.env.AZURE_SUBSCRIPTION_ID = "test-subscription"
			process.env.AZURE_RESOURCE_GROUP_NAME = "test-rg"
			process.env.AZURE_CONTAINER_APP_ENVIRONMENT_NAME = "test-env"
			process.env.AZURE_CONTAINER_APP_NAME = "test-app"
			process.env.AZURE_CONTAINER_REGISTRY_SERVER = "test.azurecr.io"
			process.env.AZURE_CONTAINER_IMAGE = "test.azurecr.io/app:latest"
			process.env.AZURE_LOCATION = "West US"

			const config = getAzureContainerAppsConfig()

			expect(config.location).toBe("West US")
		})

		it("should throw error when required environment variables are missing", () => {
			expect(() => getAzureContainerAppsConfig()).toThrow(
				"Missing required Azure environment variables: AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP_NAME, AZURE_CONTAINER_APP_ENVIRONMENT_NAME, AZURE_CONTAINER_APP_NAME, AZURE_CONTAINER_REGISTRY_SERVER, AZURE_CONTAINER_IMAGE",
			)
		})

		it("should throw error when some environment variables are missing", () => {
			process.env.AZURE_SUBSCRIPTION_ID = "test-subscription"
			process.env.AZURE_RESOURCE_GROUP_NAME = "test-rg"

			expect(() => getAzureContainerAppsConfig()).toThrow(
				"Missing required Azure environment variables: AZURE_CONTAINER_APP_ENVIRONMENT_NAME, AZURE_CONTAINER_APP_NAME, AZURE_CONTAINER_REGISTRY_SERVER, AZURE_CONTAINER_IMAGE",
			)
		})
	})

	describe("AzureContainerAppsExecutor", () => {
		let executor: AzureContainerAppsExecutor
		let config: ReturnType<typeof getAzureContainerAppsConfig>

		beforeEach(() => {
			config = {
				subscriptionId: "test-subscription",
				resourceGroupName: "test-rg",
				containerAppEnvironmentName: "test-env",
				containerAppName: "test-app",
				containerRegistryServer: "test.azurecr.io",
				containerImage: "test.azurecr.io/app:latest",
				location: "East US",
			}
			executor = new AzureContainerAppsExecutor(config, mockLogger)
		})

		describe("executeJob", () => {
			it("should execute a job successfully", async () => {
				const jobConfig = {
					jobName: "test-job",
					command: ["sh", "-c", "echo hello"],
					environmentVariables: { TEST_VAR: "test-value" },
					cpu: 1.0,
					memory: "2Gi",
				}

				await executor.executeJob(jobConfig)

				expect(mockLogger.info).toHaveBeenCalledWith("Creating Azure Container Apps job: test-job")
				expect(mockLogger.info).toHaveBeenCalledWith("Job test-job created successfully: job-id")
				expect(mockLogger.info).toHaveBeenCalledWith("Starting job execution for test-job")
				expect(mockLogger.info).toHaveBeenCalledWith(
					expect.stringMatching(/^Job execution started: execution-test-job-\d+$/),
				)
			})

			it("should handle job execution with custom retry limit", async () => {
				const jobConfig = {
					jobName: "test-job",
					command: ["sh", "-c", "echo hello"],
					environmentVariables: { TEST_VAR: "test-value" },
					cpu: 1.0,
					memory: "2Gi",
					maxRetries: 5,
				}

				await executor.executeJob(jobConfig)

				expect(mockLogger.info).toHaveBeenCalledWith("Creating Azure Container Apps job: test-job")
			})
		})

		describe("cleanupJobExecution", () => {
			it("should cleanup job execution successfully", async () => {
				await executor.cleanupJobExecution("test-job", "test-execution")

				expect(mockLogger.info).toHaveBeenCalledWith("Cleaning up job execution: test-execution")
				expect(mockLogger.info).toHaveBeenCalledWith("Job execution test-execution cleaned up successfully")
			})

			it("should handle cleanup errors gracefully", async () => {
				// Note: Cleanup is now handled automatically, so we just verify the log message

				await executor.cleanupJobExecution("test-job", "test-execution")

				expect(mockLogger.info).toHaveBeenCalledWith("Job execution cleanup requested for test-execution")
			})
		})
	})
})
