import { useCallback, useState, useMemo } from "react"
import { useEvent } from "react-use"
import { ChevronDown, Skull } from "lucide-react"

import { CommandExecutionStatus, commandExecutionStatusSchema } from "@roo-code/types"

import { ExtensionMessage } from "@roo/ExtensionMessage"
import { safeJsonParse } from "@roo/safeJsonParse"

import { vscode } from "@src/utils/vscode"
import { parseCommandAndOutput } from "@src/utils/commandParsing"
import { extractCommandPatterns, getPatternDescription } from "@src/utils/commandPatterns"
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
	const { allowedCommands = [], deniedCommands = [], setAllowedCommands, setDeniedCommands } = useExtensionState()

	const { command, output: parsedOutput, suggestions } = useMemo(() => parseCommandAndOutput(text), [text])

	// Note: isExpanded state removed as it was unused. The setIsExpanded in fallback case
	// now directly sets isOutputExpanded instead.
	const [streamingOutput, setStreamingOutput] = useState("")
	const [status, setStatus] = useState<CommandExecutionStatus | null>(null)
	// Separate state for output expansion - default to closed
	const [isOutputExpanded, setIsOutputExpanded] = useState(false)

	// Determine if we should show suggestions section
	// Always show suggestions if we have a command, either from LLM or programmatic generation
	const showSuggestions = (suggestions && suggestions.length > 0) || !!command?.trim()

	// Use suggestions if available, otherwise extract command patterns
	const commandPatterns = useMemo(() => {
		// If we have suggestions from the text, use those
		if (suggestions && suggestions.length > 0) {
			return suggestions.map((pattern: string) => ({
				pattern,
				description: getPatternDescription(pattern),
			}))
		}

		// If no LLM suggestions but we have a command, extract patterns programmatically
		if (!command?.trim()) return []

		// Use the new extractCommandPatterns function which handles all parsing
		const extractedPatterns = extractCommandPatterns(command)

		// Convert to the expected format with descriptions
		return extractedPatterns.map((pattern) => ({
			pattern,
			description: getPatternDescription(pattern),
		}))
	}, [command, suggestions])

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
							setIsOutputExpanded(true)
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

			const isAllowed = allowedCommands.includes(pattern)

			if (isAllowed) {
				// Remove from allowed list
				const updatedAllowedCommands = allowedCommands.filter((p) => p !== pattern)
				setAllowedCommands(updatedAllowedCommands)
				vscode.postMessage({
					type: "allowedCommands",
					commands: updatedAllowedCommands,
				})
			} else {
				// Add to allowed list
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
								aria-label={t("chat:commandExecution.abortCommand")}>
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
						aria-label={
							isOutputExpanded
								? t("chat:commandExecution.collapseOutput")
								: t("chat:commandExecution.expandOutput")
						}
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
