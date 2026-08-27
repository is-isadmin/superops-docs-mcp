# SuperOps IT Documentation MCP Server

MCP server for searching, reading, and updating SuperOps IT Documentation via natural language.
Designed to run alongside the [WYRE-AI SuperOps MCP server](https://github.com/WYRE-AI/superops-mcp)
(which handles tickets, assets, and clients).

## Tools

| Tool | Description |
|------|-------------|
| `superops_docs_list` | List all docs, optionally filtered by client name |
| `superops_docs_get` | Get full content of a doc by name or ID |
| `superops_docs_search` | Search docs by keyword (names + content) |
| `superops_docs_update` | Update or append to a doc's content |

## Prerequisites

- Node.js 18+ (for built-in `fetch`)
- Your SuperOps API token (Settings > My Profile > API Token)

## Installation

```bash
# 1. Clone or copy this folder to your machine
git clone <this-repo> superops-docs-mcp
cd superops-docs-mcp

# 2. Install dependencies
npm install

# 3. Build
npm run build
```

## Configuration

Set these environment variables (or put them in a `.env` file):

```bash
export SUPEROPS_API_TOKEN="your-api-token-here"
export SUPEROPS_SUBDOMAIN="superopssubdomainhere"    # your SuperOps subdomain
export SUPEROPS_REGION="us"                      # "us" or "eu"
```

## Running

```bash
# Compiled
npm start

# Or dev mode (no build needed)
npm run dev
```

## Onyx Configuration

In your Onyx MCP settings, add this server alongside the WYRE-AI one:

```json
{
  "mcpServers": {
    "superops-docs": {
      "command": "node",
      "args": ["/path/to/superops-docs-mcp/dist/index.js"],
      "env": {
        "SUPEROPS_API_TOKEN": "your-api-token-here",
        "SUPEROPS_SUBDOMAIN": "subdomain",
        "SUPEROPS_REGION": "us"
      }
    },
    "superops": {
      "command": "npx",
      "args": ["@wyre-ai/superops-mcp"],
      "env": {
        "SUPEROPS_API_TOKEN": "your-api-token-here",
        "SUPEROPS_SUBDOMAIN": "subdomain",
        "SUPEROPS_REGION": "us"
      }
    }
  }
}
```

## Usage Examples (in Onyx or any MCP client)

- "List all docs for CUSTOMER NAME"
- "Get the WireGuard VPN documentation"
- "Search for backup docs"
- "Update the CUSTOMER doc — add note: new firewall installed 2026-08-26"
- "Find docs about printers for CLIENT A"

## How It Works

- Uses the SuperOps GraphQL API (`getItDocumentationList`, `getItDocumentation`, `updateItDocumentation`)
- IT Documentation content is stored in the `udf2rtxt` custom field as HTML
- Content updates use the `{"content": "..."}` JSON wrapper format (verified working)
- Images are embedded as base64 data URIs in the HTML content
