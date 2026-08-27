#!/bin/bash
# Run this ON your 10.10.85.215 box, inside /opt/mcp/superops-docs/
# after copying package.json, tsconfig.json, src/, Dockerfile from this folder there.

set -e

echo "Building superops-docs-mcp image..."
docker build -t superops-docs-mcp:latest .

echo "Stopping any existing container..."
docker stop superops-docs-mcp 2>/dev/null || true
docker rm superops-docs-mcp 2>/dev/null || true

echo "Starting container on port 8082..."
docker run -d \
  --name superops-docs-mcp \
  -p 8082:8082 \
  --restart unless-stopped \
  -e SUPEROPS_API_TOKEN="${SUPEROPS_API_TOKEN}" \
  -e SUPEROPS_SUBDOMAIN="infinitysolutions" \
  -e SUPEROPS_REGION="us" \
  superops-docs-mcp:latest

echo ""
echo "Done. Checking status..."
sleep 3
docker ps --filter "name=superops-docs-mcp"
echo ""
echo "Test with: curl http://localhost:8082/mcp"
