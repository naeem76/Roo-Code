import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { fileExistsAtPath } from "../../utils/fs"
import { getProjectRooDirectoryForCwd } from "../roo-config/index"

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
 * Generates rules content based on project analysis
 */
function generateRulesContent(config: ProjectConfig, workspacePath: string): string {
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

	// Project Structure
	sections.push("## Project Structure")
	sections.push("")
	sections.push("- Follow the existing project structure and naming conventions")
	sections.push("- Place new files in appropriate directories")
	sections.push("- Use consistent file naming (kebab-case, camelCase, or PascalCase as per project convention)")

	sections.push("")

	// Language-specific rules
	if (config.type === "typescript" || config.type === "javascript") {
		sections.push("## JavaScript/TypeScript Guidelines")
		sections.push("")
		sections.push("- Use ES6+ syntax (const/let, arrow functions, destructuring, etc.)")
		sections.push("- Prefer functional programming patterns where appropriate")
		sections.push("- Handle errors properly with try/catch blocks")
		sections.push("- Use async/await for asynchronous operations")
		sections.push("- Follow existing import/export patterns")
		sections.push("")
	}

	if (config.type === "python") {
		sections.push("## Python Guidelines")
		sections.push("")
		sections.push("- Follow PEP 8 style guide")
		sections.push("- Use type hints where appropriate")
		sections.push("- Write docstrings for functions and classes")
		sections.push("- Use virtual environments for dependency management")
		sections.push("")
	}

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

	// Dependencies
	if (config.dependencies.length > 0 || config.devDependencies.length > 0) {
		sections.push("## Key Dependencies")
		sections.push("")

		// List some key dependencies
		const keyDeps = [...config.dependencies, ...config.devDependencies]
			.filter((dep) => !dep.startsWith("@types/"))
			.slice(0, 10)

		keyDeps.forEach((dep) => {
			sections.push(`- ${dep}`)
		})

		sections.push("")
	}

	return sections.join("\n")
}

/**
 * Generates rules for the workspace and saves them to a file
 */
export async function generateRulesForWorkspace(workspacePath: string): Promise<string> {
	// Analyze the project
	const config = await analyzeProjectConfig(workspacePath)

	// Generate rules content
	const rulesContent = generateRulesContent(config, workspacePath)

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
