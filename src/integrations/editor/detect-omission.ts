/**
 * Detects potential AI-generated code omissions in the given file content.
 * @param originalFileContent The original content of the file.
 * @param newFileContent The new content of the file to check.
 * @param predictedLineCount The predicted number of lines in the new content.
 * @returns True if a potential omission is detected, false otherwise.
 */
export function detectCodeOmission(
	originalFileContent: string,
	newFileContent: string,
	predictedLineCount: number,
): boolean {
	// Skip all checks if predictedLineCount is less than 20 (very small files)
	if (!predictedLineCount || predictedLineCount < 20) {
		return false
	}

	const actualLineCount = newFileContent.split("\n").length
	const lengthRatio = actualLineCount / predictedLineCount

	const originalLines = originalFileContent.split("\n")
	const newLines = newFileContent.split("\n")
	const omissionKeywords = [
		"remain",
		"remains",
		"unchanged",
		"rest",
		"previous",
		"existing",
		"content",
		"same",
		"...",
	]

	const commentPatterns = [
		/^\s*\/\//, // Single-line comment for most languages
		/^\s*#/, // Single-line comment for Python, Ruby, etc.
		/^\s*\/\*/, // Multi-line comment opening
		/^\s*{\s*\/\*/, // JSX comment opening
		/^\s*<!--/, // HTML comment opening
		/^\s*\[/, // Square bracket notation
	]

	// Consider comments as suspicious if they weren't in the original file
	// and contain omission keywords
	for (const line of newLines) {
		if (commentPatterns.some((pattern) => pattern.test(line))) {
			const words = line.toLowerCase().split(/\s+/)
			if (omissionKeywords.some((keyword) => words.includes(keyword))) {
				if (!originalLines.includes(line)) {
					// For files with 20-99 lines, flag if content is more than 30% shorter
					// For files with 100+ lines, flag if content is more than 20% shorter
					const threshold = predictedLineCount < 100 ? 0.7 : 0.8
					if (lengthRatio <= threshold) {
						return true
					}
				}
			}
		}
	}

	return false
}

/**
 * Detects inefficient use of write_to_file for existing files where targeted editing would be more appropriate.
 * @param originalFileContent The original content of the file.
 * @param newFileContent The new content of the file to check.
 * @returns Object with detection result and suggested alternatives.
 */
export function detectInefficientFileEdit(
	originalFileContent: string,
	newFileContent: string,
): { isInefficient: boolean; suggestion?: string; changeRatio?: number } {
	if (!originalFileContent || !newFileContent) {
		return { isInefficient: false }
	}

	const originalLines = originalFileContent.split("\n")
	const newLines = newFileContent.split("\n")

	// Skip check for very small files (less than 10 lines)
	if (originalLines.length < 10) {
		return { isInefficient: false }
	}

	// Calculate similarity between original and new content
	let unchangedLines = 0
	let changedLines = 0
	let addedLines = 0
	let removedLines = 0

	const maxLength = Math.max(originalLines.length, newLines.length)
	const minLength = Math.min(originalLines.length, newLines.length)

	// Count unchanged lines from the beginning
	let startUnchanged = 0
	for (let i = 0; i < minLength; i++) {
		if (originalLines[i] === newLines[i]) {
			startUnchanged++
		} else {
			break
		}
	}

	// Count unchanged lines from the end
	let endUnchanged = 0
	for (let i = 1; i <= minLength - startUnchanged; i++) {
		if (originalLines[originalLines.length - i] === newLines[newLines.length - i]) {
			endUnchanged++
		} else {
			break
		}
	}

	unchangedLines = startUnchanged + endUnchanged
	changedLines = minLength - unchangedLines
	addedLines = Math.max(0, newLines.length - originalLines.length)
	removedLines = Math.max(0, originalLines.length - newLines.length)

	const totalChanges = changedLines + addedLines + removedLines
	const changeRatio = totalChanges / maxLength

	// If less than 30% of the file changed, suggest more efficient tools
	if (changeRatio < 0.3 && totalChanges > 0) {
		let suggestion = "Consider using more efficient editing tools:\n"

		if (changedLines > 0 && addedLines === 0 && removedLines === 0) {
			suggestion += "- Use apply_diff for replacing specific sections\n"
			suggestion += "- Use search_and_replace for text pattern replacements"
		} else if (addedLines > 0 && changedLines === 0 && removedLines === 0) {
			suggestion += "- Use insert_content to add new lines at specific positions"
		} else if (removedLines > 0 && changedLines === 0 && addedLines === 0) {
			suggestion += "- Use apply_diff to remove specific sections"
		} else {
			suggestion += "- Use apply_diff for targeted modifications\n"
			suggestion += "- Use search_and_replace for pattern-based changes\n"
			suggestion += "- Use insert_content for adding new content"
		}

		return {
			isInefficient: true,
			suggestion,
			changeRatio: Math.round(changeRatio * 100) / 100,
		}
	}

	return { isInefficient: false, changeRatio: Math.round(changeRatio * 100) / 100 }
}
