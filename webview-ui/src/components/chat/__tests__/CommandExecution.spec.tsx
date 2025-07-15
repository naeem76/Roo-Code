// npx vitest run src/components/chat/__tests__/CommandExecution.spec.tsx

import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi } from "vitest"
import { CommandExecution } from "../CommandExecution"
import { TooltipProvider } from "@/components/ui/tooltip"

// Mock the vscode module
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock react-i18next
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			// Return the actual translated text for the test
			const translations: Record<string, string> = {
				"chat:commandExecution.manageCommands": "Manage Command Permissions",
				"chat:commandExecution.addToAllowed": "Add to allowed list",
				"chat:commandExecution.removeFromAllowed": "Remove from allowed list",
				"chat:commandExecution.addToDenied": "Add to denied list",
				"chat:commandExecution.removeFromDenied": "Remove from denied list",
			}
			return translations[key] || key
		},
	}),
	Trans: ({ i18nKey, _components }: any) => {
		// For the test, just return the key text without the link
		if (i18nKey === "chat:commandExecution.commandManagementDescription") {
			return "Manage command permissions: Click ✓ to allow auto-execution, ✗ to deny execution. Patterns can be toggled on/off or removed from lists. View all settings"
		}
		return i18nKey
	},
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
}))

// Mock TranslationContext
vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			// Return the actual translated text for the test
			const translations: Record<string, string> = {
				"chat:commandExecution.manageCommands": "Manage Command Permissions",
				"chat:commandExecution.addToAllowed": "Add to allowed list",
				"chat:commandExecution.removeFromAllowed": "Remove from allowed list",
				"chat:commandExecution.addToDenied": "Add to denied list",
				"chat:commandExecution.removeFromDenied": "Remove from denied list",
			}
			return translations[key] || key
		},
	}),
}))

// Mock ExtensionStateContext
vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: vi.fn(() => ({
		allowedCommands: [],
		deniedCommands: [],
		setAllowedCommands: vi.fn(),
		setDeniedCommands: vi.fn(),
	})),
}))

// Get the mocked vscode after mocks are set up
import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"
const mockPostMessage = vi.mocked(vscode.postMessage)
const mockUseExtensionState = vi.mocked(useExtensionState)

// Helper function to render with providers
const renderWithProviders = (ui: React.ReactElement) => {
	return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>)
}

describe("CommandExecution", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Reset the mock to default state
		mockUseExtensionState.mockReturnValue({
			allowedCommands: [],
			deniedCommands: [],
			setAllowedCommands: vi.fn(),
			setDeniedCommands: vi.fn(),
		} as any)
	})

	it("should render command with programmatic suggestions when no LLM suggestions provided", () => {
		renderWithProviders(
			<CommandExecution
				executionId="test-1"
				text="npm install"
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		// Check command is rendered in code block
		const codeBlocks = screen.getAllByText("npm install")
		expect(codeBlocks.length).toBeGreaterThan(0)

		// Should show manage permissions section even without LLM suggestions
		expect(screen.getByText("Manage Command Permissions")).toBeInTheDocument()

		// Expand the section to verify programmatic patterns
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		// Should show programmatically extracted pattern
		const patterns = screen.getAllByText("npm install")
		expect(patterns.length).toBeGreaterThan(1) // Command + pattern
	})

	it("should render command with suggestions section collapsed by default", () => {
		const commandWithSuggestions =
			'npm install<suggestions>["npm install --save", "npm install --save-dev", "npm install --global"]</suggestions>'

		renderWithProviders(
			<CommandExecution
				executionId="test-2"
				text={commandWithSuggestions}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		expect(screen.getByText("npm install")).toBeInTheDocument()
		expect(screen.getByText("Manage Command Permissions")).toBeInTheDocument()

		// Suggestions should not be visible initially (collapsed)
		expect(screen.queryByDisplayValue("npm install --save")).not.toBeInTheDocument()
		expect(screen.queryByDisplayValue("npm install --save-dev")).not.toBeInTheDocument()
		expect(screen.queryByDisplayValue("npm install --global")).not.toBeInTheDocument()
	})

	it("should expand and show command patterns with action buttons when section header is clicked", () => {
		const commandWithSuggestions =
			'npm install<suggestions>["npm install --save", "npm install --save-dev", "npm install --global"]</suggestions>'

		renderWithProviders(
			<CommandExecution
				executionId="test-2"
				text={commandWithSuggestions}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		// Click to expand the section
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		// Now suggestions should be visible
		expect(screen.getByText("npm install --save")).toBeInTheDocument()
		expect(screen.getByText("npm install --save-dev")).toBeInTheDocument()
		expect(screen.getByText("npm install --global")).toBeInTheDocument()

		// Should have action buttons (2 per pattern - allow and deny)
		const buttons = screen.getAllByRole("button")
		// Filter out the section header button
		const actionButtons = buttons.filter(
			(btn) =>
				btn.getAttribute("aria-label")?.includes("to allowed list") ||
				btn.getAttribute("aria-label")?.includes("to denied list"),
		)
		expect(actionButtons).toHaveLength(6) // 3 patterns × 2 buttons each
	})

	it("should handle clicking allow button to add to whitelist", async () => {
		const commandWithSuggestions =
			'git commit<suggestions>["git commit -m \\"Initial commit\\"", "git commit --amend"]</suggestions>'

		renderWithProviders(
			<CommandExecution
				executionId="test-3"
				text={commandWithSuggestions}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		// Expand the section first
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		// Find and click the allow button for the first suggestion
		const allowButtons = screen.getAllByLabelText("Add to allowed list")
		fireEvent.click(allowButtons[0]) // Click the first one

		await waitFor(() => {
			expect(mockPostMessage).toHaveBeenCalledWith({
				type: "allowedCommands",
				commands: expect.arrayContaining(['git commit -m "Initial commit"']),
			})
		})
	})

	it("should handle clicking allow button to remove from whitelist", async () => {
		// Clear any previous calls
		vi.clearAllMocks()

		// Mock that the command is already whitelisted
		mockUseExtensionState.mockReturnValue({
			allowedCommands: ['git commit -m "Initial commit"', "git commit --amend"],
			deniedCommands: [],
			setAllowedCommands: vi.fn(),
			setDeniedCommands: vi.fn(),
		} as any)

		const commandWithSuggestions =
			'git commit<suggestions>["git commit -m \\"Initial commit\\"", "git commit --amend"]</suggestions>'

		renderWithProviders(
			<CommandExecution
				executionId="test-3"
				text={commandWithSuggestions}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		// Expand the section first
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		// Find and click the allow button for the first suggestion (which should remove it since it's already allowed)
		const removeButtons = screen.getAllByLabelText("Remove from allowed list")
		fireEvent.click(removeButtons[0]) // Click the first one

		await waitFor(() => {
			expect(mockPostMessage).toHaveBeenCalledWith({
				type: "allowedCommands",
				commands: ["git commit --amend"], // Should remove the clicked one
			})
		})
	})

	it("should handle empty suggestions tag and show programmatic patterns", () => {
		const commandWithEmptySuggestions = "ls -la<suggestions>[]</suggestions>"

		renderWithProviders(
			<CommandExecution
				executionId="test-4"
				text={commandWithEmptySuggestions}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		// Check command is rendered
		const codeBlocks = screen.getAllByText("ls -la")
		expect(codeBlocks.length).toBeGreaterThan(0)

		// Should still show manage permissions with programmatic patterns
		expect(screen.getByText("Manage Command Permissions")).toBeInTheDocument()

		// Expand the section to verify programmatic patterns
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		// Should show the base command pattern
		expect(screen.getByText("ls")).toBeInTheDocument()
	})

	it("should handle suggestions with special characters", () => {
		const commandWithSuggestions =
			'echo "test"<suggestions>["echo \\"Hello, World!\\"", "echo $HOME", "echo `date`"]</suggestions>'

		renderWithProviders(
			<CommandExecution
				executionId="test-5"
				text={commandWithSuggestions}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		expect(screen.getByText('echo "test"')).toBeInTheDocument()

		// Expand the section to see suggestions
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		expect(screen.getByText('echo "Hello, World!"')).toBeInTheDocument()
		expect(screen.getByText("echo $HOME")).toBeInTheDocument()
		expect(screen.getByText("echo `date`")).toBeInTheDocument()
	})

	it("should handle malformed suggestions tag and show programmatic patterns", () => {
		const commandWithMalformedSuggestions = "pwd<suggestions>not-valid-json</suggestions>"

		renderWithProviders(
			<CommandExecution
				executionId="test-6"
				text={commandWithMalformedSuggestions}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		// Should still render the command
		const codeBlocks = screen.getAllByText("pwd")
		expect(codeBlocks.length).toBeGreaterThan(0)

		// Should show manage permissions with programmatic patterns
		expect(screen.getByText("Manage Command Permissions")).toBeInTheDocument()

		// Expand the section to verify programmatic patterns
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		// Should show the base command pattern (there will be multiple pwd elements)
		const patterns = screen.getAllByText("pwd")
		expect(patterns.length).toBeGreaterThan(1) // Command + pattern
	})

	it("should parse suggestions from JSON array and show them when expanded", () => {
		const commandWithSuggestions =
			'docker run<suggestions>["docker run -it ubuntu:latest", "docker run -d nginx", "docker run --rm alpine"]</suggestions>'

		renderWithProviders(
			<CommandExecution
				executionId="test-7"
				text={commandWithSuggestions}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		expect(screen.getByText("docker run")).toBeInTheDocument()

		// Expand the section
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		expect(screen.getByText("docker run -it ubuntu:latest")).toBeInTheDocument()
		expect(screen.getByText("docker run -d nginx")).toBeInTheDocument()
		expect(screen.getByText("docker run --rm alpine")).toBeInTheDocument()
	})

	it("should handle individual <suggest> tags", () => {
		const commandWithIndividualSuggests = "npm run start<suggest>npm run</suggest><suggest>npm start</suggest>"

		renderWithProviders(
			<CommandExecution
				executionId="test-8"
				text={commandWithIndividualSuggests}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		expect(screen.getByText("npm run start")).toBeInTheDocument()

		// Expand the section
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		expect(screen.getByText("npm run")).toBeInTheDocument()
		expect(screen.getByText("npm start")).toBeInTheDocument()
	})

	it("should handle clicking allow button for individual suggest tag suggestions", async () => {
		const commandWithIndividualSuggests =
			"git status<suggest>git status --short</suggest><suggest>git status -b</suggest>"

		renderWithProviders(
			<CommandExecution
				executionId="test-9"
				text={commandWithIndividualSuggests}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		// Expand the section
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		// Find and click the allow button for the first suggestion
		const allowButtons = screen.getAllByLabelText("Add to allowed list")
		fireEvent.click(allowButtons[0]) // Click the first one

		await waitFor(() => {
			expect(mockPostMessage).toHaveBeenCalledWith({
				type: "allowedCommands",
				commands: expect.arrayContaining(["git status --short"]),
			})
		})
	})

	it("should handle mixed XML content with individual suggest tags", () => {
		const commandWithMixedContent =
			"npm install<suggest>npm install --save</suggest><suggest>npm install --save-dev</suggest>"

		renderWithProviders(
			<CommandExecution
				executionId="test-10"
				text={commandWithMixedContent}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		// Should clean up the command text and show only the command
		expect(screen.getByText("npm install")).toBeInTheDocument()

		// Expand the section
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		expect(screen.getByText("npm install --save")).toBeInTheDocument()
		expect(screen.getByText("npm install --save-dev")).toBeInTheDocument()
	})

	it("should handle empty individual suggest tags", () => {
		const commandWithEmptyIndividualSuggests = "ls -la<suggest></suggest><suggest>ls -la --color</suggest>"

		renderWithProviders(
			<CommandExecution
				executionId="test-11"
				text={commandWithEmptyIndividualSuggests}
				icon={<span>icon</span>}
				title={<span>Run Command</span>}
			/>,
		)

		expect(screen.getByText("ls -la")).toBeInTheDocument()

		// Expand the section
		const sectionHeader = screen.getByText("Manage Command Permissions")
		fireEvent.click(sectionHeader)

		// Should only show the non-empty suggestion
		expect(screen.getByText("ls -la --color")).toBeInTheDocument()
		// Should have exactly 2 action buttons (allow and deny for the non-empty suggestion)
		const buttons = screen.getAllByRole("button")
		const actionButtons = buttons.filter(
			(btn) =>
				btn.getAttribute("aria-label")?.includes("to allowed list") ||
				btn.getAttribute("aria-label")?.includes("to denied list"),
		)
		expect(actionButtons).toHaveLength(2)
	})
})
