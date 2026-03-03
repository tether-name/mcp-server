import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TetherClient } from "tether-name";
import { z } from "zod";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "tether-name-mcp-server",
    version: "2.0.4",
  });

  function getSigningClient(): TetherClient {
    const agentId = process.env.TETHER_AGENT_ID;
    const privateKeyPath = process.env.TETHER_PRIVATE_KEY_PATH;

    if (!agentId) {
      throw new Error(
        "TETHER_AGENT_ID environment variable is required"
      );
    }
    if (!privateKeyPath) {
      throw new Error(
        "TETHER_PRIVATE_KEY_PATH environment variable is required"
      );
    }

    return new TetherClient({
      agentId,
      privateKeyPath,
    });
  }

  function getChallengeClient(): TetherClient {
    // No agent ID or private key needed for requesting challenges.
    return new TetherClient({});
  }

  function getManagementClient(): TetherClient {
    const apiKey = process.env.TETHER_API_KEY;

    if (!apiKey) {
      throw new Error(
        "TETHER_API_KEY environment variable is required for management operations"
      );
    }

    return new TetherClient({
      apiKey,
    });
  }

  function getManagementApiConfig(): { apiKey: string; baseUrl: string } {
    const apiKey = process.env.TETHER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "TETHER_API_KEY environment variable is required for management operations"
      );
    }

    const baseUrl = process.env.TETHER_API_URL || "https://api.tether.name";
    return { apiKey, baseUrl };
  }

  async function managementFetch(path: string, init: RequestInit = {}): Promise<unknown> {
    const { apiKey, baseUrl } = getManagementApiConfig();

    const headers = {
      ...(init.headers || {}),
      Authorization: `Bearer ${apiKey}`,
    } as Record<string, string>;

    if (init.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${response.statusText}${text ? `: ${text}` : ""}`);
    }

    return response.json();
  }

  server.registerTool(
    "verify_identity",
    {
      description:
        "Perform complete identity verification in one call. Requests a challenge, signs it with the configured private key, and submits the proof to tether.name for verification.",
    },
    async () => {
      try {
        const client = getSigningClient();
        const result = await client.verify();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Verification failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "request_challenge",
    {
      description:
        "Request a new challenge string from the tether.name API. This challenge must be signed and submitted back for verification.",
    },
    async () => {
      try {
        const client = getChallengeClient();
        const challenge = await client.requestChallenge();
        return {
          content: [
            { type: "text", text: JSON.stringify({ challenge }, null, 2) },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Failed to request challenge: ${message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "sign_challenge",
    {
      description:
        "Sign a challenge string using the configured RSA private key. Returns a URL-safe base64 encoded signature.",
      inputSchema: {
        challenge: z.string().describe("The challenge string to sign"),
      },
    },
    async ({ challenge }) => {
      try {
        const client = getSigningClient();
        const proof = client.sign(challenge);
        return {
          content: [
            { type: "text", text: JSON.stringify({ proof }, null, 2) },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Failed to sign challenge: ${message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "submit_proof",
    {
      description:
        "Submit a signed proof for a challenge to the tether.name API for verification.",
      inputSchema: {
        challenge: z
          .string()
          .describe("The original challenge string from request_challenge"),
        proof: z
          .string()
          .describe("The signed proof from sign_challenge"),
      },
    },
    async ({ challenge, proof }) => {
      try {
        const client = getSigningClient();
        const result = await client.submitProof(challenge, proof);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Failed to submit proof: ${message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_agent_info",
    {
      description:
        "Get information about the currently configured tether.name agent. Returns the agent ID and key path.",
    },
    async () => {
      const agentId = process.env.TETHER_AGENT_ID;
      const privateKeyPath = process.env.TETHER_PRIVATE_KEY_PATH;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                agentId: agentId || "(not set)",
                privateKeyPath: privateKeyPath || "(not set)",
                configured: !!(agentId && privateKeyPath),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Agent Management Tools ---

  server.registerTool(
    "create_agent",
    {
      description:
        "Create a new Tether agent. Requires TETHER_API_KEY. Returns the agent ID, name, and registration token (save it — it cannot be retrieved later). Optionally assign a verified domain.",
      inputSchema: {
        agentName: z.string().describe("Name for the new agent"),
        description: z.string().optional().describe("Optional description for the agent"),
        domainId: z.string().optional().describe("Optional verified domain ID to assign to this agent"),
      },
    },
    async ({ agentName, description, domainId }) => {
      try {
        const client = getManagementClient();
        const agent = await client.createAgent(agentName, description || "", domainId);
        return {
          content: [{ type: "text", text: JSON.stringify(agent, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Failed to create agent: ${message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "list_agents",
    {
      description:
        "List all Tether agents for the authenticated account. Requires TETHER_API_KEY.",
    },
    async () => {
      try {
        const client = getManagementClient();
        const agents = await client.listAgents();
        return {
          content: [{ type: "text", text: JSON.stringify(agents, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Failed to list agents: ${message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "delete_agent",
    {
      description:
        "Delete a Tether agent by ID. Requires TETHER_API_KEY. This action is irreversible.",
      inputSchema: {
        agentId: z.string().describe("The agent ID to delete"),
      },
    },
    async ({ agentId }) => {
      try {
        const client = getManagementClient();
        await client.deleteAgent(agentId);
        return {
          content: [
            { type: "text", text: JSON.stringify({ deleted: true, id: agentId }, null, 2) },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Failed to delete agent: ${message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "list_domains",
    {
      description:
        "List all registered domains for the authenticated account. Requires TETHER_API_KEY. Use domain IDs when creating agents with domain assignment.",
    },
    async () => {
      try {
        const client = getManagementClient();
        const domains = await client.listDomains();
        return {
          content: [{ type: "text", text: JSON.stringify(domains, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Failed to list domains: ${message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "list_agent_keys",
    {
      description:
        "List key lifecycle entries for an agent. Requires TETHER_API_KEY.",
      inputSchema: {
        agentId: z.string().describe("Agent ID"),
      },
    },
    async ({ agentId }) => {
      try {
        const keys = await managementFetch(`/agents/${agentId}/keys`, {
          method: "GET",
        });
        return {
          content: [{ type: "text", text: JSON.stringify(keys, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Failed to list agent keys: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "rotate_agent_key",
    {
      description:
        "Rotate an agent key. Requires TETHER_API_KEY plus step-up verification via stepUpCode or challenge+proof.",
      inputSchema: {
        agentId: z.string().describe("Agent ID"),
        publicKey: z.string().describe("New base64 SPKI public key"),
        gracePeriodHours: z.number().int().min(0).max(168).optional().describe("Grace window in hours (default 24)"),
        reason: z.string().optional().describe("Rotation reason"),
        stepUpCode: z.string().optional().describe("Email step-up code"),
        challenge: z.string().optional().describe("Challenge code for key-proof step-up"),
        proof: z.string().optional().describe("Signature over challenge for key-proof step-up"),
      },
    },
    async ({ agentId, publicKey, gracePeriodHours, reason, stepUpCode, challenge, proof }) => {
      try {
        const result = await managementFetch(`/agents/${agentId}/keys/rotate`, {
          method: "POST",
          body: JSON.stringify({
            publicKey,
            ...(gracePeriodHours !== undefined ? { gracePeriodHours } : {}),
            ...(reason ? { reason } : {}),
            ...(stepUpCode ? { stepUpCode } : {}),
            ...(challenge ? { challenge } : {}),
            ...(proof ? { proof } : {}),
          }),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Failed to rotate agent key: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "revoke_agent_key",
    {
      description:
        "Revoke an agent key. Requires TETHER_API_KEY plus step-up verification via stepUpCode or challenge+proof.",
      inputSchema: {
        agentId: z.string().describe("Agent ID"),
        keyId: z.string().describe("Key ID"),
        reason: z.string().optional().describe("Revoke reason"),
        stepUpCode: z.string().optional().describe("Email step-up code"),
        challenge: z.string().optional().describe("Challenge code for key-proof step-up"),
        proof: z.string().optional().describe("Signature over challenge for key-proof step-up"),
      },
    },
    async ({ agentId, keyId, reason, stepUpCode, challenge, proof }) => {
      try {
        const result = await managementFetch(`/agents/${agentId}/keys/${keyId}/revoke`, {
          method: "POST",
          body: JSON.stringify({
            ...(reason ? { reason } : {}),
            ...(stepUpCode ? { stepUpCode } : {}),
            ...(challenge ? { challenge } : {}),
            ...(proof ? { proof } : {}),
          }),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Failed to revoke agent key: ${message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
