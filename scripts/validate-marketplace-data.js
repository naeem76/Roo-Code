#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const yaml = require("yaml")

// Simple validation script for marketplace data
async function validateMarketplaceData() {
	try {
		const mcpsPath = path.join(__dirname, "../data/marketplace/mcps.yaml")

		if (!fs.existsSync(mcpsPath)) {
			console.error("❌ mcps.yaml file not found")
			process.exit(1)
		}

		const mcpsContent = fs.readFileSync(mcpsPath, "utf8")
		const mcpsData = yaml.parse(mcpsContent)

		// Basic validation
		if (!mcpsData || !mcpsData.items || !Array.isArray(mcpsData.items)) {
			console.error("❌ Invalid YAML structure: missing items array")
			process.exit(1)
		}

		console.log(`✅ Found ${mcpsData.items.length} MCP server(s)`)

		// Validate each item
		for (const item of mcpsData.items) {
			console.log(`\n📦 Validating: ${item.name || item.id}`)

			// Required fields
			const requiredFields = ["id", "name", "description", "url", "content"]
			for (const field of requiredFields) {
				if (!item[field]) {
					console.error(`❌ Missing required field: ${field}`)
					process.exit(1)
				}
			}

			// Validate content structure
			if (Array.isArray(item.content)) {
				for (const method of item.content) {
					if (!method.name || !method.content) {
						console.error(`❌ Invalid installation method: missing name or content`)
						process.exit(1)
					}

					// Try to parse the JSON content
					try {
						JSON.parse(method.content)
						console.log(`  ✅ ${method.name}: Valid JSON configuration`)
					} catch (e) {
						console.error(`❌ ${method.name}: Invalid JSON configuration`)
						console.error(e.message)
						process.exit(1)
					}
				}
			}

			console.log(`  ✅ ${item.id}: All validations passed`)
		}

		console.log("\n🎉 All marketplace data is valid!")
	} catch (error) {
		console.error("❌ Validation failed:", error.message)
		process.exit(1)
	}
}

validateMarketplaceData()
