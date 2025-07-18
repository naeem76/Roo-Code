import pWaitFor from "p-wait-for"
import delay from "delay"

import { TerminalRegistry } from "../../../integrations/terminal/TerminalRegistry"
import { Terminal } from "../../../integrations/terminal/Terminal"
import type { Task } from "../../task/Task"

/**
 * Retrieves terminal context including active and inactive terminals with their output.
 * Handles terminal state synchronization and output compression.
 *
 * @param cline - The current task instance
 * @returns Object containing terminal information or undefined if no terminals
 */
export async function getTerminalContext(cline: Task) {
	try {
		const state = await cline.providerRef.deref()?.getState()
		const { terminalOutputLineLimit = 500 } = state ?? {}
		const terminalsData: Array<{
			"@id": string
			"@status": "Active" | "Inactive"
			"@cwd": string
			"@command": string
			"#cdata"?: string
		}> = []

		let busyTerminals: any[] = []
		let inactiveTerminals: any[] = []

		try {
			busyTerminals = [
				...TerminalRegistry.getTerminals(true, cline.taskId),
				...TerminalRegistry.getBackgroundTerminals(true),
			]
			inactiveTerminals = [
				...TerminalRegistry.getTerminals(false, cline.taskId),
				...TerminalRegistry.getBackgroundTerminals(false),
			]
		} catch (error) {
			console.warn('Failed to retrieve terminals:', error)
			return undefined
		}

		// Wait for terminals to cool down if needed
		if (busyTerminals.length > 0 && cline.didEditFile) {
			try {
				await delay(300) // Delay after saving file to let terminals catch up
				await pWaitFor(() => busyTerminals.every((t) => !TerminalRegistry.isProcessHot(t.id)), {
					interval: 100,
					timeout: 5_000,
				}).catch(() => {})
			} catch (error) {
				console.warn('Failed to wait for terminals to cool down:', error)
			}
		}
		cline.didEditFile = false

		// Process active terminals
		busyTerminals.forEach((terminal) => {
			try {
				const cwd = terminal.getCurrentWorkingDirectory() || cline.cwd
				const command = terminal.getLastCommand() || ''
				let output = ''

				try {
					output = TerminalRegistry.getUnretrievedOutput(terminal.id)
				} catch (error) {
					console.warn(`Failed to get output for terminal ${terminal.id}:`, error)
				}

				const terminalData: any = {
					"@id": terminal.id.toString(),
					"@status": "Active",
					"@cwd": cwd,
					"@command": command,
				}

				if (output) {
					try {
						terminalData["#cdata"] = Terminal.compressTerminalOutput(output, terminalOutputLineLimit)
					} catch (error) {
						console.warn(`Failed to compress terminal output for ${terminal.id}:`, error)
					}
				}

				terminalsData.push(terminalData)
			} catch (error) {
				console.warn(`Failed to process active terminal ${terminal.id}:`, error)
			}
		})

		// Process inactive terminals with output
		inactiveTerminals
			.filter((t) => {
				try {
					return t.getProcessesWithOutput().length > 0
				} catch (error) {
					console.warn(`Failed to check processes for terminal ${t.id}:`, error)
					return false
				}
			})
			.forEach((terminal) => {
				try {
					const cwd = terminal.getCurrentWorkingDirectory() || cline.cwd
					let processes: any[] = []

					try {
						processes = terminal.getProcessesWithOutput()
					} catch (error) {
						console.warn(`Failed to get processes for terminal ${terminal.id}:`, error)
						return
					}

					processes.forEach((process) => {
						try {
							const output = process.getUnretrievedOutput()

							if (output) {
								const terminalData: any = {
									"@id": terminal.id.toString(),
									"@status": "Inactive",
									"@cwd": cwd,
									"@command": process.command || '',
								}

								try {
									terminalData["#cdata"] = Terminal.compressTerminalOutput(output, terminalOutputLineLimit)
								} catch (error) {
									console.warn(`Failed to compress output for process in terminal ${terminal.id}:`, error)
								}

								terminalsData.push(terminalData)
							}
						} catch (error) {
							console.warn(`Failed to process inactive terminal process:`, error)
						}
					})

					try {
						terminal.cleanCompletedProcessQueue()
					} catch (error) {
						console.warn(`Failed to clean process queue for terminal ${terminal.id}:`, error)
					}
				} catch (error) {
					console.warn(`Failed to process inactive terminal ${terminal.id}:`, error)
				}
			})

		return terminalsData.length > 0 ? { terminal: terminalsData } : undefined
	} catch (error) {
		console.warn('Failed to get terminal context:', error)
		return undefined
	}
}
