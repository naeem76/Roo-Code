import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { Gemini } from "../Gemini"
import type { ProviderSettings } from "@roo-code/types"
import { geminiModels, geminiDefaultModelId, type GeminiModelId } from "@roo-code/types"

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeTextField: ({ children, value, onInput, type }: any) => (
		<div>
			{children}
			<input type={type} value={value} onChange={(e) => onInput(e)} />
		</div>
	),
}))

vi.mock("vscrui", () => ({
	Checkbox: ({ children, checked, onChange }: any) => (
		<label data-testid="checkbox-custom-context-limit">
			<input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
			{children}
		</label>
	),
}))

vi.mock("@src/components/ui", () => ({
	Slider: ({ min, max, step, value, onValueChange }: any) => (
		<input
			data-testid="slider"
			type="range"
			min={min}
			max={max}
			step={step}
			value={value[0]}
			onChange={(e) => onValueChange([Number(e.target.value)])}
		/>
	),
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@src/components/common/VSCodeButtonLink", () => ({
	VSCodeButtonLink: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

const defaultModelId: GeminiModelId = geminiDefaultModelId
const defaultContextWindow = geminiModels[defaultModelId].contextWindow

describe("Gemini provider settings", () => {
	it("does not render context limit slider when custom context limit is not enabled", () => {
		const setApiField = vi.fn()
		const config: ProviderSettings = {}
		render(
			<Gemini apiConfiguration={config} setApiConfigurationField={setApiField} currentModelId={defaultModelId} />,
		)
		expect(screen.queryByTestId("slider")).toBeNull()
	})

	it("enables custom context limit on checkbox toggle and shows slider with default value", () => {
		const setApiField = vi.fn()
		const config: ProviderSettings = {}
		render(
			<Gemini apiConfiguration={config} setApiConfigurationField={setApiField} currentModelId={defaultModelId} />,
		)
		const checkbox = screen.getByTestId("checkbox-custom-context-limit")
		fireEvent.click(checkbox)
		expect(setApiField).toHaveBeenCalledWith("contextLimit", defaultContextWindow)
		const slider = screen.getByTestId("slider")
		expect(slider).toHaveValue(defaultContextWindow.toString())
	})

	it("renders slider when contextLimit already set and updates on slider change", () => {
		const setApiField = vi.fn()
		const initialLimit = 100000
		const config: ProviderSettings = { contextLimit: initialLimit }
		render(
			<Gemini apiConfiguration={config} setApiConfigurationField={setApiField} currentModelId={defaultModelId} />,
		)
		const slider = screen.getByTestId("slider")
		expect(slider).toHaveValue(initialLimit.toString())
		fireEvent.change(slider, { target: { value: "50000" } })
		expect(setApiField).toHaveBeenCalledWith("contextLimit", 50000)
	})
})
