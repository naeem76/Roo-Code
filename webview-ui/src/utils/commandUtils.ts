import { parse } from "shell-quote"

type ShellToken = string | { op: string } | { command: string }

/**
 * # Unified Command Utilities Module
 *
 * This module consolidates all command parsing and manipulation utilities
 * that were previously scattered across multiple files. It provides a single
 * source of truth for command-related operations.
 *
 * ## Key Features:
 * - Command splitting by shell operators (&&, ||, ;, |)
 * - Proper handling of quoted strings and escape sequences
 * - Subshell command detection and handling
 * - Command output parsing with suggestion extraction
 * - Pattern extraction from commands
 *
 * ## Migration Notes:
 * - `parseCommand` replaces both `parseCommand` from command-validation.ts
 *   and `splitByOperators` from commandPatterns.ts
 * - `parseCommandAndOutput` moved from commandParsing.ts
 * - All command-related utilities are now centralized here
 */

/**
 * Split a command string into individual sub-commands by
 * chaining operators (&&, ||, ;, or |).
 *
 * This is the unified implementation that replaces both:
 * - `parseCommand` from command-validation.ts
 * - `splitByOperators` from commandPatterns.ts
 *
 * Uses shell-quote to properly handle:
 * - Quoted strings (preserves quotes)
 * - Subshell commands ($(cmd) or `cmd`)
 * - PowerShell redirections (2>&1)
 * - Chain operators (&&, ||, ;, |)
 * - Array indexing expressions (${array[...]})
 *
 * @param command - The command string to split
 * @returns Array of individual commands with operators removed
 */
export function parseCommand(command: string): string[] {
	if (!command?.trim()) return []

	// Storage for replaced content
	const redirections: string[] = []
	const subshells: string[] = []
	const quotes: string[] = []
	const arrayIndexing: string[] = []

	// First handle PowerShell redirections by temporarily replacing them
	let processedCommand = command.replace(/\d*>&\d*/g, (match) => {
		redirections.push(match)
		return `__REDIR_${redirections.length - 1}__`
	})

	// Handle array indexing expressions: ${array[...]} pattern and partial expressions
	processedCommand = processedCommand.replace(/\$\{[^}]*\[[^\]]*(\]([^}]*\})?)?/g, (match) => {
		arrayIndexing.push(match)
		return `__ARRAY_${arrayIndexing.length - 1}__`
	})

	// Then handle subshell commands
	processedCommand = processedCommand
		.replace(/\$\((.*?)\)/g, (_, inner) => {
			subshells.push(inner.trim())
			return `__SUBSH_${subshells.length - 1}__`
		})
		.replace(/`(.*?)`/g, (_, inner) => {
			subshells.push(inner.trim())
			return `__SUBSH_${subshells.length - 1}__`
		})

	// Then handle quoted strings
	processedCommand = processedCommand.replace(/"[^"]*"/g, (match) => {
		quotes.push(match)
		return `__QUOTE_${quotes.length - 1}__`
	})

	const tokens = parse(processedCommand) as ShellToken[]
	const commands: string[] = []
	let currentCommand: string[] = []

	for (const token of tokens) {
		if (typeof token === "object" && "op" in token) {
			// Chain operator - split command
			if (["&&", "||", ";", "|"].includes(token.op)) {
				if (currentCommand.length > 0) {
					commands.push(currentCommand.join(" "))
					currentCommand = []
				}
			} else {
				// Other operators (>, &) are part of the command
				currentCommand.push(token.op)
			}
		} else if (typeof token === "string") {
			// Check if it's a subshell placeholder
			const subshellMatch = token.match(/__SUBSH_(\d+)__/)
			if (subshellMatch) {
				if (currentCommand.length > 0) {
					commands.push(currentCommand.join(" "))
					currentCommand = []
				}
				commands.push(subshells[parseInt(subshellMatch[1])])
			} else {
				currentCommand.push(token)
			}
		}
	}

	// Add any remaining command
	if (currentCommand.length > 0) {
		commands.push(currentCommand.join(" "))
	}

	// Restore quotes and redirections
	return commands.map((cmd) => {
		let result = cmd
		// Restore quotes
		result = result.replace(/__QUOTE_(\d+)__/g, (_, i) => quotes[parseInt(i)])
		// Restore redirections
		result = result.replace(/__REDIR_(\d+)__/g, (_, i) => redirections[parseInt(i)])
		// Restore array indexing expressions
		result = result.replace(/__ARRAY_(\d+)__/g, (_, i) => arrayIndexing[parseInt(i)])
		return result
	})
}

/**
 * Legacy alias for parseCommand to maintain backward compatibility
 * @deprecated Use parseCommand instead
 */
export const splitByOperators = (command: string, _operators?: string[]): string[] => {
	console.warn("splitByOperators is deprecated. Use parseCommand instead.")
	return parseCommand(command)
}

/**
 * Check if a command contains subshell expressions
 * @param command - The command to check
 * @returns True if the command contains $() or `` subshell syntax
 */
export function hasSubshellExpressions(command: string): boolean {
	return command.includes("$(") || command.includes("`")
}

/**
 * Remove PowerShell-style redirections from a command
 * @param command - The command to clean
 * @returns Command with redirections removed
 */
export function removeRedirections(command: string): string {
	return command.replace(/\d*>&\d*/g, "").trim()
}

// Define the constant locally since it's a simple string
const COMMAND_OUTPUT_STRING = "Output:"

export interface ParsedCommand {
	command: string
	output: string
	suggestions: string[]
}

/**
 * Parses command text to extract the command, output, and suggestions.
 * Supports both <suggestions> JSON array format and individual <suggest> tags.
 *
 * @param text - The text containing command, output, and suggestions
 * @returns Parsed command data with command, output, and suggestions array
 */
export const parseCommandAndOutput = (text: string | undefined): ParsedCommand => {
	if (!text) {
		return { command: "", output: "", suggestions: [] }
	}

	// First, extract suggestions from the text
	const suggestions: string[] = []

	// Parse <suggestions> tag with JSON array
	const suggestionsMatch = text.match(/<suggestions>([\s\S]*?)<\/suggestions>/)
	if (suggestionsMatch) {
		try {
			const parsed = JSON.parse(suggestionsMatch[1])
			if (Array.isArray(parsed)) {
				suggestions.push(...parsed.filter((s: any) => typeof s === "string" && s.trim()))
			}
		} catch {
			// Invalid JSON, ignore
		}
		// Remove the suggestions tag from text
		text = text.replace(/<suggestions>[\s\S]*?<\/suggestions>/, "")
	}

	// Parse individual <suggest> tags
	let suggestMatch
	const suggestRegex = /<suggest>([\s\S]*?)<\/suggest>/g
	while ((suggestMatch = suggestRegex.exec(text)) !== null) {
		const suggestion = suggestMatch[1].trim()
		if (suggestion) {
			suggestions.push(suggestion)
		}
	}
	// Remove all suggest tags from text
	text = text.replace(/<suggest>[\s\S]*?<\/suggest>/g, "")

	// Now parse command and output
	const index = text.indexOf(COMMAND_OUTPUT_STRING)

	if (index === -1) {
		return { command: text.trim(), output: "", suggestions }
	}

	return {
		command: text.slice(0, index).trim(),
		output: text.slice(index + COMMAND_OUTPUT_STRING.length),
		suggestions,
	}
}

/**
 * Extract the base command from a full command string
 * (e.g., "git push origin main" -> "git")
 *
 * @param command - The full command string
 * @returns The base command
 */
export function extractBaseCommand(command: string): string {
	const trimmed = command.trim()
	const spaceIndex = trimmed.indexOf(" ")
	return spaceIndex === -1 ? trimmed : trimmed.substring(0, spaceIndex)
}

/**
 * Check if a command matches a pattern (case-insensitive prefix match)
 *
 * @param command - The command to check
 * @param pattern - The pattern to match against
 * @returns True if the command starts with the pattern
 */
export function commandMatchesPattern(command: string, pattern: string): boolean {
	return command.trim().toLowerCase().startsWith(pattern.toLowerCase())
}

/**
 * Normalize a command by trimming whitespace and converting to lowercase
 * Useful for consistent command comparison
 *
 * @param command - The command to normalize
 * @returns Normalized command string
 */
export function normalizeCommand(command: string): string {
	return command.trim().toLowerCase()
}

/**
 * Get all subcommands from a command string, including those in subshells
 *
 * @param command - The command to analyze
 * @returns Array of all commands including subshell commands
 */
export function getAllSubcommands(command: string): string[] {
	const mainCommands = parseCommand(command)
	const allCommands: string[] = []

	for (const cmd of mainCommands) {
		allCommands.push(cmd)

		// Extract subshell commands using regex exec
		const patterns = [/\$\((.*?)\)/g, /`(.*?)`/g]

		for (const pattern of patterns) {
			let match
			while ((match = pattern.exec(cmd)) !== null) {
				if (match[1]) {
					// Recursively get subcommands from the subshell
					allCommands.push(...getAllSubcommands(match[1]))
				}
			}
		}
	}

	return allCommands
}
