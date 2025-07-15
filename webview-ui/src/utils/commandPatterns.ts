import { parse } from "shell-quote"

/**
 * Extracts command patterns from a command string using shell-quote parser.
 * This provides a robust, deterministic way to extract patterns that can be
 * used for whitelisting similar commands.
 *
 * @param command The full command string to extract patterns from
 * @returns Array of unique command patterns sorted alphabetically
 */
export function extractCommandPatterns(command: string): string[] {
	if (!command?.trim()) return []

	const patterns = new Set<string>()

	// Handle command chains (&&, ||, ;, |)
	const chainOperators = ["&&", "||", ";", "|"]
	const commands = splitByOperators(command, chainOperators)

	for (const cmd of commands) {
		const pattern = extractSingleCommandPattern(cmd.trim())
		if (pattern) {
			patterns.add(pattern)
		}
	}

	// Return sorted unique patterns
	return Array.from(patterns).sort()
}

/**
 * Split command by operators while respecting shell syntax
 */
function splitByOperators(command: string, operators: string[]): string[] {
	const commands: string[] = []
	let current = ""
	let inSingleQuote = false
	let inDoubleQuote = false
	let escapeNext = false

	for (let i = 0; i < command.length; i++) {
		const char = command[i]

		if (escapeNext) {
			current += char
			escapeNext = false
			continue
		}

		if (char === "\\") {
			escapeNext = true
			current += char
			continue
		}

		if (char === "'" && !inDoubleQuote) {
			inSingleQuote = !inSingleQuote
			current += char
			continue
		}

		if (char === '"' && !inSingleQuote) {
			inDoubleQuote = !inDoubleQuote
			current += char
			continue
		}

		// Check for operators outside quotes
		if (!inSingleQuote && !inDoubleQuote) {
			let foundOperator = false
			for (const op of operators) {
				if (command.substring(i, i + op.length) === op) {
					// Found an operator, save current command
					if (current.trim()) {
						commands.push(current.trim())
					}
					current = ""
					i += op.length - 1 // -1 because the loop will increment
					foundOperator = true
					break
				}
			}
			if (foundOperator) continue
		}

		current += char
	}

	// Don't forget the last command
	if (current.trim()) {
		commands.push(current.trim())
	}

	// If no commands were found, return the whole command
	if (commands.length === 0) {
		commands.push(command)
	}

	return commands
}

/**
 * Extract pattern from a single command (not chained)
 */
function extractSingleCommandPattern(command: string): string {
	if (!command) return ""

	try {
		const parsed = parse(command)
		if (parsed.length === 0) return ""

		const patterns: string[] = []
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
					return strToken
				}
				patterns.push(strToken)
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
					}
					break
				}

				// Special handling for docker/kubectl/helm
				else if (["docker", "kubectl", "helm"].includes(baseCmd)) {
					if (!strToken.startsWith("-")) {
						patterns.push(strToken)
					}
					break
				}

				// Special handling for make
				else if (baseCmd === "make") {
					if (!strToken.startsWith("-")) {
						patterns.push(strToken)
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

		return patterns.join(" ")
	} catch (_error) {
		// If parsing fails, fall back to simple first token
		const tokens = command.split(/\s+/)
		return tokens[0] || ""
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
	return patterns[0] || ""
}
