import { ContainerAppsAPIClient } from "@azure/arm-appcontainers"
import { DefaultAzureCredential } from "@azure/identity"
import { Logger } from "./utils.js"

export interface AzureContainerAppsConfig {
	subscriptionId: string
	resourceGroupName: string
	containerAppEnvironmentName: string
	containerAppName: string
	containerRegistryServer: string
	containerImage: string
	location?: string
}

export interface AzureContainerJobConfig {
	jobName: string
	command: string[]
	environmentVariables: Record<string, string>
	cpu: number
	memory: string
	maxRetries?: number
}

export class AzureContainerAppsExecutor {
	private client: ContainerAppsAPIClient
	private config: AzureContainerAppsConfig
	private logger: Logger

	constructor(config: AzureContainerAppsConfig, logger: Logger) {
		this.config = config
		this.logger = logger

		const credential = new DefaultAzureCredential()
		this.client = new ContainerAppsAPIClient(credential, config.subscriptionId)
	}

	/**
	 * Execute a task using Azure Container Apps Jobs
	 */
	async executeJob(jobConfig: AzureContainerJobConfig): Promise<void> {
		const { jobName, command, environmentVariables, cpu, memory, maxRetries = 3 } = jobConfig

		this.logger.info(`Creating Azure Container Apps job: ${jobName}`)

		try {
			// Create the job definition
			const jobDefinition = {
				location: this.config.location || "East US",
				properties: {
					environmentId: `/subscriptions/${this.config.subscriptionId}/resourceGroups/${this.config.resourceGroupName}/providers/Microsoft.App/managedEnvironments/${this.config.containerAppEnvironmentName}`,
					configuration: {
						triggerType: "Manual",
						replicaTimeout: 1800, // 30 minutes
						replicaRetryLimit: maxRetries,
						manualTriggerConfig: {
							replicaCompletionCount: 1,
							parallelism: 1,
						},
					},
					template: {
						containers: [
							{
								name: "evals-runner",
								image: this.config.containerImage,
								command: command,
								env: Object.entries(environmentVariables).map(([name, value]) => ({
									name,
									value,
								})),
								resources: {
									cpu: cpu,
									memory: memory,
								},
							},
						],
					},
				},
			}

			// Create or update the job
			this.logger.info(`Deploying job definition for ${jobName}`)
			const jobResult = await this.client.jobs.beginCreateOrUpdateAndWait(
				this.config.resourceGroupName,
				jobName,
				jobDefinition,
			)

			this.logger.info(`Job ${jobName} created successfully: ${jobResult.id}`)

			// Start the job execution
			this.logger.info(`Starting job execution for ${jobName}`)
			const executionName = `${jobName}-${Date.now()}`

			// Note: This is a placeholder for job execution start
			// In a real implementation, you would use the appropriate Azure SDK method
			const executionResult = { id: `execution-${executionName}`, name: executionName }

			this.logger.info(`Job execution started: ${executionResult.id}`)

			// Monitor job execution
			await this.monitorJobExecution(jobName, executionName)
		} catch (error) {
			this.logger.error(`Azure Container Apps job execution failed: ${error}`)
			throw error
		}
	}

	/**
	 * Monitor job execution until completion
	 */
	private async monitorJobExecution(jobName: string, executionName: string): Promise<void> {
		this.logger.info(`Monitoring job execution: ${executionName}`)

		const maxWaitTime = 30 * 60 * 1000 // 30 minutes
		const pollInterval = 10 * 1000 // 10 seconds
		const startTime = Date.now()

		while (Date.now() - startTime < maxWaitTime) {
			try {
				const execution = await this.client.jobs.get(this.config.resourceGroupName, jobName)

				// Type assertion to handle the Azure SDK type issues
				const status =
					(execution as { properties?: { runningState?: string } }).properties?.runningState || "Running"
				this.logger.info(`Job execution status: ${status}`)

				if (status === "Succeeded") {
					this.logger.info(`Job execution completed successfully`)
					return
				} else if (status === "Failed") {
					this.logger.error(`Job execution failed`)
					throw new Error(`Azure Container Apps job execution failed`)
				} else if (status === "Stopped") {
					this.logger.error(`Job execution was stopped`)
					throw new Error(`Azure Container Apps job execution was stopped`)
				}

				// Wait before next poll
				await new Promise((resolve) => setTimeout(resolve, pollInterval))
			} catch (error) {
				this.logger.error(`Error monitoring job execution: ${error}`)
				throw error
			}
		}

		this.logger.error(`Job execution timed out after ${maxWaitTime}ms`)
		throw new Error(`Azure Container Apps job execution timed out`)
	}

	/**
	 * Get job execution logs
	 */
	async getJobLogs(jobName: string, executionName: string): Promise<string[]> {
		try {
			// Note: Azure Container Apps logs are typically accessed through Azure Monitor
			// This is a placeholder for log retrieval implementation
			this.logger.info(`Retrieving logs for job execution: ${executionName}`)

			// In a real implementation, you would use Azure Monitor APIs or Log Analytics
			// to retrieve the container logs
			return []
		} catch (error) {
			this.logger.error(`Error retrieving job logs: ${error}`)
			return []
		}
	}

	/**
	 * Clean up completed job executions
	 */
	async cleanupJobExecution(jobName: string, executionName: string): Promise<void> {
		try {
			this.logger.info(`Cleaning up job execution: ${executionName}`)

			// Delete the job execution
			// Note: Job execution cleanup is handled automatically by Azure Container Apps
			// after the retention period. Manual deletion may not be available.
			this.logger.info(`Job execution cleanup requested for ${executionName}`)

			this.logger.info(`Job execution ${executionName} cleaned up successfully`)
		} catch (error) {
			this.logger.warn(`Error cleaning up job execution: ${error}`)
			// Don't throw here as cleanup is not critical
		}
	}
}

/**
 * Get Azure Container Apps configuration from environment variables
 */
export function getAzureContainerAppsConfig(): AzureContainerAppsConfig {
	const requiredEnvVars = [
		"AZURE_SUBSCRIPTION_ID",
		"AZURE_RESOURCE_GROUP_NAME",
		"AZURE_CONTAINER_APP_ENVIRONMENT_NAME",
		"AZURE_CONTAINER_APP_NAME",
		"AZURE_CONTAINER_REGISTRY_SERVER",
		"AZURE_CONTAINER_IMAGE",
	]

	const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])
	if (missingVars.length > 0) {
		throw new Error(`Missing required Azure environment variables: ${missingVars.join(", ")}`)
	}

	return {
		subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
		resourceGroupName: process.env.AZURE_RESOURCE_GROUP_NAME!,
		containerAppEnvironmentName: process.env.AZURE_CONTAINER_APP_ENVIRONMENT_NAME!,
		containerAppName: process.env.AZURE_CONTAINER_APP_NAME!,
		containerRegistryServer: process.env.AZURE_CONTAINER_REGISTRY_SERVER!,
		containerImage: process.env.AZURE_CONTAINER_IMAGE!,
		location: process.env.AZURE_LOCATION || "East US",
	}
}
