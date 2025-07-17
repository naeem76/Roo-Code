import * as fs from "fs/promises"
import * as path from "path"
import { fileExistsAtPath } from "../../utils/fs"

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

			// Check for TypeScript
			if (
				config.devDependencies.includes("typescript") ||
				config.dependencies.includes("typescript") ||
				(await fileExistsAtPath(path.join(workspacePath, "tsconfig.json")))
			) {
				config.hasTypeScript = true
				config.type = "typescript"
			} else {
				config.type = "javascript"
			}

			// Check for testing frameworks
			if (config.devDependencies.includes("jest") || config.dependencies.includes("jest")) {
				config.hasJest = true
			}
			if (config.devDependencies.includes("vitest") || config.dependencies.includes("vitest")) {
				config.hasVitest = true
			}

			// Check for linting/formatting
			if (config.devDependencies.includes("eslint") || config.dependencies.includes("eslint")) {
				config.hasESLint = true
			}
			if (config.devDependencies.includes("prettier") || config.dependencies.includes("prettier")) {
				config.hasPrettier = true
			}
		} catch (error) {
			console.error("Error parsing package.json:", error)
		}
	}

	// Check for Python project
	if (await fileExistsAtPath(path.join(workspacePath, "requirements.txt"))) {
		config.type = "python"
	} else if (await fileExistsAtPath(path.join(workspacePath, "pyproject.toml"))) {
		config.type = "python"
		// Check for pytest
		try {
			const pyprojectContent = await fs.readFile(path.join(workspacePath, "pyproject.toml"), "utf-8")
			if (pyprojectContent.includes("pytest")) {
				config.hasPytest = true
			}
		} catch (error) {
			console.error("Error reading pyproject.toml:", error)
		}
	} else if (await fileExistsAtPath(path.join(workspacePath, "setup.py"))) {
		config.type = "python"
	}

	// Check for other project types
	if (await fileExistsAtPath(path.join(workspacePath, "go.mod"))) {
		config.type = "go"
	} else if (await fileExistsAtPath(path.join(workspacePath, "Cargo.toml"))) {
		config.type = "rust"
	} else if (await fileExistsAtPath(path.join(workspacePath, "pom.xml"))) {
		config.type = "java"
	}

	return config
}

/**
 * Generates a summary of the codebase for LLM analysis
 */
async function generateCodebaseSummary(workspacePath: string, config: ProjectConfig): Promise<string> {
	const summary: string[] = []

	summary.push("## Project Configuration Analysis")
	summary.push("")
	summary.push(`**Project Type:** ${config.type}`)
	summary.push(`**Package Manager:** ${config.packageManager || "None detected"}`)
	summary.push("")

	// List key dependencies
	if (config.dependencies.length > 0) {
		summary.push("### Key Dependencies:")
		const keyDeps = config.dependencies.slice(0, 10)
		keyDeps.forEach((dep) => summary.push(`- ${dep}`))
		if (config.dependencies.length > 10) {
			summary.push(`- ... and ${config.dependencies.length - 10} more`)
		}
		summary.push("")
	}

	// List dev dependencies
	if (config.devDependencies.length > 0) {
		summary.push("### Development Dependencies:")
		const keyDevDeps = config.devDependencies.slice(0, 10)
		keyDevDeps.forEach((dep) => summary.push(`- ${dep}`))
		if (config.devDependencies.length > 10) {
			summary.push(`- ... and ${config.devDependencies.length - 10} more`)
		}
		summary.push("")
	}

	// List available scripts
	const scriptKeys = Object.keys(config.scripts)
	if (scriptKeys.length > 0) {
		summary.push("### Available Scripts:")
		scriptKeys.forEach((script) => summary.push(`- ${script}: ${config.scripts[script]}`))
		summary.push("")
	}

	// List detected tools
	summary.push("### Detected Tools and Frameworks:")
	const tools: string[] = []
	if (config.hasTypeScript) tools.push("TypeScript")
	if (config.hasESLint) tools.push("ESLint")
	if (config.hasPrettier) tools.push("Prettier")
	if (config.hasJest) tools.push("Jest")
	if (config.hasVitest) tools.push("Vitest")
	if (config.hasPytest) tools.push("Pytest")

	if (tools.length === 0) {
		tools.push("No specific tools detected")
	}

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
 * Creates a comprehensive task message for rules generation that can be used with initClineWithTask
 */
export async function createRulesGenerationTaskMessage(workspacePath: string): Promise<string> {
	// Analyze the project to get context
	const config = await analyzeProjectConfig(workspacePath)
	const codebaseSummary = await generateCodebaseSummary(workspacePath, config)

	// Ensure .roo/rules directory exists at project root
	const rooRulesDir = path.join(workspacePath, ".roo", "rules")
	try {
		await fs.mkdir(rooRulesDir, { recursive: true })
	} catch (error) {
		// Directory might already exist, which is fine
	}

	// Create a comprehensive message for the rules generation task
	const taskMessage = `Analyze this codebase and generate comprehensive rules for AI agents working in this repository.

Your task is to:

1. **Analyze the project structure** - The codebase has been analyzed and here's what was found:

${codebaseSummary}

2. **Create comprehensive rules** that include:
   - Build/lint/test commands (especially for running single tests)
   - Code style guidelines including imports, formatting, types, naming conventions
   - Error handling patterns
   - Project-specific conventions and best practices
   - File organization patterns

3. **Save the rules** to the file at exactly this path: .roo/rules/coding-standards.md
   - The .roo/rules directory has already been created for you
   - Always overwrite the existing file if it exists
   - Use the \`write_to_file\` tool to save the content

4. **Open the generated file** in the editor for review

The rules should be about 20-30 lines long and focus on the most important guidelines for this specific project. Make them actionable and specific to help AI agents work effectively in this codebase.

If there are existing rules files (like CLAUDE.md, .cursorrules, .cursor/rules, .github/copilot-instructions.md), incorporate and improve upon them.

Use the \`safeWriteJson\` utility from \`src/utils/safeWriteJson.ts\` for any JSON file operations to ensure atomic writes.`

	return taskMessage
}
