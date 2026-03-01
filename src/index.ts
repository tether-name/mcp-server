import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TetherClient } from "tether-name";
import { z } from "zod";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "tether-name-mcp-server",
    version: "2.0.1",
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

  return server;
}

export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
