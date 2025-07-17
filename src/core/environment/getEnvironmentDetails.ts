import path from "path"
import os from "os"

import * as vscode from "vscode"
import pWaitFor from "p-wait-for"
import delay from "delay"

import type { ExperimentId } from "@roo-code/types"

import { EXPERIMENT_IDS, experiments as Experiments } from "../../shared/experiments"
import { formatLanguage } from "../../shared/language"
import { defaultModeSlug, getFullModeDetails, getModeBySlug, isToolAllowedForMode } from "../../shared/modes"
import { getApiMetrics } from "../../shared/getApiMetrics"
import { listFiles } from "../../services/glob/list-files"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"
import { Terminal } from "../../integrations/terminal/Terminal"
import { arePathsEqual } from "../../utils/path"
import { formatResponse } from "../prompts/responses"

import { Task } from "../task/Task"
import { formatReminderSection } from "./reminder"
import { EnvironmentDetailsCache } from "./EnvironmentDetailsCache"

// Global cache instance - shared across all tasks for efficiency
const environmentCache = new EnvironmentDetailsCache()

export async function getEnvironmentDetails(cline: Task, includeFileDetails: boolean = false) {
	const clineProvider = cline.providerRef.deref()
	const state = await clineProvider?.getState()
	const { terminalOutputLineLimit = 500, maxWorkspaceFiles = 200, maxOpenTabsContext } = state ?? {}
	const maxTabs = maxOpenTabsContext ?? 20

	// Handle terminal waiting logic (this needs to happen before caching)
	const busyTerminals = [
		...TerminalRegistry.getTerminals(true, cline.taskId),
		...TerminalRegistry.getBackgroundTerminals(true),
	]

	if (busyTerminals.length > 0) {
		if (cline.didEditFile) {
			await delay(300) // Delay after saving file to let terminals catch up.
		}

		// Wait for terminals to cool down.
		await pWaitFor(() => busyTerminals.every((t) => !TerminalRegistry.isProcessHot(t.id)), {
			interval: 100,
			timeout: 5_000,
		}).catch(() => {})
	}

	// Reset, this lets us know when to wait for saved files to update terminals.
	cline.didEditFile = false

	// Use cached sections where possible
	const visibleFilesSection = await environmentCache.getVisibleFilesSection(cline, maxWorkspaceFiles)
	const openTabsSection = await environmentCache.getOpenTabsSection(cline, maxTabs)
	const terminalsSection = await environmentCache.getTerminalsSection(cline, terminalOutputLineLimit)
	const recentlyModifiedSection = await environmentCache.getRecentlyModifiedSection(cline)
	const timeSection = environmentCache.getTimeSection() // Always fresh
	const costSection = await environmentCache.getCostSection(cline)
	const modeSection = await environmentCache.getModeSection(cline)

	// Combine all sections
	let details = ""
	details += visibleFilesSection
	details += openTabsSection
	details += terminalsSection
	details += recentlyModifiedSection
	details += timeSection
	details += costSection
	details += modeSection

	// Handle file details section if requested
	if (includeFileDetails) {
		const fileDetailsSection = await environmentCache.getFileDetailsSection(cline, maxWorkspaceFiles)
		details += fileDetailsSection
	}

	const reminderSection = formatReminderSection(cline.todoList)
	return `<environment_details>\n${details.trim()}\n${reminderSection}\n</environment_details>`
}

/**
 * Clears the environment details cache (useful for testing or manual refresh)
 */
export function clearEnvironmentDetailsCache(): void {
	environmentCache.clearCache()
}

/**
 * Gets cache statistics for debugging
 */
export function getEnvironmentDetailsCacheStats(): { size: number; sections: string[] } {
	return environmentCache.getCacheStats()
}
