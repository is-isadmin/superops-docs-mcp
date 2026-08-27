#!/usr/bin/env node
/**
 * SuperOps IT Documentation MCP Server
 *
 * Provides natural-language tools for searching, reading, and updating
 * SuperOps IT Documentation via the Model Context Protocol.
 *
 * Tools:
 *   - superops_docs_list    : List all docs, optionally filtered by client
 *   - superops_docs_get      : Get full content of a specific doc
 *   - superops_docs_search   : Search docs by keyword (matches name and content)
 *   - superops_docs_update   : Update a doc's content
 *
 * Env vars:
 *   SUPEROPS_API_TOKEN    - Your SuperOps API token
 *   SUPEROPS_SUBDOMAIN    - Your SuperOps subdomain (e.g., infinitysolutions)
 *   SUPEROPS_REGION       - "us" (default) or "eu"
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
// ─── Configuration ───────────────────────────────────────────────────────────
const API_TOKEN = process.env.SUPEROPS_API_TOKEN || "";
const SUBDOMAIN = process.env.SUPEROPS_SUBDOMAIN || "";
const REGION = process.env.SUPEROPS_REGION || "us";
const API_URL = REGION === "eu"
    ? "https://api.eu.superops.ai/msp"
    : "https://api.superops.ai/msp";
// IT Documentation type ID (Knowledge Base category in SuperOps)
const IT_DOC_TYPE_ID = "724723857456487547";
// ─── GraphQL Client ──────────────────────────────────────────────────────────
async function gql(query, variables) {
    const body = { query };
    if (variables)
        body.variables = variables;
    const resp = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "CustomerSubDomain": SUBDOMAIN,
            "Authorization": `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`SuperOps API error ${resp.status}: ${text.slice(0, 500)}`);
    }
    const json = await resp.json();
    if (json.errors?.length) {
        const messages = json.errors.map((e) => e.message).join("; ");
        throw new Error(`GraphQL errors: ${messages}`);
    }
    return json.data;
}
// ─── Helpers ────────────────────────────────────────────────────────────────
/** Strip HTML tags to plain text for search/display. */
function stripHtml(html) {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}
/** Extract text content from customFields.udf2rtxt (which is {content: "..."} or a string). */
function extractContent(customFields) {
    if (!customFields)
        return "";
    const udf = customFields.udf2rtxt;
    if (!udf)
        return "";
    if (typeof udf === "string")
        return udf;
    if (udf.content)
        return udf.content;
    return JSON.stringify(udf);
}
/** Get client name from the client JSON field. */
function getClientName(client) {
    if (!client)
        return "Unknown";
    if (typeof client === "string")
        return client;
    return client.name || "Unknown";
}
// ─── GraphQL Operations ──────────────────────────────────────────────────────
const LIST_DOCS_QUERY = `
  query ListDocs($typeId: ID!, $page: Int, $pageSize: Int) {
    getItDocumentationList(input: {
      typeId: $typeId,
      listInfo: { page: $page, pageSize: $pageSize }
    }) {
      documents {
        itDocId
        name
        client
      }
      listInfo {
        totalCount
        hasMore
        page
      }
    }
  }
`;
const GET_DOC_QUERY = `
  query GetDoc($itDocId: ID!) {
    getItDocumentation(input: { itDocId: $itDocId }) {
      itDocId
      name
      client
      customFields
    }
  }
`;
const UPDATE_DOC_MUTATION = `
  mutation UpdateDoc($input: UpdateItDocumentationInput!) {
    updateItDocumentation(input: $input) {
      itDocId
      name
    }
  }
`;
// ─── Tool Definitions ────────────────────────────────────────────────────────
const TOOLS = [
    {
        name: "superops_docs_list",
        description: "List all IT Documentation documents in SuperOps. Optionally filter by client name. " +
            "Returns doc ID, name, and client for each document. Use this when the user asks " +
            "to list, browse, or find documents for a specific client.",
        inputSchema: {
            type: "object",
            properties: {
                client: {
                    type: "string",
                    description: "Optional: filter to a specific client name (partial match, case-insensitive). " +
                        "E.g., 'rc lurie', 'esd', 'infinity'.",
                },
                page: {
                    type: "number",
                    description: "Page number (default 1)",
                },
                pageSize: {
                    type: "number",
                    description: "Page size (default 500, max 500)",
                },
            },
        },
    },
    {
        name: "superops_docs_get",
        description: "Get the full content of a specific IT Documentation document. " +
            "Returns the doc name, client, and the full HTML content (which may include " +
            "embedded base64 images). Use this when the user wants to read or view a document. " +
            "You can find the doc by name (partial match) or by exact ID.",
        inputSchema: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Document name to search for (partial match, case-insensitive). " +
                        "E.g., 'wireguard vpn', 'tucson', 'backup'.",
                },
                docId: {
                    type: "string",
                    description: "Exact document ID (from superops_docs_list).",
                },
                client: {
                    type: "string",
                    description: "Optional: narrow search to a specific client name (partial match).",
                },
                plainText: {
                    type: "boolean",
                    description: "If true, return plain text instead of HTML (default: true for readability).",
                },
            },
        },
    },
    {
        name: "superops_docs_search",
        description: "Search IT Documentation by keyword. Searches across both document names and " +
            "content. Returns matching documents with a content snippet showing the match. " +
            "Use this when the user asks 'find docs about X' or 'search for Y'.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query (searches doc names and content, case-insensitive). " +
                        "E.g., 'vpn', 'backup', 'printer', 'wifi password'.",
                },
                client: {
                    type: "string",
                    description: "Optional: narrow search to a specific client name (partial match).",
                },
                limit: {
                    type: "number",
                    description: "Max results to return (default 20).",
                },
            },
            required: ["query"],
        },
    },
    {
        name: "superops_docs_update",
        description: "Update the content of an existing IT Documentation document in SuperOps. " +
            "The content should be valid HTML. Use this when the user wants to modify, " +
            "update, or add to a document. Always show the user the current content first " +
            "and confirm the change before updating.",
        inputSchema: {
            type: "object",
            properties: {
                docId: {
                    type: "string",
                    description: "The exact document ID to update (from superops_docs_list or search).",
                },
                name: {
                    type: "string",
                    description: "Document name to find (partial match). Use if docId is not known.",
                },
                client: {
                    type: "string",
                    description: "Optional: narrow name search to a specific client.",
                },
                content: {
                    type: "string",
                    description: "The new HTML content for the document. Can include tags like <p>, <table>, " +
                        "<h1>, <img>, <br>, <strong>, <a>, etc. For images, use base64 data URIs: " +
                        '<img src="data:image/png;base64,..." />',
                },
                append: {
                    type: "boolean",
                    description: "If true, append the content to the existing document instead of replacing. " +
                        "Default: false (replace).",
                },
            },
            required: ["content"],
        },
    },
];
// ─── Tool Handlers ───────────────────────────────────────────────────────────
async function handleListDocs(args) {
    const page = args.page || 1;
    const pageSize = args.pageSize || 500;
    const data = await gql(LIST_DOCS_QUERY, {
        typeId: IT_DOC_TYPE_ID,
        page,
        pageSize,
    });
    let docs = data?.getItDocumentationList?.documents || [];
    const totalCount = data?.getItDocumentationList?.listInfo?.totalCount || docs.length;
    // Filter by client if provided
    if (args.client) {
        const filter = args.client.toLowerCase();
        docs = docs.filter((d) => getClientName(d.client).toLowerCase().includes(filter));
    }
    const formatted = docs.map((d) => ({
        id: d.itDocId,
        name: d.name,
        client: getClientName(d.client),
    }));
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    total: totalCount,
                    returned: formatted.length,
                    documents: formatted,
                }, null, 2),
            },
        ],
    };
}
async function handleGetDoc(args) {
    let docId = args.docId;
    // If no docId, search by name
    if (!docId && args.name) {
        const data = await gql(LIST_DOCS_QUERY, {
            typeId: IT_DOC_TYPE_ID,
            page: 1,
            pageSize: 500,
        });
        let docs = data?.getItDocumentationList?.documents || [];
        // Filter by client if provided
        if (args.client) {
            const filter = args.client.toLowerCase();
            docs = docs.filter((d) => getClientName(d.client).toLowerCase().includes(filter));
        }
        // Match by name (partial, case-insensitive)
        const nameFilter = args.name.toLowerCase();
        const matches = docs.filter((d) => d.name.toLowerCase().includes(nameFilter));
        if (matches.length === 0) {
            return {
                content: [{ type: "text", text: `No documents found matching "${args.name}"` }],
                isError: true,
            };
        }
        if (matches.length === 1) {
            docId = matches[0].itDocId;
        }
        else {
            // Multiple matches — list them
            const list = matches.map((d) => ({
                id: d.itDocId,
                name: d.name,
                client: getClientName(d.client),
            }));
            return {
                content: [
                    {
                        type: "text",
                        text: `Found ${matches.length} documents matching "${args.name}". Please specify which one:\n\n${JSON.stringify(list, null, 2)}`,
                    },
                ],
            };
        }
    }
    if (!docId) {
        return {
            content: [{ type: "text", text: "Please provide either a docId or a name to find the document." }],
            isError: true,
        };
    }
    const data = await gql(GET_DOC_QUERY, { itDocId: docId });
    const doc = data?.getItDocumentation;
    if (!doc) {
        return {
            content: [{ type: "text", text: `Document not found (ID: ${docId})` }],
            isError: true,
        };
    }
    const htmlContent = extractContent(doc.customFields);
    const plainText = args.plainText !== false; // default true
    const result = {
        id: doc.itDocId,
        name: doc.name,
        client: getClientName(doc.client),
        contentLength: htmlContent.length,
        content: plainText ? stripHtml(htmlContent) : htmlContent,
    };
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(result, null, 2).slice(0, 100000), // cap to avoid huge payloads
            },
        ],
    };
}
async function handleSearchDocs(args) {
    const query = args.query.toLowerCase();
    const limit = args.limit || 20;
    // First, find docs by name match
    const data = await gql(LIST_DOCS_QUERY, {
        typeId: IT_DOC_TYPE_ID,
        page: 1,
        pageSize: 500,
    });
    let docs = data?.getItDocumentationList?.documents || [];
    // Filter by client if provided
    if (args.client) {
        const filter = args.client.toLowerCase();
        docs = docs.filter((d) => getClientName(d.client).toLowerCase().includes(filter));
    }
    // Match by name first (fast)
    const nameMatches = docs.filter((d) => d.name.toLowerCase().includes(query));
    // For content search, we need to fetch each doc's content
    // This is expensive, so we limit to docs that don't match by name
    // and only fetch the first 50 for content search
    const results = [];
    // Add name matches first
    for (const d of nameMatches) {
        results.push({
            id: d.itDocId,
            name: d.name,
            client: getClientName(d.client),
            matchedOn: "name",
        });
    }
    // Search content for non-name-matched docs (up to 50)
    const contentCandidates = docs.filter((d) => !d.name.toLowerCase().includes(query));
    // Fetch content in parallel (batches of 10)
    const batchSize = 10;
    for (let i = 0; i < Math.min(contentCandidates.length, 50) && results.length < limit; i += batchSize) {
        const batch = contentCandidates.slice(i, i + batchSize);
        const contents = await Promise.all(batch.map(async (d) => {
            try {
                const cData = await gql(GET_DOC_QUERY, { itDocId: d.itDocId });
                const doc = cData?.getItDocumentation;
                if (!doc)
                    return null;
                const content = extractContent(doc.customFields);
                const plain = stripHtml(content).toLowerCase();
                return { doc: d, content, plain };
            }
            catch {
                return null;
            }
        }));
        for (const item of contents) {
            if (!item || results.length >= limit)
                continue;
            if (item.plain.includes(query)) {
                // Find the snippet around the match
                const idx = item.plain.indexOf(query);
                const start = Math.max(0, idx - 50);
                const snippet = item.plain.slice(start, idx + query.length + 100);
                results.push({
                    id: item.doc.itDocId,
                    name: item.doc.name,
                    client: getClientName(item.doc.client),
                    matchedOn: "content",
                    snippet: snippet.trim(),
                });
            }
        }
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    query: args.query,
                    results: results.length,
                    documents: results,
                }, null, 2),
            },
        ],
    };
}
async function handleUpdateDoc(args) {
    let docId = args.docId;
    // If no docId, find by name
    if (!docId && args.name) {
        const data = await gql(LIST_DOCS_QUERY, {
            typeId: IT_DOC_TYPE_ID,
            page: 1,
            pageSize: 500,
        });
        let docs = data?.getItDocumentationList?.documents || [];
        if (args.client) {
            const filter = args.client.toLowerCase();
            docs = docs.filter((d) => getClientName(d.client).toLowerCase().includes(filter));
        }
        const nameFilter = args.name.toLowerCase();
        const matches = docs.filter((d) => d.name.toLowerCase().includes(nameFilter));
        if (matches.length === 0) {
            return {
                content: [{ type: "text", text: `No documents found matching "${args.name}"` }],
                isError: true,
            };
        }
        if (matches.length === 1) {
            docId = matches[0].itDocId;
        }
        else {
            const list = matches.map((d) => ({
                id: d.itDocId,
                name: d.name,
                client: getClientName(d.client),
            }));
            return {
                content: [
                    {
                        type: "text",
                        text: `Found ${matches.length} documents matching "${args.name}". Please specify which one:\n\n${JSON.stringify(list, null, 2)}`,
                    },
                ],
            };
        }
    }
    if (!docId) {
        return {
            content: [{ type: "text", text: "Please provide either a docId or a name to find the document to update." }],
            isError: true,
        };
    }
    let content = args.content;
    // If append, get existing content and append
    if (args.append) {
        const existing = await gql(GET_DOC_QUERY, { itDocId: docId });
        const doc = existing?.getItDocumentation;
        if (doc) {
            const existingContent = extractContent(doc.customFields);
            content = existingContent + "\n" + content;
        }
    }
    const data = await gql(UPDATE_DOC_MUTATION, {
        input: {
            itDocId: docId,
            typeId: IT_DOC_TYPE_ID,
            customFields: {
                udf2rtxt: { content: content },
            },
        },
    });
    if (data?.updateItDocumentation) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        docId: data.updateItDocumentation.itDocId,
                        name: data.updateItDocumentation.name,
                        contentLength: content.length,
                        action: args.append ? "appended" : "updated",
                    }, null, 2),
                },
            ],
        };
    }
    return {
        content: [{ type: "text", text: "Failed to update document. The API returned no data." }],
        isError: true,
    };
}
// ─── Server Setup ────────────────────────────────────────────────────────────
const server = new Server({ name: "superops-docs-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
}));
// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "superops_docs_list":
                return await handleListDocs(args);
            case "superops_docs_get":
                return await handleGetDoc(args);
            case "superops_docs_search":
                return await handleSearchDocs(args);
            case "superops_docs_update":
                return await handleUpdateDoc(args);
            default:
                return {
                    content: [{ type: "text", text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});
// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    if (!API_TOKEN) {
        console.error("Error: SUPEROPS_API_TOKEN environment variable is required.");
        process.exit(1);
    }
    if (!SUBDOMAIN) {
        console.error("Error: SUPEROPS_SUBDOMAIN environment variable is required.");
        process.exit(1);
    }
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("SuperOps IT Documentation MCP server running on stdio.");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
