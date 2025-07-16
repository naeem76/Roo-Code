import { HTMLAttributes, useState, useEffect } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

type RulesSettingsProps = HTMLAttributes<HTMLDivElement>

export const RulesSettings = ({ className, ...props }: RulesSettingsProps) => {
	const { t } = useAppTranslation()
	const [isGenerating, setIsGenerating] = useState(false)
	const [generationStatus, setGenerationStatus] = useState<{
		type: "success" | "error" | null
		message: string
	}>({ type: null, message: "" })

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "rulesGenerationStatus") {
				setIsGenerating(false)
				if (message.success) {
					setGenerationStatus({
						type: "success",
						message: message.text || "",
					})
				} else {
					setGenerationStatus({
						type: "error",
						message: message.error || "Unknown error occurred",
					})
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const handleGenerateRules = () => {
		setIsGenerating(true)
		setGenerationStatus({ type: null, message: "" })

		// Send message to extension to generate rules
		vscode.postMessage({
			type: "generateRules",
		})
	}

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<FileText className="w-4" />
					<div>{t("settings:rules.title")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div className="space-y-4">
					<p className="text-vscode-descriptionForeground text-sm">{t("settings:rules.description")}</p>

					<div className="flex flex-col gap-3">
						<Button
							onClick={handleGenerateRules}
							disabled={isGenerating}
							variant="default"
							size="default"
							className="w-fit"
							title={t("settings:rules.generateButtonTooltip")}>
							{isGenerating ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{t("settings:rules.generating")}
								</>
							) : (
								t("settings:rules.generateButton")
							)}
						</Button>

						{isGenerating && (
							<p className="text-vscode-descriptionForeground text-sm">
								{t("settings:rules.generatingDescription")}
							</p>
						)}

						{generationStatus.type === "success" && (
							<div className="text-vscode-testing-iconPassed text-sm">
								<p>{t("settings:rules.success")}</p>
								<p className="text-vscode-descriptionForeground">
									{t("settings:rules.successDescription", { path: generationStatus.message })}
								</p>
							</div>
						)}

						{generationStatus.type === "error" && (
							<div className="text-vscode-testing-iconFailed text-sm">
								<p>{t("settings:rules.error")}</p>
								<p className="text-vscode-descriptionForeground">
									{t("settings:rules.errorDescription", { error: generationStatus.message })}
								</p>
							</div>
						)}
					</div>
				</div>
			</Section>
		</div>
	)
}
