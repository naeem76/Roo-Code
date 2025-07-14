# Marketplace Data

This directory contains static marketplace data files that can be used to update the external marketplace API at `https://app.roocode.com/api/marketplace/`.

## Structure

- `mcps.yaml` - Contains MCP (Model Context Protocol) server configurations
- `modes.yaml` - Contains mode configurations (if needed in the future)

## Format

The YAML files follow the schema defined in `packages/types/src/marketplace.ts`:

### MCP Servers (`mcps.yaml`)

```yaml
items:
    - id: "unique-server-id"
      name: "Display Name"
      description: "Server description"
      author: "Author Name"
      authorUrl: "https://github.com/author"
      url: "https://github.com/author/repo"
      tags: ["tag1", "tag2"]
      prerequisites: ["requirement1", "requirement2"]
      content:
          - name: "Installation Method Name"
            content: |
                {
                  "mcpServers": {
                    "server-id": {
                      "command": "command",
                      "args": ["arg1", "arg2"],
                      "env": {
                        "VAR": "{{PARAMETER_KEY}}"
                      }
                    }
                  }
                }
            parameters:
                - name: "Parameter Display Name"
                  key: "PARAMETER_KEY"
                  placeholder: "example-value"
                  optional: false
            prerequisites:
                - "Method-specific requirement"
```

## Adding New Items

1. Add the new item to the appropriate YAML file
2. Ensure the configuration follows the schema
3. Test the configuration locally if possible
4. Update the external API with the new data

## Schema Validation

The configurations are validated against Zod schemas defined in:

- `packages/types/src/marketplace.ts`

## Current Items

### MCP Servers

- **n8n-mcp**: Model Context Protocol server for n8n workflow automation platform
