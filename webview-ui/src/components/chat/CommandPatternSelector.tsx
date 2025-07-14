import { useState } from "react"
import { ChevronDown, Check, X } from "lucide-react"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { cn } from "@src/lib/utils"

interface CommandPattern {
	pattern: string
	description: string
}

interface CommandPatternSelectorProps {
	patterns: CommandPattern[]
	allowedCommands: string[]
	deniedCommands: string[]
	onAllowPatternChange: (pattern: string) => void
	onDenyPatternChange: (pattern: string) => void
}

export const CommandPatternSelector = ({
	patterns,
	allowedCommands,
	deniedCommands,
	onAllowPatternChange,
	onDenyPatternChange,
}: CommandPatternSelectorProps) => {
	const { t } = useAppTranslation()
	const [isExpanded, setIsExpanded] = useState(false)

	if (patterns.length === 0) {
		return null
	}

	const getPatternStatus = (pattern: string): "allowed" | "denied" | "none" => {
		if (allowedCommands.includes(pattern)) return "allowed"
		if (deniedCommands.includes(pattern)) return "denied"
		return "none"
	}

	const handleAllowClick = (pattern: string) => {
		// The handler in CommandExecution will take care of mutual exclusivity
		onAllowPatternChange(pattern)
	}

	const handleDenyClick = (pattern: string) => {
		// The handler in CommandExecution will take care of mutual exclusivity
		onDenyPatternChange(pattern)
	}

	return (
		<div className="border-t border-vscode-panel-border bg-vscode-sideBar-background/30">
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex items-center gap-2 w-full px-3 py-2 text-xs text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground transition-all"
				aria-label={isExpanded ? "Collapse command management section" : "Expand command management section"}
				aria-expanded={isExpanded}>
				<ChevronDown
					className={cn("size-3 transition-transform duration-200", {
						"rotate-0": isExpanded,
						"-rotate-90": !isExpanded,
					})}
				/>
				<span className="font-medium">{t("chat:commandExecution.manageCommands")}</span>
			</button>
			{isExpanded && (
				<div className="px-3 pb-3 space-y-2">
					<div className="text-xs text-vscode-descriptionForeground mb-2 ml-5">
						{t("chat:commandExecution.commandManagementDescription")}
					</div>
					{patterns.map((item, index) => {
						const status = getPatternStatus(item.pattern)
						return (
							<div key={`${item.pattern}-${index}`} className="ml-5 flex items-center gap-2">
								<div className="flex-1">
									<span className="font-mono text-xs text-vscode-foreground">{item.pattern}</span>
									{item.description && (
										<span className="text-xs text-vscode-descriptionForeground ml-2">
											- {item.description}
										</span>
									)}
								</div>
								<div className="flex items-center gap-1">
									<button
										onClick={() => handleAllowClick(item.pattern)}
										className={cn(
											"p-1 rounded transition-all",
											status === "allowed"
												? "bg-green-500/20 text-green-500 hover:bg-green-500/30"
												: "text-vscode-descriptionForeground hover:text-green-500 hover:bg-green-500/10",
										)}
										aria-label={
											status === "allowed"
												? `Remove ${item.pattern} from allowed list`
												: `Add ${item.pattern} to allowed list`
										}
										title={status === "allowed" ? "Remove from allowed" : "Add to allowed"}>
										<Check className="size-3.5" />
									</button>
									<button
										onClick={() => handleDenyClick(item.pattern)}
										className={cn(
											"p-1 rounded transition-all",
											status === "denied"
												? "bg-red-500/20 text-red-500 hover:bg-red-500/30"
												: "text-vscode-descriptionForeground hover:text-red-500 hover:bg-red-500/10",
										)}
										aria-label={
											status === "denied"
												? `Remove ${item.pattern} from denied list`
												: `Add ${item.pattern} to denied list`
										}
										title={status === "denied" ? "Remove from denied" : "Add to denied"}>
										<X className="size-3.5" />
									</button>
								</div>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}

CommandPatternSelector.displayName = "CommandPatternSelector"
