import { useCallback, useState, useMemo } from "react"
import { useEvent } from "react-use"
import { ChevronDown, Skull } from "lucide-react"

import { CommandExecutionStatus, commandExecutionStatusSchema } from "@roo-code/types"

import { ExtensionMessage } from "@roo/ExtensionMessage"
import { safeJsonParse } from "@roo/safeJsonParse"

import { vscode } from "@src/utils/vscode"
import { parseCommandAndOutput } from "@src/utils/commandParsing"
import { extractCommandPattern, getPatternDescription } from "@src/utils/commandPatterns"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { cn } from "@src/lib/utils"
import { Button } from "@src/components/ui"
import CodeBlock from "../common/CodeBlock"
import { CommandPatternSelector } from "./CommandPatternSelector"

interface CommandExecutionProps {
	executionId: string
	text?: string
	icon?: JSX.Element | null
	title?: JSX.Element | null
}

export const CommandExecution = ({ executionId, text, icon, title }: CommandExecutionProps) => {
	const { t } = useAppTranslation()
	const {
		terminalShellIntegrationDisabled = false,
		allowedCommands = [],
		deniedCommands = [],
		setAllowedCommands,
		setDeniedCommands,
	} = useExtensionState()

	const { command, output: parsedOutput, suggestions } = useMemo(() => parseCommandAndOutput(text), [text])

	// If we aren't opening the VSCode terminal for this command then we default
	// to expanding the command execution output.
	const [_isExpanded, setIsExpanded] = useState(terminalShellIntegrationDisabled)
	const [streamingOutput, setStreamingOutput] = useState("")
	const [status, setStatus] = useState<CommandExecutionStatus | null>(null)
	// Separate state for output expansion - default to closed
	const [isOutputExpanded, setIsOutputExpanded] = useState(false)

	// Determine if we should show suggestions section
	const showSuggestions = suggestions && suggestions.length > 0

	// Use suggestions if available, otherwise extract command patterns
	const commandPatterns = useMemo(() => {
		// If we have suggestions from the text, use those
		if (suggestions && suggestions.length > 0) {
			return suggestions.map((pattern: string) => ({
				pattern,
				description: getPatternDescription(pattern),
			}))
		}

		// Only extract patterns if we're showing suggestions (for backward compatibility)
		if (!showSuggestions || !command?.trim()) return []

		// Check if this is a chained command
		const operators = ["&&", "||", ";", "|"]
		const patterns: Array<{ pattern: string; description: string }> = []

		// Split by operators while respecting quotes
		let inSingleQuote = false
		let inDoubleQuote = false
		let escapeNext = false
		let currentCommand = ""
		let i = 0

		while (i < command.length) {
			const char = command[i]

			if (escapeNext) {
				currentCommand += char
				escapeNext = false
				i++
				continue
			}

			if (char === "\\") {
				escapeNext = true
				currentCommand += char
				i++
				continue
			}

			if (char === "'" && !inDoubleQuote) {
				inSingleQuote = !inSingleQuote
				currentCommand += char
				i++
				continue
			}

			if (char === '"' && !inSingleQuote) {
				inDoubleQuote = !inDoubleQuote
				currentCommand += char
				i++
				continue
			}

			// Check for operators outside quotes
			if (!inSingleQuote && !inDoubleQuote) {
				let foundOperator = false
				for (const op of operators) {
					if (command.substring(i, i + op.length) === op) {
						// Found an operator, process the current command
						const trimmedCommand = currentCommand.trim()
						if (trimmedCommand) {
							// Extract pattern for the command
							const pattern = extractCommandPattern(trimmedCommand)
							if (pattern) {
								patterns.push({
									pattern,
									description: getPatternDescription(pattern),
								})
							}
						}
						currentCommand = ""
						i += op.length
						foundOperator = true
						break
					}
				}
				if (foundOperator) continue
			}

			currentCommand += char
			i++
		}

		// Process the last command
		const trimmedCommand = currentCommand.trim()
		if (trimmedCommand) {
			// Extract pattern for the command
			const pattern = extractCommandPattern(trimmedCommand)
			if (pattern) {
				patterns.push({
					pattern,
					description: getPatternDescription(pattern),
				})
			}
		}

		// Remove duplicates
		const uniquePatterns = patterns.filter(
			(item, index, self) => index === self.findIndex((p) => p.pattern === item.pattern),
		)

		return uniquePatterns
	}, [command, suggestions, showSuggestions])

	// The command's output can either come from the text associated with the
	// task message (this is the case for completed commands) or from the
	// streaming output (this is the case for running commands).
	const output = streamingOutput || parsedOutput

	const onMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type === "commandExecutionStatus") {
				const result = commandExecutionStatusSchema.safeParse(safeJsonParse(message.text, {}))

				if (result.success) {
					const data = result.data

					if (data.executionId !== executionId) {
						return
					}

					switch (data.status) {
						case "started":
							setStatus(data)
							break
						case "output":
							setStreamingOutput(data.output)
							break
						case "fallback":
							setIsExpanded(true)
							break
						default:
							setStatus(data)
							break
					}
				}
			}
		},
		[executionId],
	)

	useEvent("message", onMessage)

	const handleAllowPatternChange = useCallback(
		(pattern: string) => {
			if (!pattern) return

			const isWhitelisted = allowedCommands.includes(pattern)

			if (isWhitelisted) {
				// Remove from whitelist
				const updatedAllowedCommands = allowedCommands.filter((p) => p !== pattern)
				setAllowedCommands(updatedAllowedCommands)
				vscode.postMessage({
					type: "allowedCommands",
					commands: updatedAllowedCommands,
				})
			} else {
				// Add to whitelist
				const updatedAllowedCommands = [...allowedCommands, pattern]
				setAllowedCommands(updatedAllowedCommands)
				vscode.postMessage({
					type: "allowedCommands",
					commands: updatedAllowedCommands,
				})

				// If it's in the denied list, remove it
				if (deniedCommands.includes(pattern)) {
					const updatedDeniedCommands = deniedCommands.filter((p) => p !== pattern)
					setDeniedCommands(updatedDeniedCommands)
					vscode.postMessage({
						type: "deniedCommands",
						commands: updatedDeniedCommands,
					})
				}
			}
		},
		[allowedCommands, deniedCommands, setAllowedCommands, setDeniedCommands],
	)

	const handleDenyPatternChange = useCallback(
		(pattern: string) => {
			if (!pattern) return

			const isDenied = deniedCommands.includes(pattern)

			if (isDenied) {
				// Remove from deny list
				const updatedDeniedCommands = deniedCommands.filter((p) => p !== pattern)
				setDeniedCommands(updatedDeniedCommands)
				vscode.postMessage({
					type: "deniedCommands",
					commands: updatedDeniedCommands,
				})
			} else {
				// Add to deny list
				const updatedDeniedCommands = [...deniedCommands, pattern]
				setDeniedCommands(updatedDeniedCommands)
				vscode.postMessage({
					type: "deniedCommands",
					commands: updatedDeniedCommands,
				})

				// If it's in the allowed list, remove it
				if (allowedCommands.includes(pattern)) {
					const updatedAllowedCommands = allowedCommands.filter((p) => p !== pattern)
					setAllowedCommands(updatedAllowedCommands)
					vscode.postMessage({
						type: "allowedCommands",
						commands: updatedAllowedCommands,
					})
				}
			}
		},
		[deniedCommands, allowedCommands, setDeniedCommands, setAllowedCommands],
	)

	return (
		<div className="w-full">
			{/* Header section */}
			<div className="flex flex-row items-center justify-between gap-2 px-3 py-2 bg-vscode-editor-background border border-vscode-border rounded-t-md">
				<div className="flex flex-row items-center gap-2 flex-1">
					{icon}
					{title}

					{/* Status display in the middle */}
					{status?.status === "started" && (
						<div className="flex flex-row items-center gap-2 font-mono text-xs ml-auto">
							<div className="rounded-full size-1.5 bg-lime-400" />
							<div className="whitespace-nowrap">{t("chat:commandExecution.running")}</div>
							{status.pid && (
								<span className="text-vscode-descriptionForeground/70">
									{t("chat:commandExecution.pid", { pid: status.pid })}
								</span>
							)}
							<Button
								variant="ghost"
								size="icon"
								className="hover:bg-vscode-toolbar-hoverBackground"
								onClick={() =>
									vscode.postMessage({ type: "terminalOperation", terminalOperation: "abort" })
								}
								aria-label="Abort command execution">
								<Skull className="size-3.5" />
							</Button>
						</div>
					)}
					{status?.status === "exited" && (
						<div className="flex flex-row items-center gap-2 font-mono text-xs ml-auto">
							<div
								className={cn(
									"rounded-full size-1.5",
									status.exitCode === 0 ? "bg-lime-400" : "bg-red-400",
								)}
							/>
							<div className="whitespace-nowrap">
								{t("chat:commandExecution.exited", { exitCode: status.exitCode })}
							</div>
						</div>
					)}
				</div>

				{/* Output toggle chevron on the right */}
				{output.length > 0 && (
					<Button
						variant="ghost"
						size="icon"
						className="hover:bg-vscode-toolbar-hoverBackground p-0.5"
						onClick={() => setIsOutputExpanded(!isOutputExpanded)}
						aria-label={isOutputExpanded ? "Collapse output" : "Expand output"}
						aria-expanded={isOutputExpanded}>
						<ChevronDown
							className={cn("size-3.5 transition-transform duration-200", {
								"-rotate-90": !isOutputExpanded,
								"rotate-0": isOutputExpanded,
							})}
						/>
					</Button>
				)}
			</div>

			{/* Command execution box */}
			<div className="bg-vscode-editor-background border-x border-b border-vscode-border rounded-b-md">
				{/* Command display */}
				<div className="p-3">
					<CodeBlock source={command} language="shell" />
				</div>

				{/* Command management section */}
				{showSuggestions && (
					<CommandPatternSelector
						patterns={commandPatterns}
						allowedCommands={allowedCommands}
						deniedCommands={deniedCommands}
						onAllowPatternChange={handleAllowPatternChange}
						onDenyPatternChange={handleDenyPatternChange}
					/>
				)}

				{/* Output section */}
				{output.length > 0 && (
					<div
						className={cn("border-t border-vscode-panel-border", {
							hidden: !isOutputExpanded,
						})}>
						<div className="p-3">
							<CodeBlock source={output} language="log" />
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

CommandExecution.displayName = "CommandExecution"
