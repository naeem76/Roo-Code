import { describe, it, expect, vi, beforeEach } from "vitest"
import * as vscode from "vscode"
import { ClineProvider } from "../ClineProvider"
import { ContextProxy } from "../../config/ContextProxy"
import { TelemetryService } from "@roo-code/telemetry"
import { Package } from "../../../shared/package"

// Mock vscode
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn(),
		}),
		onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		onDidSaveTextDocument: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		onDidChangeTextDocument: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		onDidOpenTextDocument: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		onDidCloseTextDocument: vi.fn().mockReturnValue({ dispose: vi.fn() }),
	},
	window: {
		showErrorMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		createTextEditorDecorationType: vi.fn().mockReturnValue({
			dispose: vi.fn(),
		}),
	},
	Uri: {
		file: vi.fn((path) => ({ fsPath: path })),
		joinPath: vi.fn(),
	},
	env: {
		uriScheme: "vscode",
		language: "en",
		appName: "Visual Studio Code",
		machineId: "test-machine-id",
	},
	ExtensionMode: {
		Production: 1,
		Development: 2,
		Test: 3,
	},
	version: "1.85.0",
	commands: {
		executeCommand: vi.fn(),
	},
}))

// Mock other dependencies
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		hasInstance: vi.fn().mockReturnValue(true),
		createInstance: vi.fn(),
		instance: {
			setProvider: vi.fn(),
		},
	},
	BaseTelemetryClient: vi.fn(),
}))

vi.mock("../../../shared/package", () => ({
	Package: {
		name: "roo-code",
		version: "1.0.0",
	},
}))

vi.mock("../../../integrations/workspace/WorkspaceTracker", () => ({
	default: vi.fn().mockImplementation(() => ({
		initializeFilePaths: vi.fn(),
		dispose: vi.fn(),
	})),
}))

vi.mock("../../config/ProviderSettingsManager", () => ({
	ProviderSettingsManager: vi.fn().mockImplementation(() => ({
		getModeConfigId: vi.fn(),
		listConfig: vi.fn().mockResolvedValue([]),
		activateProfile: vi.fn(),
		setModeConfig: vi.fn(),
		saveConfig: vi.fn(),
		resetAllConfigs: vi.fn(),
	})),
}))

vi.mock("../../config/CustomModesManager", () => ({
	CustomModesManager: vi.fn().mockImplementation(() => ({
		updateCustomMode: vi.fn(),
		getCustomModes: vi.fn().mockResolvedValue([]),
		dispose: vi.fn(),
		resetCustomModes: vi.fn(),
	})),
}))

vi.mock("../../../services/mcp/McpServerManager", () => ({
	McpServerManager: {
		getInstance: vi.fn().mockResolvedValue({
			registerClient: vi.fn(),
			unregisterClient: vi.fn(),
			getAllServers: vi.fn().mockReturnValue([]),
		}),
		unregisterProvider: vi.fn(),
	},
}))

vi.mock("../../../services/marketplace", () => ({
	MarketplaceManager: vi.fn().mockImplementation(() => ({
		getCurrentItems: vi.fn().mockResolvedValue([]),
		getInstallationMetadata: vi.fn().mockResolvedValue({ project: {}, global: {} }),
		cleanup: vi.fn(),
	})),
}))

vi.mock("../../config/ContextProxy")

vi.mock("@roo-code/cloud", () => ({
	CloudService: {
		hasInstance: vi.fn().mockReturnValue(false),
		instance: {
			getAllowList: vi.fn().mockResolvedValue("*"),
			getUserInfo: vi.fn().mockReturnValue(null),
			isAuthenticated: vi.fn().mockReturnValue(false),
			canShareTask: vi.fn().mockResolvedValue(false),
		},
	},
	getRooCodeApiUrl: vi.fn().mockReturnValue("https://app.roocode.com"),
}))

vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn().mockReturnValue("/test/workspace"),
}))

vi.mock("../../../shared/modes", () => ({
	defaultModeSlug: "code",
}))

vi.mock("../../../shared/experiments", () => ({
	experimentDefault: {},
}))

vi.mock("../../../shared/embeddingModels", () => ({
	EMBEDDING_MODEL_PROFILES: [],
}))

vi.mock("../../../integrations/terminal/Terminal", () => ({
	Terminal: {
		defaultShellIntegrationTimeout: 10000,
		setShellIntegrationTimeout: vi.fn(),
		setShellIntegrationDisabled: vi.fn(),
		setCommandDelay: vi.fn(),
		setTerminalZshClearEolMark: vi.fn(),
		setTerminalZshOhMy: vi.fn(),
		setTerminalZshP10k: vi.fn(),
		setPowershellCounter: vi.fn(),
		setTerminalZdotdir: vi.fn(),
	},
}))

vi.mock("../../../utils/tts", () => ({
	setTtsEnabled: vi.fn(),
	setTtsSpeed: vi.fn(),
}))

vi.mock("../../../integrations/theme/getTheme", () => ({
	getTheme: vi.fn().mockResolvedValue({}),
}))

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockResolvedValue(false),
}))

vi.mock("../../../core/prompts/sections/custom-system-prompt", () => ({
	getSystemPromptFilePath: vi.fn().mockReturnValue("/test/system-prompt.md"),
}))

vi.mock("../../../utils/git", () => ({
	getWorkspaceGitInfo: vi.fn().mockResolvedValue({}),
}))

vi.mock("../../../i18n", () => ({
	t: vi.fn((key) => key),
}))

vi.mock("../../../activate/registerCommands", () => ({
	setPanel: vi.fn(),
}))

vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn().mockReturnValue({
		getModel: vi.fn().mockReturnValue({ id: "test-model" }),
	}),
}))

vi.mock("../../task/Task", () => ({
	Task: vi.fn().mockImplementation(() => ({
		taskId: "test-task-id",
		instanceId: "test-instance-id",
		abortTask: vi.fn(),
		resumePausedTask: vi.fn(),
		clineMessages: [],
		apiConversationHistory: [],
	})),
}))

describe("ClineProvider - Command Merging", () => {
	let provider: ClineProvider
	let mockContext: vscode.ExtensionContext
	let mockOutputChannel: vscode.OutputChannel
	let mockContextProxy: ContextProxy
	let mockWebview: any
	let mockGlobalState: Map<string, any>

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks()
		mockGlobalState = new Map()

		// Mock context
		mockContext = {
			globalState: {
				get: vi.fn((key) => mockGlobalState.get(key)),
				update: vi.fn((key, value) => {
					mockGlobalState.set(key, value)
					return Promise.resolve()
				}),
				keys: vi.fn().mockReturnValue([]),
			},
			secrets: {
				get: vi.fn(),
				store: vi.fn(),
				delete: vi.fn(),
			},
			globalStorageUri: { fsPath: "/test/storage" },
			extensionUri: { fsPath: "/test/extension" },
			subscriptions: [],
			extension: {
				packageJSON: { version: "1.0.0" },
			},
		} as unknown as vscode.ExtensionContext

		// Mock output channel
		mockOutputChannel = {
			appendLine: vi.fn(),
			clear: vi.fn(),
			dispose: vi.fn(),
		} as unknown as vscode.OutputChannel

		// Mock context proxy
		mockContextProxy = {
			getValues: vi.fn(() => ({
				allowedCommands: mockGlobalState.get("allowedCommands"),
				deniedCommands: mockGlobalState.get("deniedCommands"),
			})),
			getValue: vi.fn((key: string) => mockGlobalState.get(key)),
			setValue: vi.fn(),
			setValues: vi.fn(),
			getProviderSettings: vi.fn().mockReturnValue({
				apiProvider: "openrouter",
			}),
			setProviderSettings: vi.fn(),
			extensionUri: { fsPath: "/test/extension" },
			globalStorageUri: { fsPath: "/test/storage" },
		} as unknown as ContextProxy

		// Mock webview
		mockWebview = {
			postMessage: vi.fn().mockResolvedValue(true),
			onDidReceiveMessage: vi.fn(),
		}

		// Create provider instance
		provider = new ClineProvider(mockContext, mockOutputChannel, "sidebar", mockContextProxy)
		provider["view"] = { webview: mockWebview } as any
	})

	describe("getStateToPostToWebview", () => {
		it("should not merge workspace commands with global state commands for settings UI", async () => {
			// Set up global state with allowed commands
			mockGlobalState.set("allowedCommands", ["npm test", "npm run build"])
			mockGlobalState.set("deniedCommands", ["rm -rf"])

			// Mock workspace configuration to have additional commands
			const mockConfig = {
				get: vi.fn((key) => {
					if (key === "allowedCommands") return ["npm test", "npm install", "git status"]
					if (key === "deniedCommands") return ["rm -rf", "sudo"]
					return undefined
				}),
			}
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any)

			// Get state to post to webview
			const state = await provider["getStateToPostToWebview"]()

			// Verify that the state contains only the global state commands, not merged
			expect(state.allowedCommands).toEqual(["npm test", "npm run build"])
			expect(state.deniedCommands).toEqual(["rm -rf"])

			// Should not include workspace commands that aren't in global state
			expect(state.allowedCommands).not.toContain("npm install")
			expect(state.allowedCommands).not.toContain("git status")
			expect(state.deniedCommands).not.toContain("sudo")
		})

		it("should handle empty global state commands", async () => {
			// Set up empty global state
			mockGlobalState.set("allowedCommands", [])
			mockGlobalState.set("deniedCommands", [])

			// Mock workspace configuration to have commands
			const mockConfig = {
				get: vi.fn((key) => {
					if (key === "allowedCommands") return ["npm test"]
					if (key === "deniedCommands") return ["rm -rf"]
					return undefined
				}),
			}
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any)

			// Get state to post to webview
			const state = await provider["getStateToPostToWebview"]()

			// Should return empty arrays from global state, not workspace config
			expect(state.allowedCommands).toEqual([])
			expect(state.deniedCommands).toEqual([])
		})

		it("should handle undefined global state commands", async () => {
			// Don't set any commands in global state

			// Mock workspace configuration to have commands
			const mockConfig = {
				get: vi.fn((key) => {
					if (key === "allowedCommands") return ["npm test"]
					if (key === "deniedCommands") return ["rm -rf"]
					return undefined
				}),
			}
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any)

			// Get state to post to webview
			const state = await provider["getStateToPostToWebview"]()

			// Should return undefined from global state, not workspace config
			expect(state.allowedCommands).toBeUndefined()
			expect(state.deniedCommands).toBeUndefined()
		})
	})

	describe("mergeAllowedCommands and mergeDeniedCommands", () => {
		it("should still merge commands when needed for command execution", async () => {
			// Set up global state
			mockGlobalState.set("allowedCommands", ["npm test"])
			mockGlobalState.set("deniedCommands", ["rm -rf"])

			// Mock workspace configuration
			const mockConfig = {
				get: vi.fn((key) => {
					if (key === "allowedCommands") return ["npm install", "git status"]
					if (key === "deniedCommands") return ["sudo"]
					return undefined
				}),
			}
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any)

			// Test mergeAllowedCommands
			const mergedAllowed = provider["mergeAllowedCommands"](["npm test"])
			expect(mergedAllowed).toContain("npm test")
			expect(mergedAllowed).toContain("npm install")
			expect(mergedAllowed).toContain("git status")
			expect(mergedAllowed).toHaveLength(3)

			// Test mergeDeniedCommands
			const mergedDenied = provider["mergeDeniedCommands"](["rm -rf"])
			expect(mergedDenied).toContain("rm -rf")
			expect(mergedDenied).toContain("sudo")
			expect(mergedDenied).toHaveLength(2)
		})

		it("should handle duplicates when merging", async () => {
			// Mock workspace configuration with duplicates
			const mockConfig = {
				get: vi.fn((key) => {
					if (key === "allowedCommands") return ["npm test", "npm test", "git status"]
					return undefined
				}),
			}
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any)

			// Test with duplicates in both lists
			const merged = provider["mergeAllowedCommands"](["npm test", "npm build"])
			expect(merged).toEqual(["npm test", "npm build", "git status"])
			expect(merged.filter((cmd) => cmd === "npm test")).toHaveLength(1)
		})
	})
})
