import type { Task } from "../../task/Task"

/**
 * Retrieves todo context including current todo list status and reminders.
 * Formats todo items with appropriate status indicators.
 *
 * @param cline - The current task instance
 * @returns Object containing todo information
 */
export function getTodoContext(cline: Task) {
	try {
		if (cline.todoList && cline.todoList.length > 0) {
			const todoLines = cline.todoList
				.map((todo) => {
					try {
						let statusPrefix = "[ ]" // pending
						if (todo.status === "in_progress") statusPrefix = "[-]"
						else if (todo.status === "completed") statusPrefix = "[x]"
						return `${statusPrefix} ${todo.content}`
					} catch (error) {
						console.warn('Failed to format todo item:', error)
						return `[ ] ${todo.content || 'Invalid todo item'}`
					}
				})
				.join("\n")

			const todoText = [
				todoLines,
				"IMPORTANT: When task status changes, remember to call the `update_todo_list` tool to update your progress.",
			].join("\n")

			return {
				todo: {
					"#text": todoText,
				},
			}
		}
		return {
			todo: {
				"#text":
					"You have not created a todo list yet. Create one with `update_todo_list` if your task is complicated or involves multiple steps.",
			},
		}
	} catch (error) {
		console.warn('Failed to get todo context:', error)
		return {
			todo: {
				"#text": "Failed to load todo list. Create one with `update_todo_list` if needed.",
			},
		}
	}
}
