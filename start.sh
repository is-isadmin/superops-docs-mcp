#!/bin/bash
# SuperOps IT Documentation MCP Server - HTTP mode for Onyx
# This script starts the MCP server in HTTP transport mode using mcp-proxy

# Load environment variables
export SUPEROPS_API_TOKEN="${SUPEROPS_API_TOKEN:-your-api-token-here}"
export SUPEROPS_SUBDOMAIN="${SUPEROPS_SUBDOMAIN:-infinitysolutions}"
export SUPEROPS_REGION="${SUPEROPS_REGION:-us}"

PORT="${MCP_PORT:-8082}"

echo "Starting SuperOps Docs MCP server on port $PORT..."
echo "  Subdomain: $SUPEROPS_SUBDOMAIN"
echo "  Region: $SUPEROPS_REGION"
echo "  Endpoint: http://0.0.0.0:$PORT/mcp"

npx mcp-proxy --port "$PORT" -- node dist/index.js
