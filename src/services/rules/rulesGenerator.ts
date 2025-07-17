import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import type { ProviderSettings } from "@roo-code/types"
import { fileExistsAtPath } from "../../utils/fs"
import { getProjectRooDirectoryForCwd } from "../roo-config/index"
import { singleCompletionHandler } from "../../utils/single-completion-handler"

interface ProjectConfig {
	type: "typescript" | "javascript" | "python" | "java" | "go" | "rust" | "unknown"
	hasTypeScript: boolean
	hasESLint: boolean
	hasPrettier: boolean
	hasJest: boolean
	hasVitest: boolean
	hasPytest: boolean
	packageManager: "npm" | "yarn" | "pnpm" | "bun" | null
	dependencies: string[]
	devDependencies: string[]
	scripts: Record<string, string>
}

/**
 * Analyzes the project configuration files to determine project type and tools
 */
async function analyzeProjectConfig(workspacePath: string): Promise<ProjectConfig> {
	const config: ProjectConfig = {
		type: "unknown",
		hasTypeScript: false,
		hasESLint: false,
		hasPrettier: false,
		hasJest: false,
		hasVitest: false,
		hasPytest: false,
		packageManager: null,
		dependencies: [],
		devDependencies: [],
		scripts: {},
	}

	// Check for package.json
	const packageJsonPath = path.join(workspacePath, "package.json")
	if (await fileExistsAtPath(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"))

			// Determine package manager
			if (await fileExistsAtPath(path.join(workspacePath, "yarn.lock"))) {
				config.packageManager = "yarn"
			} else if (await fileExistsAtPath(path.join(workspacePath, "pnpm-lock.yaml"))) {
				config.packageManager = "pnpm"
			} else if (await fileExistsAtPath(path.join(workspacePath, "bun.lockb"))) {
				config.packageManager = "bun"
			} else if (await fileExistsAtPath(path.join(workspacePath, "package-lock.json"))) {
				config.packageManager = "npm"
			}

			// Extract dependencies
			config.dependencies = Object.keys(packageJson.dependencies || {})
			config.devDependencies = Object.keys(packageJson.devDependencies || {})
			config.scripts = packageJson.scripts || {}

			// Check for specific tools
			const allDeps = [...config.dependencies, ...config.devDependencies]
			config.hasTypeScript =
				allDeps.includes("typescript") || (await fileExistsAtPath(path.join(workspacePath, "tsconfig.json")))
			config.hasESLint =
				allDeps.includes("eslint") ||
				(await fileExistsAtPath(path.join(workspacePath, ".eslintrc.js"))) ||
				(await fileExistsAtPath(path.join(workspacePath, ".eslintrc.json")))
			config.hasPrettier =
				allDeps.includes("prettier") || (await fileExistsAtPath(path.join(workspacePath, ".prettierrc")))
			config.hasJest = allDeps.includes("jest")
			config.hasVitest = allDeps.includes("vitest")

			// Determine project type
			if (config.hasTypeScript) {
				config.type = "typescript"
			} else {
				config.type = "javascript"
			}
		} catch (error) {
			console.error("Error parsing package.json:", error)
		}
	}

	// Check for Python project
	if (
		(await fileExistsAtPath(path.join(workspacePath, "pyproject.toml"))) ||
		(await fileExistsAtPath(path.join(workspacePath, "setup.py"))) ||
		(await fileExistsAtPath(path.join(workspacePath, "requirements.txt")))
	) {
		config.type = "python"
		config.hasPytest =
			(await fileExistsAtPath(path.join(workspacePath, "pytest.ini"))) ||
			(await fileExistsAtPath(path.join(workspacePath, "pyproject.toml")))
	}

	// Check for other project types
	if (await fileExistsAtPath(path.join(workspacePath, "go.mod"))) {
		config.type = "go"
	} else if (await fileExistsAtPath(path.join(workspacePath, "Cargo.toml"))) {
		config.type = "rust"
	} else if (
		(await fileExistsAtPath(path.join(workspacePath, "pom.xml"))) ||
		(await fileExistsAtPath(path.join(workspacePath, "build.gradle")))
	) {
		config.type = "java"
	}

	return config
}

/**
 * Generates a summary of the codebase for LLM analysis
 */
async function generateCodebaseSummary(workspacePath: string, config: ProjectConfig): Promise<string> {
	const summary: string[] = []

	// Project structure overview
	summary.push("# Codebase Analysis")
	summary.push("")
	summary.push(`**Project Type**: ${config.type}`)
	summary.push(`**Package Manager**: ${config.packageManager || "none"}`)
	summary.push("")

	// Configuration files
	summary.push("## Configuration Files Found:")
	const configFiles: string[] = []

	if (await fileExistsAtPath(path.join(workspacePath, "package.json"))) {
		configFiles.push("package.json")
	}
	if (await fileExistsAtPath(path.join(workspacePath, "tsconfig.json"))) {
		configFiles.push("tsconfig.json")
	}
	if (await fileExistsAtPath(path.join(workspacePath, ".eslintrc.js"))) {
		configFiles.push(".eslintrc.js")
	}
	if (await fileExistsAtPath(path.join(workspacePath, ".eslintrc.json"))) {
		configFiles.push(".eslintrc.json")
	}
	if (await fileExistsAtPath(path.join(workspacePath, ".prettierrc"))) {
		configFiles.push(".prettierrc")
	}
	if (await fileExistsAtPath(path.join(workspacePath, "jest.config.js"))) {
		configFiles.push("jest.config.js")
	}
	if (await fileExistsAtPath(path.join(workspacePath, "vitest.config.ts"))) {
		configFiles.push("vitest.config.ts")
	}
	if (await fileExistsAtPath(path.join(workspacePath, "pyproject.toml"))) {
		configFiles.push("pyproject.toml")
	}
	if (await fileExistsAtPath(path.join(workspacePath, "Cargo.toml"))) {
		configFiles.push("Cargo.toml")
	}
	if (await fileExistsAtPath(path.join(workspacePath, "go.mod"))) {
		configFiles.push("go.mod")
	}

	configFiles.forEach((file) => summary.push(`- ${file}`))
	summary.push("")

	// Dependencies
	if (config.dependencies.length > 0) {
		summary.push("## Key Dependencies:")
		config.dependencies.slice(0, 10).forEach((dep) => summary.push(`- ${dep}`))
		summary.push("")
	}

	if (config.devDependencies.length > 0) {
		summary.push("## Dev Dependencies:")
		config.devDependencies.slice(0, 10).forEach((dep) => summary.push(`- ${dep}`))
		summary.push("")
	}

	// Scripts
	if (Object.keys(config.scripts).length > 0) {
		summary.push("## Available Scripts:")
		Object.entries(config.scripts).forEach(([name, command]) => {
			summary.push(`- **${name}**: \`${command}\``)
		})
		summary.push("")
	}

	// Tools detected
	summary.push("## Tools Detected:")
	const tools: string[] = []
	if (config.hasTypeScript) tools.push("TypeScript")
	if (config.hasESLint) tools.push("ESLint")
	if (config.hasPrettier) tools.push("Prettier")
	if (config.hasJest) tools.push("Jest")
	if (config.hasVitest) tools.push("Vitest")
	if (config.hasPytest) tools.push("Pytest")

	tools.forEach((tool) => summary.push(`- ${tool}`))
	summary.push("")

	// Check for existing rules files
	const existingRulesFiles: string[] = []
	if (await fileExistsAtPath(path.join(workspacePath, "CLAUDE.md"))) {
		existingRulesFiles.push("CLAUDE.md")
	}
	if (await fileExistsAtPath(path.join(workspacePath, ".cursorrules"))) {
		existingRulesFiles.push(".cursorrules")
	}
	if (await fileExistsAtPath(path.join(workspacePath, ".cursor", "rules"))) {
		existingRulesFiles.push(".cursor/rules")
	}
	if (await fileExistsAtPath(path.join(workspacePath, ".github", "copilot-instructions.md"))) {
		existingRulesFiles.push(".github/copilot-instructions.md")
	}

	if (existingRulesFiles.length > 0) {
		summary.push("## Existing Rules Files:")
		existingRulesFiles.forEach((file) => summary.push(`- ${file}`))
		summary.push("")
	}

	return summary.join("\n")
}

/**
 * Generates rules content using LLM analysis with fallback to deterministic approach
 */
async function generateRulesWithLLM(
	workspacePath: string,
	config: ProjectConfig,
	apiConfiguration?: ProviderSettings,
): Promise<string> {
	if (!apiConfiguration) {
		// Fallback to deterministic generation
		return generateDeterministicRules(config, workspacePath)
	}

	try {
		const codebaseSummary = await generateCodebaseSummary(workspacePath, config)

		const prompt = `Please analyze this codebase and create a comprehensive rules file containing:

1. Build/lint/test commands - especially for running a single test
2. Code style guidelines including imports, formatting, types, naming conventions, error handling, etc.
3. Project-specific conventions and best practices

The file you create will be given to agentic coding agents that operate in this repository. Make it about 20 lines long and focus on the most important rules for this specific project.

If there are existing rules files mentioned below, make sure to incorporate and improve upon them.

Here's the codebase analysis:

${codebaseSummary}

Please respond with only the rules content in markdown format, starting with "# Project Rules".`

		const llmResponse = await singleCompletionHandler(apiConfiguration, prompt)

		// Validate that we got a reasonable response
		if (llmResponse && llmResponse.trim().length > 100 && llmResponse.includes("# Project Rules")) {
			return llmResponse.trim()
		} else {
			console.warn("LLM response was invalid, falling back to deterministic generation")
			return generateDeterministicRules(config, workspacePath)
		}
	} catch (error) {
		console.error("Error generating rules with LLM, falling back to deterministic generation:", error)
		return generateDeterministicRules(config, workspacePath)
	}
}

/**
 * Generates rules content deterministically (fallback approach)
 */
function generateDeterministicRules(config: ProjectConfig, workspacePath: string): string {
	const sections: string[] = []

	// Header
	sections.push("# Project Rules")
	sections.push("")
	sections.push(`Generated on: ${new Date().toISOString()}`)
	sections.push(`Project type: ${config.type}`)
	sections.push("")

	// Build and Development
	sections.push("## Build and Development")
	sections.push("")

	if (config.packageManager) {
		sections.push(`- Package manager: ${config.packageManager}`)
		sections.push(`- Install dependencies: \`${config.packageManager} install\``)

		if (config.scripts.build) {
			sections.push(`- Build command: \`${config.packageManager} run build\``)
		}
		if (config.scripts.test) {
			sections.push(`- Test command: \`${config.packageManager} run test\``)
		}
		if (config.scripts.dev || config.scripts.start) {
			const devScript = config.scripts.dev || config.scripts.start
			sections.push(
				`- Development server: \`${config.packageManager} run ${config.scripts.dev ? "dev" : "start"}\``,
			)
		}
	}

	sections.push("")

	// Code Style and Linting
	sections.push("## Code Style and Linting")
	sections.push("")

	if (config.hasESLint) {
		sections.push("- ESLint is configured for this project")
		sections.push("- Run linting: `npm run lint` (if configured)")
		sections.push("- Follow ESLint rules and fix any linting errors before committing")
	}

	if (config.hasPrettier) {
		sections.push("- Prettier is configured for code formatting")
		sections.push("- Format code before committing")
		sections.push("- Run formatting: `npm run format` (if configured)")
	}

	if (config.hasTypeScript) {
		sections.push("- TypeScript is used in this project")
		sections.push("- Ensure all TypeScript errors are resolved before committing")
		sections.push("- Use proper type annotations and avoid `any` types")
		sections.push("- Run type checking: `npm run type-check` or `tsc --noEmit`")
	}

	sections.push("")

	// Testing
	sections.push("## Testing")
	sections.push("")

	if (config.hasJest || config.hasVitest) {
		const testFramework = config.hasVitest ? "Vitest" : "Jest"
		sections.push(`- ${testFramework} is used for testing`)
		sections.push("- Write tests for new features and bug fixes")
		sections.push("- Ensure all tests pass before committing")
		sections.push(`- Run tests: \`${config.packageManager || "npm"} run test\``)

		if (config.hasVitest) {
			sections.push("- Vitest specific: Test files should use `.test.ts` or `.spec.ts` extensions")
			sections.push("- The `describe`, `test`, `it` functions are globally available")
		}
	}

	if (config.hasPytest && config.type === "python") {
		sections.push("- Pytest is used for testing")
		sections.push("- Write tests in `test_*.py` or `*_test.py` files")
		sections.push("- Run tests: `pytest`")
	}

	sections.push("")

	// General Best Practices
	sections.push("## General Best Practices")
	sections.push("")
	sections.push("- Write clear, self-documenting code")
	sections.push("- Add comments for complex logic")
	sections.push("- Keep functions small and focused")
	sections.push("- Follow DRY (Don't Repeat Yourself) principle")
	sections.push("- Handle edge cases and errors gracefully")
	sections.push("- Write meaningful commit messages")
	sections.push("")

	return sections.join("\n")
}

/**
 * Generates rules for the workspace and saves them to a file
 */
export async function generateRulesForWorkspace(
	workspacePath: string,
	apiConfiguration?: ProviderSettings,
): Promise<string> {
	// Analyze the project
	const config = await analyzeProjectConfig(workspacePath)

	// Generate rules content using LLM with fallback
	const rulesContent = await generateRulesWithLLM(workspacePath, config, apiConfiguration)

	// Ensure .roo/rules directory exists
	const rooDir = getProjectRooDirectoryForCwd(workspacePath)
	const rulesDir = path.join(rooDir, "rules")
	await fs.mkdir(rulesDir, { recursive: true })

	// Generate filename with timestamp
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5)
	const rulesFileName = `generated-rules-${timestamp}.md`
	const rulesPath = path.join(rulesDir, rulesFileName)

	// Write rules file
	await fs.writeFile(rulesPath, rulesContent, "utf-8")

	// Open the file in VSCode
	const doc = await vscode.workspace.openTextDocument(rulesPath)
	await vscode.window.showTextDocument(doc)

	return rulesPath
}
