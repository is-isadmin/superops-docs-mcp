# SuperOps Docs MCP Server — Complete Setup Guide for Onyx

## The Big Picture

You do NOT need a separate agent per MCP server. In Onyx, you create ONE "custom agent" and attach multiple MCP servers to it. The LLM sees ALL tools from ALL attached servers and automatically picks the right one based on what the user asks.

```
User: "Get me the VPN docs for RC Lurie"
        ↓
  Onyx Agent (has tools from BOTH MCP servers)
        ↓
  LLM decides: "This is a doc question → use superops_docs_get"
        ↓
  Calls the superops-docs-mcp server → returns content
        ↓
  LLM formats the answer for the user
```

If the user asks "show me open tickets for RC Lurie", the LLM picks a tool from the WYRE-AI server instead. One agent, many tools, automatic routing by the LLM.

---

## Step 1: Deploy the SuperOps Docs MCP Server

### Option A: Docker (recommended for datacenter)

```bash
# 1. Copy the superops-docs-mcp folder to your server
scp -r superops-docs-mcp/ onyx@your-server:/opt/

# 2. Set your API token
cd /opt/superops-docs-mcp
echo "SUPEROPS_API_TOKEN=your-actual-token-here" > .env

# 3. Build and run
docker compose up -d

# 4. Verify it's running
curl http://localhost:8082/mcp
# Should return a response (not connection refused)
```

### Option B: Systemd (if running directly on the host)

```bash
# 1. Copy files and install
scp -r superops-docs-mcp/ onyx@your-server:/opt/superops-docs-mcp
cd /opt/superops-docs-mcp
npm install
npm run build

# 2. Edit the service file with your API token
nano superops-docs-mcp.service
# Change: Environment=SUPEROPS_API_TOKEN=your-api-token-here
# To:     Environment=SUPEROPS_API_TOKEN=actual-token-here

# 3. Install the service
sudo cp superops-docs-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable superops-docs-mcp
sudo systemctl start superops-docs-mcp

# 4. Verify
systemctl status superops-docs-mcp
curl http://localhost:8082/mcp
```

### Option C: Quick test (no Docker, no systemd)

```bash
cd superops-docs-mcp
npm install
npm run build

export SUPEROPS_API_TOKEN="your-token"
export SUPEROPS_SUBDOMAIN="infinitysolutions"
export SUPEROPS_REGION="us"

# Start in HTTP mode on port 8082
npx mcp-proxy --port 8082 -- node dist/index.js
```

---

## Step 2: Deploy the WYRE-AI SuperOps MCP Server (tickets/assets)

This one also needs HTTP mode for Onyx. If you used Docker Compose above, it's already included as a second service on port 8083.

If running manually:

```bash
# Install the WYRE-AI server + proxy globally
npm install -g @wyre-ai/superops-mcp mcp-proxy

export SUPEROPS_API_TOKEN="your-token"
export SUPEROPS_SUBDOMAIN="infinitysolutions"
export SUPEROPS_REGION="us"

# Start in HTTP mode on port 8083
mcp-proxy --port 8083 -- npx @wyre-ai/superops-mcp
```

---

## Step 3: Add Both MCP Servers to Onyx

1. Log into your Onyx admin panel
2. Click your profile icon → **Admin Panel**
3. In the sidebar, click **MCP Actions**
4. Click **Add MCP Server**

### First server — IT Documentation:
| Field | Value |
|------|-------|
| Server Name | `superops-docs` |
| Description | SuperOps IT Documentation — search, read, update docs |
| MCP Server URL | `http://127.0.0.1:8082/mcp` (if same machine) or `http://<server-ip>:8082/mcp` |
| Auth Type | No Auth (the server uses API token internally) |

Click **Add Server**, then **Connect**.

### Second server — Tickets/Assets:
| Field | Value |
|------|-------|
| Server Name | `superops-tickets` |
| Description | SuperOps tickets, assets, clients |
| MCP Server URL | `http://127.0.0.1:8083/mcp` (if same machine) or `http://<server-ip>:8083/mcp` |
| Auth Type | No Auth |

Click **Add Server**, then **Connect**.

After connecting each server, Onyx will show you the list of tools it found. Make sure all tools are enabled (they are by default).

---

## Step 4: Create Your Master Agent in Onyx

This is the key — ONE agent with access to BOTH MCP servers.

1. In Onyx admin panel, go to **Custom Agents** (or **Assistants**)
2. Click **Create New Agent**
3. Configure:

| Field | Value |
|------|-------|
| Name | Infinity MSP Assistant |
| Description | Central IT operations assistant — docs, tickets, assets, billing |
| LLM | Claude 3.5 Sonnet or GPT-4o (pick whatever you have configured) |
| System Prompt | See below |
| Tools/Actions | Select ALL tools from both `superops-docs` and `superops-tickets` |

### Suggested System Prompt:

```
You are the IT operations assistant for Infinity Solutions, an MSP.
You have access to SuperOps IT Documentation and SuperOps tickets/assets.

When a user asks about documentation, VPN configs, network setups, 
printer info, or any client documentation, use the superops_docs_* tools.

When a user asks about tickets, assets, or client info, use the 
superops_* tools from the tickets server.

If a user asks to update documentation, always show the current 
content first and confirm the change before updating.

Be concise and technical. These are IT professionals.
```

4. Save the agent
5. Assign it to your team (via Groups/Permissions)

---

## Step 5: Test It

Open a chat with your new agent and try:

- "List all docs for RC Lurie"
- "Get the WireGuard VPN documentation"  
- "Search for backup docs"
- "Show me open tickets for ESD"

The agent will automatically route to the right MCP server based on what you asked.

---

## Architecture Summary

```
┌─────────────────────────────────────────┐
│           Onyx (self-hosted)             │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │   Master Agent (1 agent)         │    │
│  │   - LLM decides which tool       │    │
│  │   - Has ALL tools from both MCP  │    │
│  └──────┬───────────────┬──────────┘    │
│         │               │               │
│         ▼               ▼               │
│  ┌──────────┐    ┌──────────────┐        │
│  │HTTP :8082│    │HTTP :8083    │        │
│  │docs MCP  │    │tickets MCP   │        │
│  │(custom)  │    │(WYRE-AI)     │        │
│  └────┬─────┘    └──────┬───────┘        │
│       │                 │                │
└───────┼─────────────────┼────────────────┘
        │                 │
        ▼                 ▼
   ┌──────────────────────────┐
   │   SuperOps API            │
   │   api.superops.ai/msp     │
   │   (infinitysolutions)     │
   └──────────────────────────┘
```

## Troubleshooting

**Onyx can't connect to MCP server:**
- Check the server is running: `curl http://localhost:8082/mcp`
- Check firewall rules allow access to port 8082/8083
- If Onyx is in Docker, use `http://host.docker.internal:8082/mcp` or the host IP

**Tools not showing up in Onyx:**
- After clicking Connect, check Onyx admin → MCP Actions → click the server name to see discovered tools
- Make sure tools are enabled (checkboxes)

**MCP server can't reach SuperOps:**
- Verify the API token: `export SUPEROPS_API_TOKEN=...` 
- Test: `curl -H "Authorization: Bearer $TOKEN" -H "CustomerSubDomain: infinitysolutions" -H "Content-Type: application/json" -d '{"query":"{ getItDocumentationList(input: {typeId: \"724723857456487547\", listInfo: {page: 1, pageSize: 1}}) { documents { name } } }"}' https://api.superops.ai/msp`

**mcp-proxy not found:**
- Run `npm install -g mcp-proxy` or use `npx mcp-proxy`
