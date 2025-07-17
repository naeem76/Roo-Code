import { XMLBuilder } from "fast-xml-parser"

import { Task } from "../task/Task"
import { getVscodeEditorContext } from "./context/vscode"
import { getTerminalContext } from "./context/terminal"
import { getFileContext } from "./context/file"
import { getMetadataContext } from "./context/metadata"
import { getWorkspaceContext } from "./context/workspace"
import { getTodoContext } from "./context/todo"

export async function getEnvironmentDetails(task: Task, includeFileDetails: boolean = false) {
	const [vscodeContext, terminalContext, fileContext, metadataContext, workspaceContext, todoContext] =
		await Promise.all([
			getVscodeEditorContext(task),
			getTerminalContext(task),
			getFileContext(task),
			getMetadataContext(task),
			getWorkspaceContext(task, includeFileDetails),
			getTodoContext(task),
		])

	const envDetails = {
		...vscodeContext,
		...terminalContext,
		...fileContext,
		...metadataContext,
		...workspaceContext,
		...todoContext,
	}

	const builder = new XMLBuilder({
		format: true, // Enable pretty printing
		indentBy: "  ", // Use two spaces for indentation
		ignoreAttributes: false,
		attributeNamePrefix: "@",
		suppressEmptyNode: true, // Ensures tags with no children are excluded
		cdataPropName: "#cdata",
		textNodeName: "#text",
	})

	return builder.build({ environment_details: envDetails })
}
