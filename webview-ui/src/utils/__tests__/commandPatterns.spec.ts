import { describe, it, expect } from "vitest"
import { extractCommandPatterns, getPatternDescription } from "../commandPatterns"

describe("extractCommandPatterns", () => {
	describe("command chains", () => {
		it("should not include the full command chain as a pattern", () => {
			const patterns = extractCommandPatterns("cd backend && npm install")
			expect(patterns).not.toContain("cd backend && npm install")
			expect(patterns).toContain("cd")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm install")
		})

		it("should handle multiple operators", () => {
			const patterns = extractCommandPatterns("git status && git add . || git commit -m 'test'")
			expect(patterns).not.toContain("git status && git add . || git commit -m 'test'")
			expect(patterns).toContain("git")
			expect(patterns).toContain("git status")
			expect(patterns).toContain("git add")
			expect(patterns).toContain("git commit")
		})

		it("should handle pipe operators", () => {
			const patterns = extractCommandPatterns("grep map | head")
			expect(patterns).not.toContain("grep map | head")
			expect(patterns).toContain("grep")
			expect(patterns).toContain("head")
		})

		it("should handle semicolon separators", () => {
			const patterns = extractCommandPatterns("cd src; npm test")
			expect(patterns).not.toContain("cd src; npm test")
			expect(patterns).toContain("cd")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm test")
		})

		it("should handle complex chains from real examples", () => {
			const patterns = extractCommandPatterns(
				"unzip -l builds/roo-cline-3.21.5-error-boundary-component.vsix|grep map|head",
			)
			expect(patterns).not.toContain(
				"unzip -l builds/roo-cline-3.21.5-error-boundary-component.vsix|grep map|head",
			)
			expect(patterns).toContain("unzip")
			expect(patterns).toContain("grep")
			expect(patterns).toContain("head")
		})

		it("should handle chains with spaces around operators", () => {
			const patterns = extractCommandPatterns("git diff | xclip")
			expect(patterns).not.toContain("git diff | xclip")
			expect(patterns).toContain("git")
			expect(patterns).toContain("git diff")
			expect(patterns).toContain("xclip")
		})
	})

	describe("single commands", () => {
		it("should extract base command", () => {
			const patterns = extractCommandPatterns("git")
			expect(patterns).toEqual(["git"])
		})

		it("should extract command with subcommand", () => {
			const patterns = extractCommandPatterns("git status")
			expect(patterns).toContain("git")
			expect(patterns).toContain("git status")
		})

		it("should handle npm run commands", () => {
			const patterns = extractCommandPatterns("npm run test")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm run")
			// Should stop at 'run' to allow any script
		})

		it("should handle script files", () => {
			const patterns = extractCommandPatterns("../repackage.sh")
			expect(patterns).toEqual(["../repackage.sh"])
		})

		it("should stop at flags", () => {
			const patterns = extractCommandPatterns("git diff --stat")
			expect(patterns).toContain("git")
			expect(patterns).toContain("git diff")
			expect(patterns).not.toContain("git diff --stat")
		})

		it("should handle environment variables", () => {
			const patterns = extractCommandPatterns("NODE_ENV=production npm start")
			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm start")
			expect(patterns).not.toContain("NODE_ENV=production")
		})
	})

	describe("edge cases", () => {
		it("should handle empty command", () => {
			const patterns = extractCommandPatterns("")
			expect(patterns).toEqual([])
		})

		it("should handle whitespace only", () => {
			const patterns = extractCommandPatterns("   ")
			expect(patterns).toEqual([])
		})

		it("should handle quoted strings with operators", () => {
			const patterns = extractCommandPatterns('echo "test && test"')
			expect(patterns).toContain("echo")
			expect(patterns).not.toContain("test")
		})

		it("should return sorted unique patterns", () => {
			const patterns = extractCommandPatterns("git status && git add && git status")
			expect(patterns).toEqual(["git", "git add", "git status"])
		})
	})

	describe("complex real-world examples", () => {
		it("should correctly parse unzip with pipe chain", () => {
			const command = "unzip -l builds/roo-cline-3.21.5-error-boundary-component.vsix|grep map"
			const patterns = extractCommandPatterns(command)

			// Should extract individual commands from the chain
			expect(patterns).toContain("unzip")
			expect(patterns).toContain("grep")

			// Should not include the full chain
			expect(patterns).not.toContain(command)

			// Should not include flags or arguments
			expect(patterns).not.toContain("unzip -l")
			expect(patterns).not.toContain("grep map")
		})

		it("should correctly parse git push with multiple arguments", () => {
			const command = "git push github refactor-use-files-for-history -f"
			const patterns = extractCommandPatterns(command)

			// Should extract base command and subcommand
			expect(patterns).toContain("git")
			expect(patterns).toContain("git push")

			// Should not include remote, branch, or flags
			expect(patterns).not.toContain("git push github")
			expect(patterns).not.toContain("github")
			expect(patterns).not.toContain("refactor-use-files-for-history")
			expect(patterns).not.toContain("-f")
		})

		it("should correctly parse complex build and install chain", () => {
			const command =
				"../roo-main/build.sh && code --install-extension builds/roo-cline-3.21.5-error-boundary-component.vsix && code"
			const patterns = extractCommandPatterns(command)

			// Should extract script file
			expect(patterns).toContain("../roo-main/build.sh")

			// Should extract code command (appears twice, but set will dedupe)
			expect(patterns).toContain("code")

			// Should not include the full chain
			expect(patterns).not.toContain(command)

			// Should not include flags or arguments
			expect(patterns).not.toContain("code --install-extension")
			expect(patterns).not.toContain("--install-extension")
			expect(patterns).not.toContain("builds/roo-cline-3.21.5-error-boundary-component.vsix")
		})

		it("should handle npm scripts with arguments", () => {
			const command = "npm run build -- --watch"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm run")
			// Should stop at 'run' to allow any script
			expect(patterns).not.toContain("npm run build")
		})

		it("should handle docker commands with subcommands", () => {
			const command = "docker compose up -d"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("docker")
			expect(patterns).toContain("docker compose")
			expect(patterns).not.toContain("docker compose up")
			expect(patterns).not.toContain("-d")
		})

		it("should handle kubectl commands", () => {
			const command = "kubectl get pods -n production"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("kubectl")
			expect(patterns).toContain("kubectl get")
			expect(patterns).not.toContain("kubectl get pods")
			expect(patterns).not.toContain("-n")
			expect(patterns).not.toContain("production")
		})

		it("should handle make targets", () => {
			const command = "make clean && make build"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("make")
			expect(patterns).toContain("make clean")
			expect(patterns).toContain("make build")
		})

		it("should handle python scripts with arguments", () => {
			const command = "python3 scripts/deploy.py --env production"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("python3")
			// Should stop after interpreter
			expect(patterns).not.toContain("scripts/deploy.py")
			expect(patterns).not.toContain("--env")
		})

		it("should handle environment variables with commands", () => {
			const command = "NODE_ENV=test npm test && NODE_ENV=production npm start"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm test")
			expect(patterns).toContain("npm start")
			expect(patterns).not.toContain("NODE_ENV=test")
			expect(patterns).not.toContain("NODE_ENV=production")
		})

		it("should handle complex pipe with multiple tools", () => {
			const command = "ps aux | grep node | awk '{print $2}' | xargs kill -9"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("ps")
			expect(patterns).toContain("grep")
			expect(patterns).toContain("awk")
			expect(patterns).toContain("xargs")
			// Note: "xargs kill -9" is parsed as a single command where xargs is the command
			// and "kill -9" are arguments, so kill is not extracted as a separate pattern
			expect(patterns).not.toContain("kill")
			expect(patterns).not.toContain("ps aux")
			expect(patterns).not.toContain("grep node")
			expect(patterns).not.toContain("kill -9")
		})

		it("should handle yarn workspaces commands", () => {
			const command = "yarn workspace @myapp/frontend build"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("yarn")
			expect(patterns).toContain("yarn workspace")
			// Should not include the workspace name
			expect(patterns).not.toContain("@myapp/frontend")
			expect(patterns).not.toContain("build")
		})

		it("should handle pnpm commands", () => {
			const command = "pnpm --filter ./packages/* test"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("pnpm")
			// Should stop at flags
			expect(patterns).not.toContain("pnpm --filter")
			expect(patterns).not.toContain("test")
		})

		it("should handle curl with complex arguments", () => {
			const command =
				"curl -X POST https://api.example.com/data -H 'Content-Type: application/json' -d '{\"key\": \"value\"}'"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("curl")
			// Should stop at flags
			expect(patterns).not.toContain("curl -X")
			expect(patterns).not.toContain("POST")
			expect(patterns).not.toContain("https://api.example.com/data")
		})

		it("should handle ssh commands", () => {
			const command = "ssh user@server.com 'cd /app && npm restart'"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("ssh")
			// Should not include user@server or remote command
			expect(patterns).not.toContain("user@server.com")
			expect(patterns).not.toContain("cd")
			expect(patterns).not.toContain("npm")
		})

		it("should handle rsync commands", () => {
			const command = "rsync -avz --delete ./dist/ user@server:/var/www/html/"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("rsync")
			// Should stop at flags
			expect(patterns).not.toContain("rsync -avz")
			expect(patterns).not.toContain("--delete")
		})

		it("should handle find with exec", () => {
			const command = "find . -name '*.log' -exec rm {} \\;"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("find")
			// Should not include dangerous operations
			expect(patterns).not.toContain("rm")
			expect(patterns).not.toContain("-exec")
		})

		it("should handle systemctl commands", () => {
			const command = "sudo systemctl restart nginx"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("sudo")
			// Note: sudo is the command, systemctl is treated as an argument
			// The parser doesn't have special handling for sudo to extract the actual command
			expect(patterns).not.toContain("systemctl")
			expect(patterns).not.toContain("nginx")
		})

		it("should handle aws cli commands", () => {
			const command = "aws s3 sync ./build s3://my-bucket --delete"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("aws")
			// aws is not in special handling, so behavior may vary
			expect(patterns).not.toContain("--delete")
		})

		it("should handle multiple redirects", () => {
			const command = "echo 'test' > file.txt && cat file.txt >> output.log"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("echo")
			expect(patterns).toContain("cat")
			expect(patterns).not.toContain("echo 'test'")
			expect(patterns).not.toContain("file.txt")
			expect(patterns).not.toContain("output.log")
		})

		it("should handle background processes", () => {
			const command = "npm start & npm run worker &"
			const patterns = extractCommandPatterns(command)

			expect(patterns).toContain("npm")
			expect(patterns).toContain("npm start")
			// Note: The & operator is not in the chainOperators list (only &&, ||, ;, |)
			// So this is parsed as a single command "npm start & npm run worker &"
			// The parser stops at the first & character when parsing "npm start &..."
			expect(patterns).not.toContain("npm run")
		})
	})
})

describe("getPatternDescription", () => {
	it("should describe npm run patterns", () => {
		expect(getPatternDescription("npm run")).toBe("all npm run scripts")
	})

	it("should describe git patterns", () => {
		expect(getPatternDescription("git status")).toBe("git status commands")
	})

	it("should describe script files", () => {
		expect(getPatternDescription("./build.sh")).toBe("this specific script")
	})

	it("should describe cd", () => {
		expect(getPatternDescription("cd")).toBe("directory navigation")
	})

	it("should describe generic commands", () => {
		expect(getPatternDescription("ls")).toBe("ls commands")
	})
})
