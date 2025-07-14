import { ToolArgs } from "./types"

export function getExecuteCommandDescription(args: ToolArgs): string | undefined {
	return `## execute_command
Description: Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task. You must tailor your command to the user's system and provide a clear explanation of what the command does. For command chaining, use the appropriate chaining syntax for the user's shell. Prefer to execute complex CLI commands over creating executable scripts, as they are more flexible and easier to run. Prefer relative commands and paths that avoid location sensitivity for terminal consistency, e.g: \`touch ./testdata/example.file\`, \`dir ./examples/model1/data/yaml\`, or \`go test ./cmd/front --config ./cmd/front/config.yml\`. If directed by the user, you may open a terminal in a different directory by using the \`cwd\` parameter.

Parameters:
- command: (required) The CLI command to execute. This should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.
- cwd: (optional) The working directory to execute the command in (default: ${args.cwd})
- suggestions: (optional) Command patterns for the user to allow/deny for future auto-approval. Include 1-2 relevant patterns when executing common development commands. Use <suggest> tags.

**Suggestion Guidelines:**
- Suggestions use prefix matching (case-insensitive)
- Include the base command (e.g., "npm", "git") and optionally a more specific pattern
- Only suggest "*" (allow all) if explicitly requested by the user

Usage:
<execute_command>
<command>Your command here</command>
<cwd>Working directory path (optional)</cwd>
<suggestions>
<suggest>pattern 1</suggest>
<suggest>pattern 2</suggest>
</suggestions>
</execute_command>

Example: Requesting to execute npm run dev
<execute_command>
<command>npm run dev</command>
<suggestions>
<suggest>npm run</suggest>
<suggest>npm</suggest>
</suggestions>
</execute_command>

Example: Requesting to execute ls in a specific directory
<execute_command>
<command>ls -la</command>
<cwd>/home/user/projects</cwd>
<suggestions>
<suggest>ls</suggest>
</suggestions>
</execute_command>`
}
