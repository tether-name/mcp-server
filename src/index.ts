import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TetherClient } from "tether-name";
import { z } from "zod";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "tether-name-mcp-server",
    version: "2.0.3",
  });

  function getClient(): TetherClient {
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

  server.registerTool(
    "verify_identity",
    {
      description:
        "Perform complete identity verification in one call. Requests a challenge, signs it with the configured private key, and submits the proof to tether.name for verification.",
    },
    async () => {
      try {
        const client = getClient();
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
        const client = getClient();
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
        const client = getClient();
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
        const client = getClient();
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

  return server;
}

export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
