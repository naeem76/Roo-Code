import crypto from "crypto"
import * as vscode from "vscode"
import path from "path"
import os from "os"

import { Task } from "../task/Task"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"
import { Terminal } from "../../integrations/terminal/Terminal"
import { getApiMetrics } from "../../shared/getApiMetrics"
import { defaultModeSlug, getFullModeDetails } from "../../shared/modes"
import { formatLanguage } from "../../shared/language"
import { EXPERIMENT_IDS, experiments as Experiments } from "../../shared/experiments"
import { listFiles } from "../../services/glob/list-files"
import { formatResponse } from "../prompts/responses"
import { arePathsEqual } from "../../utils/path"

/**
 * Represents a cached section of environment details
 */
interface CachedSection {
	hash: string
	content: string
	timestamp: number
}

/**
 * Configuration for environment details sections
 */
interface SectionConfig {
	/** Whether this section should be cached */
	cacheable: boolean
	/** TTL in milliseconds (0 = no expiration) */
	ttl: number
}

/**
 * Environment details cache manager that implements change detection
 * to reduce duplicate processing and token usage
 */
export class EnvironmentDetailsCache {
	private cache = new Map<string, CachedSection>()
	private readonly sectionConfigs: Record<string, SectionConfig> = {
		visibleFiles: { cacheable: true, ttl: 5000 }, // 5 seconds
		openTabs: { cacheable: true, ttl: 5000 },
		terminals: { cacheable: true, ttl: 1000 }, // Shorter TTL for dynamic content
		recentlyModified: { cacheable: true, ttl: 2000 },
		time: { cacheable: false, ttl: 0 }, // Always fresh
		cost: { cacheable: true, ttl: 1000 },
		mode: { cacheable: true, ttl: 10000 }, // 10 seconds
		fileDetails: { cacheable: true, ttl: 30000 }, // 30 seconds for file listings
	}

	/**
	 * Creates a hash for the given content
	 */
	private createHash(content: string): string {
		return crypto.createHash("sha256").update(content).digest("hex")
	}

	/**
	 * Checks if a cached section is still valid
	 */
	private isCacheValid(section: CachedSection, config: SectionConfig): boolean {
		if (config.ttl === 0) return true // No expiration
		return Date.now() - section.timestamp < config.ttl
	}

	/**
	 * Gets or generates the visible files section
	 */
	async getVisibleFilesSection(cline: Task, maxWorkspaceFiles: number): Promise<string> {
		const sectionKey = "visibleFiles"
		const config = this.sectionConfigs[sectionKey]

		if (!config.cacheable) {
			return this.generateVisibleFilesSection(cline, maxWorkspaceFiles)
		}

		// Create a hash of the inputs that affect this section
		const visibleFilePaths = vscode.window.visibleTextEditors
			?.map((editor: vscode.TextEditor) => editor.document?.uri?.fsPath)
			.filter(Boolean)
			.map((absolutePath: string) => path.relative(cline.cwd, absolutePath))
			.slice(0, maxWorkspaceFiles)

		const inputHash = this.createHash(JSON.stringify({
			visibleFilePaths: visibleFilePaths || [],
			cwd: cline.cwd,
			maxWorkspaceFiles
		}))

		const cached = this.cache.get(sectionKey)
		if (cached && cached.hash === inputHash && this.isCacheValid(cached, config)) {
			return cached.content
		}

		// Generate fresh content
		const content = await this.generateVisibleFilesSection(cline, maxWorkspaceFiles)
		this.cache.set(sectionKey, {
			hash: inputHash,
			content,
			timestamp: Date.now()
		})

		return content
	}

	/**
	 * Generates the visible files section content
	 */
	private async generateVisibleFilesSection(cline: Task, maxWorkspaceFiles: number): Promise<string> {
		let details = "\n\n# VSCode Visible Files"

		const visibleFilePaths = vscode.window.visibleTextEditors
			?.map((editor: vscode.TextEditor) => editor.document?.uri?.fsPath)
			.filter(Boolean)
			.map((absolutePath: string) => path.relative(cline.cwd, absolutePath))
			.slice(0, maxWorkspaceFiles)

		// Filter paths through rooIgnoreController
		const allowedVisibleFiles = cline.rooIgnoreController
			? cline.rooIgnoreController.filterPaths(visibleFilePaths || [])
			: (visibleFilePaths || []).map((p: string) => p.toPosix()).join("\n")

		if (allowedVisibleFiles) {
			details += `\n${allowedVisibleFiles}`
		} else {
			details += "\n(No visible files)"
		}

		return details
	}

	/**
	 * Gets or generates the open tabs section
	 */
	async getOpenTabsSection(cline: Task, maxTabs: number): Promise<string> {
		const sectionKey = "openTabs"
		const config = this.sectionConfigs[sectionKey]

		if (!config.cacheable) {
			return this.generateOpenTabsSection(cline, maxTabs)
		}

		// Create a hash of the inputs that affect this section
		const openTabPaths = vscode.window.tabGroups.all
			.flatMap((group: vscode.TabGroup) => group.tabs)
			.map((tab: vscode.Tab) => (tab.input as vscode.TabInputText)?.uri?.fsPath)
			.filter(Boolean)
			.map((absolutePath: string) => path.relative(cline.cwd, absolutePath).toPosix())
			.slice(0, maxTabs)

		const inputHash = this.createHash(JSON.stringify({
			openTabPaths,
			cwd: cline.cwd,
			maxTabs
		}))

		const cached = this.cache.get(sectionKey)
		if (cached && cached.hash === inputHash && this.isCacheValid(cached, config)) {
			return cached.content
		}

		// Generate fresh content
		const content = await this.generateOpenTabsSection(cline, maxTabs)
		this.cache.set(sectionKey, {
			hash: inputHash,
			content,
			timestamp: Date.now()
		})

		return content
	}

	/**
	 * Generates the open tabs section content
	 */
	private async generateOpenTabsSection(cline: Task, maxTabs: number): Promise<string> {
		let details = "\n\n# VSCode Open Tabs"

		const openTabPaths = vscode.window.tabGroups.all
			.flatMap((group: vscode.TabGroup) => group.tabs)
			.map((tab: vscode.Tab) => (tab.input as vscode.TabInputText)?.uri?.fsPath)
			.filter(Boolean)
			.map((absolutePath: string) => path.relative(cline.cwd, absolutePath).toPosix())
			.slice(0, maxTabs)

		// Filter paths through rooIgnoreController
		const allowedOpenTabs = cline.rooIgnoreController
			? cline.rooIgnoreController.filterPaths(openTabPaths)
			: openTabPaths.map((p: string) => p.toPosix()).join("\n")

		if (allowedOpenTabs) {
			details += `\n${allowedOpenTabs}`
		} else {
			details += "\n(No open tabs)"
		}

		return details
	}

	/**
	 * Gets or generates the terminals section
	 */
	async getTerminalsSection(cline: Task, terminalOutputLineLimit: number): Promise<string> {
		const sectionKey = "terminals"
		const config = this.sectionConfigs[sectionKey]

		if (!config.cacheable) {
			return this.generateTerminalsSection(cline, terminalOutputLineLimit)
		}

		// Get terminal state for hashing
		const busyTerminals = [
			...TerminalRegistry.getTerminals(true, cline.taskId),
			...TerminalRegistry.getBackgroundTerminals(true),
		]

		const inactiveTerminals = [
			...TerminalRegistry.getTerminals(false, cline.taskId),
			...TerminalRegistry.getBackgroundTerminals(false),
		]

		// Create a simplified hash of terminal state
		const terminalState = {
			busyCount: busyTerminals.length,
			inactiveCount: inactiveTerminals.length,
			busyIds: busyTerminals.map(t => t.id).sort(),
			inactiveIds: inactiveTerminals.map(t => t.id).sort(),
			// Include a timestamp component since terminal output changes frequently
			timeWindow: Math.floor(Date.now() / 1000) // 1-second granularity
		}

		const inputHash = this.createHash(JSON.stringify(terminalState))

		const cached = this.cache.get(sectionKey)
		if (cached && cached.hash === inputHash && this.isCacheValid(cached, config)) {
			return cached.content
		}

		// Generate fresh content
		const content = await this.generateTerminalsSection(cline, terminalOutputLineLimit)
		this.cache.set(sectionKey, {
			hash: inputHash,
			content,
			timestamp: Date.now()
		})

		return content
	}

	/**
	 * Generates the terminals section content
	 */
	private async generateTerminalsSection(cline: Task, terminalOutputLineLimit: number): Promise<string> {
		// Get task-specific and background terminals.
		const busyTerminals = [
			...TerminalRegistry.getTerminals(true, cline.taskId),
			...TerminalRegistry.getBackgroundTerminals(true),
		]

		const inactiveTerminals = [
			...TerminalRegistry.getTerminals(false, cline.taskId),
			...TerminalRegistry.getBackgroundTerminals(false),
		]

		let terminalDetails = ""

		if (busyTerminals.length > 0) {
			// Terminals are cool, let's retrieve their output.
			terminalDetails += "\n\n# Actively Running Terminals"

			for (const busyTerminal of busyTerminals) {
				const cwd = busyTerminal.getCurrentWorkingDirectory()
				terminalDetails += `\n## Terminal ${busyTerminal.id} (Active)`
				terminalDetails += `\n### Working Directory: \`${cwd}\``
				terminalDetails += `\n### Original command: \`${busyTerminal.getLastCommand()}\``
				let newOutput = TerminalRegistry.getUnretrievedOutput(busyTerminal.id)

				if (newOutput) {
					newOutput = Terminal.compressTerminalOutput(newOutput, terminalOutputLineLimit)
					terminalDetails += `\n### New Output\n${newOutput}`
				}
			}
		}

		// First check if any inactive terminals in this task have completed
		// processes with output.
		const terminalsWithOutput = inactiveTerminals.filter((terminal) => {
			const completedProcesses = terminal.getProcessesWithOutput()
			return completedProcesses.length > 0
		})

		// Only add the header if there are terminals with output.
		if (terminalsWithOutput.length > 0) {
			terminalDetails += "\n\n# Inactive Terminals with Completed Process Output"

			// Process each terminal with output.
			for (const inactiveTerminal of terminalsWithOutput) {
				let terminalOutputs: string[] = []

				// Get output from completed processes queue.
				const completedProcesses = inactiveTerminal.getProcessesWithOutput()

				for (const process of completedProcesses) {
					let output = process.getUnretrievedOutput()

					if (output) {
						output = Terminal.compressTerminalOutput(output, terminalOutputLineLimit)
						terminalOutputs.push(`Command: \`${process.command}\`\n${output}`)
					}
				}

				// Clean the queue after retrieving output.
				inactiveTerminal.cleanCompletedProcessQueue()

				// Add this terminal's outputs to the details.
				if (terminalOutputs.length > 0) {
					const cwd = inactiveTerminal.getCurrentWorkingDirectory()
					terminalDetails += `\n## Terminal ${inactiveTerminal.id} (Inactive)`
					terminalDetails += `\n### Working Directory: \`${cwd}\``
					terminalOutputs.forEach((output) => {
						terminalDetails += `\n### New Output\n${output}`
					})
				}
			}
		}

		return terminalDetails
	}

	/**
	 * Gets or generates the recently modified files section
	 */
	async getRecentlyModifiedSection(cline: Task): Promise<string> {
		const sectionKey = "recentlyModified"
		const config = this.sectionConfigs[sectionKey]

		if (!config.cacheable) {
			return this.generateRecentlyModifiedSection(cline)
		}

		// Get recently modified files for hashing
		const recentlyModifiedFiles = cline.fileContextTracker.getAndClearRecentlyModifiedFiles()
		const inputHash = this.createHash(JSON.stringify(recentlyModifiedFiles.sort()))

		const cached = this.cache.get(sectionKey)
		if (cached && cached.hash === inputHash && this.isCacheValid(cached, config)) {
			// Note: We still need to clear the files even if using cache
			cline.fileContextTracker.getAndClearRecentlyModifiedFiles()
			return cached.content
		}

		// Generate fresh content
		const content = await this.generateRecentlyModifiedSection(cline)
		this.cache.set(sectionKey, {
			hash: inputHash,
			content,
			timestamp: Date.now()
		})

		return content
	}

	/**
	 * Generates the recently modified files section content
	 */
	private async generateRecentlyModifiedSection(cline: Task): Promise<string> {
		const recentlyModifiedFiles = cline.fileContextTracker.getAndClearRecentlyModifiedFiles()

		if (recentlyModifiedFiles.length > 0) {
			let details = "\n\n# Recently Modified Files\nThese files have been modified since you last accessed them (file was just edited so you may need to re-read it before editing):"
			for (const filePath of recentlyModifiedFiles) {
				details += `\n${filePath}`
			}
			return details
		}

		return ""
	}

	/**
	 * Gets the current time section (always fresh)
	 */
	getTimeSection(): string {
		const now = new Date()
		const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
		const timeZoneOffset = -now.getTimezoneOffset() / 60
		const timeZoneOffsetHours = Math.floor(Math.abs(timeZoneOffset))
		const timeZoneOffsetMinutes = Math.abs(Math.round((Math.abs(timeZoneOffset) - timeZoneOffsetHours) * 60))
		const timeZoneOffsetStr = `${timeZoneOffset >= 0 ? "+" : "-"}${timeZoneOffsetHours}:${timeZoneOffsetMinutes.toString().padStart(2, "0")}`
		
		return `\n\n# Current Time\n${now.toISOString()} (UTC, UTC${timeZoneOffsetStr})`
	}

	/**
	 * Gets or generates the cost section
	 */
	async getCostSection(cline: Task): Promise<string> {
		const sectionKey = "cost"
		const config = this.sectionConfigs[sectionKey]

		if (!config.cacheable) {
			return this.generateCostSection(cline)
		}

		// Get cost metrics for hashing
		const { totalCost } = getApiMetrics(cline.clineMessages)
		const inputHash = this.createHash(JSON.stringify({ totalCost }))

		const cached = this.cache.get(sectionKey)
		if (cached && cached.hash === inputHash && this.isCacheValid(cached, config)) {
			return cached.content
		}

		// Generate fresh content
		const content = await this.generateCostSection(cline)
		this.cache.set(sectionKey, {
			hash: inputHash,
			content,
			timestamp: Date.now()
		})

		return content
	}

	/**
	 * Generates the cost section content
	 */
	private async generateCostSection(cline: Task): Promise<string> {
		const { totalCost } = getApiMetrics(cline.clineMessages)
		return `\n\n# Current Cost\n${totalCost !== null ? `$${totalCost.toFixed(2)}` : "(Not available)"}`
	}

	/**
	 * Gets or generates the mode section
	 */
	async getModeSection(cline: Task): Promise<string> {
		const sectionKey = "mode"
		const config = this.sectionConfigs[sectionKey]

		if (!config.cacheable) {
			return this.generateModeSection(cline)
		}

		// Get state for hashing
		const clineProvider = cline.providerRef.deref()
		const state = await clineProvider?.getState()
		const {
			mode,
			customModes,
			customModePrompts,
			experiments = {},
			customInstructions: globalCustomInstructions,
			language,
		} = state ?? {}

		const currentMode = mode ?? defaultModeSlug
		const { id: modelId } = cline.api.getModel()

		const inputHash = this.createHash(JSON.stringify({
			currentMode,
			modelId,
			customModes,
			customModePrompts,
			experiments,
			globalCustomInstructions,
			language
		}))

		const cached = this.cache.get(sectionKey)
		if (cached && cached.hash === inputHash && this.isCacheValid(cached, config)) {
			return cached.content
		}

		// Generate fresh content
		const content = await this.generateModeSection(cline)
		this.cache.set(sectionKey, {
			hash: inputHash,
			content,
			timestamp: Date.now()
		})

		return content
	}

	/**
	 * Generates the mode section content
	 */
	private async generateModeSection(cline: Task): Promise<string> {
		const clineProvider = cline.providerRef.deref()
		const state = await clineProvider?.getState()
		const {
			mode,
			customModes,
			customModePrompts,
			experiments = {},
			customInstructions: globalCustomInstructions,
			language,
		} = state ?? {}

		const currentMode = mode ?? defaultModeSlug
		const { id: modelId } = cline.api.getModel()

		const modeDetails = await getFullModeDetails(currentMode, customModes, customModePrompts, {
			cwd: cline.cwd,
			globalCustomInstructions,
			language: language ?? formatLanguage(vscode.env.language),
		})

		let details = `\n\n# Current Mode\n`
		details += `<slug>${currentMode}</slug>\n`
		details += `<name>${modeDetails.name}</name>\n`
		details += `<model>${modelId}</model>\n`

		if (Experiments.isEnabled(experiments ?? {}, EXPERIMENT_IDS.POWER_STEERING)) {
			details += `<role>${modeDetails.roleDefinition}</role>\n`

			if (modeDetails.customInstructions) {
				details += `<custom_instructions>${modeDetails.customInstructions}</custom_instructions>\n`
			}
		}

		return details
	}

	/**
	 * Gets or generates the file details section
	 */
	async getFileDetailsSection(cline: Task, maxWorkspaceFiles: number): Promise<string> {
		const sectionKey = "fileDetails"
		const config = this.sectionConfigs[sectionKey]

		if (!config.cacheable) {
			return this.generateFileDetailsSection(cline, maxWorkspaceFiles)
		}

		// Create hash based on workspace directory and settings
		const clineProvider = cline.providerRef.deref()
		const state = await clineProvider?.getState()
		const { showRooIgnoredFiles = true } = state ?? {}

		const inputHash = this.createHash(JSON.stringify({
			cwd: cline.cwd,
			maxWorkspaceFiles,
			showRooIgnoredFiles,
			// Add a time component to periodically refresh file listings
			timeWindow: Math.floor(Date.now() / 30000) // 30-second windows
		}))

		const cached = this.cache.get(sectionKey)
		if (cached && cached.hash === inputHash && this.isCacheValid(cached, config)) {
			return cached.content
		}

		// Generate fresh content
		const content = await this.generateFileDetailsSection(cline, maxWorkspaceFiles)
		this.cache.set(sectionKey, {
			hash: inputHash,
			content,
			timestamp: Date.now()
		})

		return content
	}

	/**
	 * Generates the file details section content
	 */
	private async generateFileDetailsSection(cline: Task, maxWorkspaceFiles: number): Promise<string> {
		let details = `\n\n# Current Workspace Directory (${cline.cwd.toPosix()}) Files\n`
		const isDesktop = arePathsEqual(cline.cwd, path.join(os.homedir(), "Desktop"))

		if (isDesktop) {
			// Don't want to immediately access desktop since it would show
			// permission popup.
			details += "(Desktop files not shown automatically. Use list_files to explore if needed.)"
		} else {
			const maxFiles = maxWorkspaceFiles ?? 200

			// Early return for limit of 0
			if (maxFiles === 0) {
				details += "(Workspace files context disabled. Use list_files to explore if needed.)"
			} else {
				const [files, didHitLimit] = await listFiles(cline.cwd, true, maxFiles)
				const clineProvider = cline.providerRef.deref()
				const state = await clineProvider?.getState()
				const { showRooIgnoredFiles = true } = state ?? {}

				const result = formatResponse.formatFilesList(
					cline.cwd,
					files,
					didHitLimit,
					cline.rooIgnoreController,
					showRooIgnoredFiles,
				)

				details += result
			}
		}

		return details
	}

	/**
	 * Clears the cache (useful for testing or manual refresh)
	 */
	clearCache(): void {
		this.cache.clear()
	}

	/**
	 * Gets cache statistics for debugging
	 */
	getCacheStats(): { size: number; sections: string[] } {
		return {
			size: this.cache.size,
			sections: Array.from(this.cache.keys())
		}
	}
}