import { describe, it, expect } from "vitest"
import { extractCommandPatterns, extractCommandPattern, getPatternDescription } from "../commandPatterns"

describe("commandPatterns", () => {
	describe("extractCommandPatterns", () => {
		it("should handle empty or null commands", () => {
			expect(extractCommandPatterns("")).toEqual([])
			expect(extractCommandPatterns("   ")).toEqual([])
			expect(extractCommandPatterns(null as any)).toEqual([])
			expect(extractCommandPatterns(undefined as any)).toEqual([])
		})

		it("should extract simple commands", () => {
			expect(extractCommandPatterns("ls")).toEqual(["ls"])
			expect(extractCommandPatterns("pwd")).toEqual(["pwd"])
			expect(extractCommandPatterns("echo hello")).toEqual(["echo"])
		})

		it("should handle npm commands correctly", () => {
			expect(extractCommandPatterns("npm install")).toEqual(["npm install"])
			expect(extractCommandPatterns("npm run build")).toEqual(["npm run"])
			expect(extractCommandPatterns("npm run test:unit")).toEqual(["npm run"])
			expect(extractCommandPatterns("npm test")).toEqual(["npm test"])
			expect(extractCommandPatterns("npm run build -- --watch")).toEqual(["npm run"])
		})

		it("should handle yarn/pnpm/bun commands", () => {
			expect(extractCommandPatterns("yarn install")).toEqual(["yarn install"])
			expect(extractCommandPatterns("pnpm run dev")).toEqual(["pnpm run"])
			expect(extractCommandPatterns("bun test")).toEqual(["bun test"])
		})

		it("should handle git commands", () => {
			expect(extractCommandPatterns("git status")).toEqual(["git status"])
			expect(extractCommandPatterns('git commit -m "message"')).toEqual(["git commit"])
			expect(extractCommandPatterns("git push origin main")).toEqual(["git push"])
			expect(extractCommandPatterns("git log --oneline")).toEqual(["git log"])
		})

		it("should handle docker/kubectl/helm commands", () => {
			expect(extractCommandPatterns("docker run nginx")).toEqual(["docker run"])
			expect(extractCommandPatterns("kubectl get pods")).toEqual(["kubectl get"])
			expect(extractCommandPatterns("helm install myapp ./chart")).toEqual(["helm install"])
		})

		it("should handle make commands", () => {
			expect(extractCommandPatterns("make build")).toEqual(["make build"])
			expect(extractCommandPatterns("make test")).toEqual(["make test"])
			expect(extractCommandPatterns("make -j4 all")).toEqual(["make"])
		})

		it("should handle interpreter commands", () => {
			expect(extractCommandPatterns("python script.py")).toEqual(["python"])
			expect(extractCommandPatterns("python3 -m venv env")).toEqual(["python3"])
			expect(extractCommandPatterns("node index.js --port 3000")).toEqual(["node"])
			expect(extractCommandPatterns("ruby app.rb")).toEqual(["ruby"])
		})

		it("should handle dangerous commands", () => {
			expect(extractCommandPatterns("rm -rf node_modules")).toEqual(["rm"])
			expect(extractCommandPatterns("chmod 755 script.sh")).toEqual(["chmod"])
			expect(extractCommandPatterns('find . -name "*.log" -delete')).toEqual(["find"])
		})

		it("should handle cd commands", () => {
			expect(extractCommandPatterns("cd /home/user")).toEqual(["cd"])
			expect(extractCommandPatterns("cd ..")).toEqual(["cd"])
			expect(extractCommandPatterns("cd ~/projects")).toEqual(["cd"])
		})

		it("should handle chained commands with &&", () => {
			const patterns = extractCommandPatterns("npm install && npm run build")
			expect(patterns).toEqual(["npm install", "npm run"])
		})

		it("should handle chained commands with ||", () => {
			const patterns = extractCommandPatterns('npm test || echo "Tests failed"')
			expect(patterns).toEqual(["echo", "npm test"])
		})

		it("should handle chained commands with ;", () => {
			const patterns = extractCommandPatterns("cd /tmp; ls -la; pwd")
			expect(patterns).toEqual(["cd", "ls", "pwd"])
		})

		it("should handle piped commands", () => {
			const patterns = extractCommandPatterns("ps aux | grep node")
			expect(patterns).toEqual(["grep", "ps"])
		})

		it("should handle complex chained commands", () => {
			const patterns = extractCommandPatterns('git pull && npm install && npm run build || echo "Build failed"')
			expect(patterns).toEqual(["echo", "git pull", "npm install", "npm run"])
		})

		it("should handle quoted arguments correctly", () => {
			expect(extractCommandPatterns('echo "hello world"')).toEqual(["echo"])
			expect(extractCommandPatterns("echo 'hello world'")).toEqual(["echo"])
			expect(extractCommandPatterns('git commit -m "feat: add new feature"')).toEqual(["git commit"])
		})

		it("should handle escaped characters", () => {
			expect(extractCommandPatterns("echo hello\\ world")).toEqual(["echo"])
			expect(extractCommandPatterns('echo "hello \\"world\\""')).toEqual(["echo"])
		})

		it("should handle environment variables", () => {
			expect(extractCommandPatterns("NODE_ENV=production npm start")).toEqual(["npm start"])
			expect(extractCommandPatterns("PORT=3000 node server.js")).toEqual(["node"])
		})

		it("should handle script files", () => {
			expect(extractCommandPatterns("./deploy.sh")).toEqual(["./deploy.sh"])
			expect(extractCommandPatterns("/usr/local/bin/script.py")).toEqual(["/usr/local/bin/script.py"])
			expect(extractCommandPatterns("./scripts/test.js --verbose")).toEqual(["./scripts/test.js"])
		})

		it("should handle complex npm scripts", () => {
			expect(extractCommandPatterns("npm run build:prod -- --source-maps")).toEqual(["npm run"])
			expect(extractCommandPatterns("npm run test:coverage -- --watch")).toEqual(["npm run"])
		})

		it("should return unique sorted patterns", () => {
			const patterns = extractCommandPatterns("npm install && npm install && npm run build")
			expect(patterns).toEqual(["npm install", "npm run"])
		})

		it("should handle commands with glob patterns", () => {
			expect(extractCommandPatterns("rm *.log")).toEqual(["rm"])
			expect(extractCommandPatterns("ls *.{js,ts}")).toEqual(["ls"])
		})

		it("should handle commands with redirects", () => {
			expect(extractCommandPatterns('echo "test" > file.txt')).toEqual(["echo"])
			expect(extractCommandPatterns("cat file.txt >> output.log")).toEqual(["cat"])
		})

		it("should handle subshells and command substitution", () => {
			expect(extractCommandPatterns("echo $(date)")).toEqual(["echo"])
			expect(extractCommandPatterns("echo `pwd`")).toEqual(["echo"])
		})
	})

	describe("extractCommandPattern", () => {
		it("should return the first pattern for backward compatibility", () => {
			expect(extractCommandPattern("npm install && npm run build")).toBe("npm install")
			expect(extractCommandPattern("git status")).toBe("git status")
			expect(extractCommandPattern("")).toBe("")
		})
	})

	describe("getPatternDescription", () => {
		it("should describe npm patterns", () => {
			expect(getPatternDescription("npm run")).toBe("all npm run scripts")
			expect(getPatternDescription("npm install")).toBe("npm install commands")
			expect(getPatternDescription("npm test")).toBe("npm test commands")
		})

		it("should describe git patterns", () => {
			expect(getPatternDescription("git commit")).toBe("git commit commands")
			expect(getPatternDescription("git push")).toBe("git push commands")
		})

		it("should describe script files", () => {
			expect(getPatternDescription("./deploy.sh")).toBe("this specific script")
			expect(getPatternDescription("/usr/bin/script.py")).toBe("this specific script")
		})

		it("should describe interpreter patterns", () => {
			expect(getPatternDescription("python")).toBe("python scripts")
			expect(getPatternDescription("node")).toBe("node scripts")
			expect(getPatternDescription("ruby")).toBe("ruby scripts")
		})

		it("should describe docker/kubectl patterns", () => {
			expect(getPatternDescription("docker run")).toBe("docker run commands")
			expect(getPatternDescription("kubectl get")).toBe("kubectl get commands")
		})

		it("should describe make patterns", () => {
			expect(getPatternDescription("make build")).toBe("make build target")
			expect(getPatternDescription("make test")).toBe("make test target")
		})

		it("should describe cd pattern", () => {
			expect(getPatternDescription("cd")).toBe("directory navigation")
		})

		it("should handle empty patterns", () => {
			expect(getPatternDescription("")).toBe("")
		})

		it("should provide default description", () => {
			expect(getPatternDescription("custom-command")).toBe("custom-command commands")
		})
	})
})
