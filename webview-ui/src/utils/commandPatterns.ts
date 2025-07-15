import { parse } from "shell-quote"
import { parseCommand } from "./commandUtils"

/**
 * Extracts command patterns from a command string using shell-quote parser.
 * This provides a robust, deterministic way to extract patterns that can be
 * used for allowing similar commands.
 *
 * @param command The full command string to extract patterns from
 * @returns Array of unique command patterns sorted alphabetically
 */
export function extractCommandPatterns(command: string): string[] {
	if (!command?.trim()) return []

	const patterns = new Set<string>()

	// Handle command chains (&&, ||, ;, |) using the unified parseCommand function
	const commands = parseCommand(command)

	for (const cmd of commands) {
		const cmdPatterns = extractSingleCommandPattern(cmd.trim())
		for (const pattern of cmdPatterns) {
			if (pattern) {
				patterns.add(pattern)
			}
		}
	}

	// Return sorted unique patterns
	return Array.from(patterns).sort()
}

/**
 * Extract patterns from a single command (not chained)
 *
 * This function implements a sophisticated pattern extraction algorithm that:
 * 1. Parses the command using shell-quote for accurate tokenization
 * 2. Identifies the base command and relevant subcommands
 * 3. Generates progressively more specific patterns
 * 4. Handles special cases for common tools (npm, git, docker, etc.)
 *
 * ## Pattern Extraction Strategy:
 *
 * The algorithm generates multiple patterns from least to most specific:
 * - Base command only (e.g., "git")
 * - Command + subcommand (e.g., "git push")
 * - Stops at flags, paths, or complex arguments
 *
 * ## Special Command Handling:
 *
 * **Package Managers (npm, yarn, pnpm, bun):**
 * - Extracts base command and subcommand
 * - Special handling for "run" to allow any script
 * - Example: "npm install" → ["npm", "npm install"]
 *
 * **Version Control (git):**
 * - Extracts git + subcommand only
 * - Example: "git push origin main" → ["git", "git push"]
 *
 * **Container/Orchestration (docker, kubectl, helm):**
 * - Similar to git, extracts command + subcommand
 * - Example: "docker build -t app ." → ["docker", "docker build"]
 *
 * **Interpreters (python, node, ruby, etc.):**
 * - Only extracts the interpreter name
 * - Example: "python script.py --arg" → ["python"]
 *
 * **Dangerous Commands (rm, mv, chmod, etc.):**
 * - Only extracts the base command for safety
 * - Example: "rm -rf /tmp/*" → ["rm"]
 *
 * **Script Files:**
 * - If command is a path or has script extension, returns as-is
 * - Example: "./deploy.sh" → ["./deploy.sh"]
 *
 * ## Examples:
 * ```typescript
 * extractSingleCommandPattern("npm install express")
 * // Returns: ["npm", "npm install"]
 *
 * extractSingleCommandPattern("git push --force origin main")
 * // Returns: ["git", "git push"]
 *
 * extractSingleCommandPattern("rm -rf node_modules")
 * // Returns: ["rm"]
 *
 * extractSingleCommandPattern("./scripts/build.sh --prod")
 * // Returns: ["./scripts/build.sh"]
 * ```
 *
 * @param command - Single command string to extract patterns from
 * @returns Array of patterns from least to most specific
 */
function extractSingleCommandPattern(command: string): string[] {
	if (!command) return []

	try {
		const parsed = parse(command)
		if (parsed.length === 0) return []

		const patterns: string[] = []
		const allPatterns: string[] = []
		let i = 0

		while (i < parsed.length) {
			const token = parsed[i]

			// Skip operators and glob patterns
			if (typeof token === "object" && "op" in token) {
				// Handle redirects (>, >>, <, etc.)
				if (token.op === ">" || token.op === ">>" || token.op === "<") {
					// Stop processing - we've hit a redirect
					break
				}
				// Handle glob patterns - treat as regular tokens
				if (token.op === "glob") {
					// For globs, we typically want to stop at the command level
					if (patterns.length > 0) {
						break
					}
				}
				i++
				continue
			}

			// Convert token to string
			const strToken = String(token)

			// Skip empty tokens
			if (!strToken) {
				i++
				continue
			}

			// Handle environment variables at the start
			if (patterns.length === 0 && strToken.includes("=") && /^[A-Z_]+=/i.test(strToken)) {
				// This is an environment variable, skip it
				i++
				continue
			}

			// First non-env-var token is the command
			if (patterns.length === 0) {
				// Handle script files
				if (
					strToken.includes("/") ||
					strToken.endsWith(".sh") ||
					strToken.endsWith(".py") ||
					strToken.endsWith(".js") ||
					strToken.endsWith(".rb")
				) {
					return [strToken]
				}
				patterns.push(strToken)
				allPatterns.push(strToken) // Add base command
				i++
				continue
			}

			// Stop at common flag indicators
			if (strToken.startsWith("-")) {
				break
			}

			// Stop at special shell operators
			if ([">", ">>", "<", "|", "&", ";"].includes(strToken)) {
				break
			}

			// Handle second token based on the command
			if (patterns.length === 1) {
				const baseCmd = patterns[0]

				// Special handling for package managers
				if (["npm", "yarn", "pnpm", "bun"].includes(baseCmd)) {
					// Include subcommand
					if (!strToken.startsWith("-") && !strToken.includes("/")) {
						patterns.push(strToken)
						allPatterns.push(patterns.join(" "))
						// For 'run' commands, stop here to allow any script
						if (strToken === "run") {
							break
						}
					} else {
						break
					}
				}

				// Special handling for git
				else if (baseCmd === "git") {
					if (!strToken.startsWith("-")) {
						patterns.push(strToken)
						allPatterns.push(patterns.join(" "))
					}
					break
				}

				// Special handling for docker/kubectl/helm
				else if (["docker", "kubectl", "helm"].includes(baseCmd)) {
					if (!strToken.startsWith("-")) {
						patterns.push(strToken)
						allPatterns.push(patterns.join(" "))
					}
					break
				}

				// Special handling for make
				else if (baseCmd === "make") {
					if (!strToken.startsWith("-")) {
						patterns.push(strToken)
						allPatterns.push(patterns.join(" "))
					}
					break
				}

				// For interpreters, stop after the command
				else if (["python", "python3", "node", "ruby", "perl", "php", "java", "go"].includes(baseCmd)) {
					break
				}

				// For dangerous commands, stop immediately
				else if (["rm", "mv", "cp", "chmod", "chown", "find", "grep", "sed", "awk"].includes(baseCmd)) {
					break
				}

				// For cd, stop immediately
				else if (baseCmd === "cd") {
					break
				}

				// For echo and similar commands, stop immediately
				else if (["echo", "printf", "cat", "ls", "pwd"].includes(baseCmd)) {
					break
				}

				// Default: stop at paths or complex arguments
				else if (
					strToken.includes("/") ||
					strToken.includes("\\") ||
					strToken.includes(":") ||
					strToken.includes("=")
				) {
					break
				}
			}

			// For third+ tokens, be very restrictive
			else {
				break
			}

			i++
		}

		return allPatterns
	} catch (_error) {
		// If parsing fails, fall back to simple first token
		const tokens = command.split(/\s+/)
		return tokens[0] ? [tokens[0]] : []
	}
}

/**
 * Get a human-readable description of what the pattern will allow
 */
export function getPatternDescription(pattern: string): string {
	if (!pattern) return ""

	const tokens = pattern.split(" ")
	const baseCommand = tokens[0]

	// npm/yarn/pnpm patterns
	if (["npm", "yarn", "pnpm", "bun"].includes(baseCommand)) {
		if (tokens[1] === "run") {
			return `all ${baseCommand} run scripts`
		}
		if (tokens[1]) {
			return `${baseCommand} ${tokens[1]} commands`
		}
		return `${baseCommand} commands`
	}

	// git patterns
	if (baseCommand === "git" && tokens[1]) {
		return `git ${tokens[1]} commands`
	}

	// Script files
	if (
		baseCommand.includes("/") ||
		baseCommand.endsWith(".sh") ||
		baseCommand.endsWith(".py") ||
		baseCommand.endsWith(".js") ||
		baseCommand.endsWith(".rb")
	) {
		return "this specific script"
	}

	// Interpreters
	if (["python", "python3", "node", "ruby", "perl", "php", "java", "go"].includes(baseCommand)) {
		return `${baseCommand} scripts`
	}

	// Docker/kubectl
	if (["docker", "kubectl", "helm"].includes(baseCommand) && tokens[1]) {
		return `${baseCommand} ${tokens[1]} commands`
	}

	// Make
	if (baseCommand === "make" && tokens[1]) {
		return `make ${tokens[1]} target`
	}

	// cd
	if (baseCommand === "cd") {
		return "directory navigation"
	}

	// Default
	return `${baseCommand} commands`
}

/**
 * Wrapper function to maintain backward compatibility with existing code
 * that expects a single pattern string
 */
export function extractCommandPattern(command: string): string {
	const patterns = extractCommandPatterns(command)
	// Return the most specific pattern (usually the last one)
	return patterns[patterns.length - 1] || ""
}
