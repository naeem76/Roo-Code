import { XMLBuilder } from "fast-xml-parser"

import { Task } from "../task/Task"
import { getVscodeEditorContext } from "./context/vscode"
import { getTerminalContext } from "./context/terminal"
import { getFileContext } from "./context/file"
import { getMetadataContext } from "./context/metadata"
import { getWorkspaceContext } from "./context/workspace"
import { getTodoContext } from "./context/todo"

/**
 * Environment details structure for type safety
 */
export interface EnvironmentDetails {
	[key: string]: unknown
}

/**
 * Generates environment details for the current task, returning only differences
 * from the previous state to optimize token usage and improve performance.
 *
 * @param task - The current task instance
 * @param includeFileDetails - Whether to include detailed file listings
 * @returns XML string containing environment details differences
 */
export async function getEnvironmentDetails(task: Task, includeFileDetails: boolean = false): Promise<string> {
	const [vscodeContext, terminalContext, fileContext, metadataContext, workspaceContext, todoContext] =
		await Promise.all([
			getVscodeEditorContext(task),
			getTerminalContext(task),
			getFileContext(task),
			getMetadataContext(task),
			getWorkspaceContext(task, includeFileDetails),
			getTodoContext(task),
		])

	const currentEnvDetails: EnvironmentDetails = {
		...vscodeContext,
		...terminalContext,
		...fileContext,
		...metadataContext,
		...workspaceContext,
		...todoContext,
	}

	const diffEnvDetails = calculateEnvironmentDiff(currentEnvDetails, task.prevEnvDetails)

	// Store current state for next comparison
	task.prevEnvDetails = currentEnvDetails

	const builder = new XMLBuilder({
		format: true, // Enable pretty printing
		indentBy: "  ", // Use two spaces for indentation
		ignoreAttributes: false,
		attributeNamePrefix: "@",
		suppressEmptyNode: true, // Ensures tags with no children are excluded
		cdataPropName: "#cdata",
		textNodeName: "#text",
	})

	return builder.build({ environment_details: diffEnvDetails })
}

/**
 * Calculates the difference between current and previous environment details.
 * Returns only the changed properties to optimize token usage.
 *
 * @param current - Current environment details
 * @param previous - Previous environment details (if any)
 * @param depth - Current recursion depth to prevent infinite loops
 * @returns Object containing only the differences
 */
function calculateEnvironmentDiff(
	current: EnvironmentDetails,
	previous: EnvironmentDetails | undefined,
	depth: number = 0
): EnvironmentDetails {
	// Prevent infinite recursion
	const MAX_DEPTH = 10
	if (depth > MAX_DEPTH) {
		console.warn('Environment diff calculation exceeded maximum depth, returning current value')
		return current
	}

	if (!previous) return current

	return Object.keys(current).reduce((acc, key) => {
		const currentValue = current[key]
		const previousValue = previous ? previous[key] : undefined

		if (areObjectsEqual(currentValue, previousValue)) {
			return acc
		}

		// Check for nested objects (but not arrays)
		if (
			typeof currentValue === "object" &&
			currentValue !== null &&
			!Array.isArray(currentValue) &&
			typeof previousValue === "object" &&
			previousValue !== null &&
			!Array.isArray(previousValue)
		) {
			const nestedDiff = calculateEnvironmentDiff(
				currentValue as EnvironmentDetails,
				previousValue as EnvironmentDetails,
				depth + 1
			)
			if (Object.keys(nestedDiff).length > 0) {
				acc[key] = nestedDiff
			}
		} else {
			// For primitives, arrays, or if previous was not an object
			acc[key] = currentValue
		}

		return acc
	}, {} as EnvironmentDetails)
}

/**
 * Performs deep equality comparison between two values.
 * Handles objects, arrays, and primitive types.
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @param depth - Current recursion depth to prevent infinite loops
 * @returns True if values are equal, false otherwise
 */
function areObjectsEqual(a: unknown, b: unknown, depth: number = 0): boolean {
	// Prevent infinite recursion
	const MAX_DEPTH = 10
	if (depth > MAX_DEPTH) {
		console.warn('Object equality check exceeded maximum depth, returning false')
		return false
	}

	if (a === b) return true
	if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false

	const keysA = Object.keys(a as Record<string, unknown>)
	const keysB = Object.keys(b as Record<string, unknown>)

	if (keysA.length !== keysB.length) return false

	for (const key of keysA) {
		if (!keysB.includes(key) || !areObjectsEqual(
			(a as Record<string, unknown>)[key],
			(b as Record<string, unknown>)[key],
			depth + 1
		)) {
			return false
		}
	}

	return true
}
