import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, main } from "../src/index.js";

function setupEnv(
  overrides: Record<string, string | undefined> = {}
): () => void {
  const defaults: Record<string, string> = {
    TETHER_AGENT_ID: "test-agent-id",
    TETHER_PRIVATE_KEY_PATH: "/tmp/test-key.der",
  };
  const merged = { ...defaults, ...overrides };
  const saved: Record<string, string | undefined> = {};

  for (const [key, val] of Object.entries(merged)) {
    saved[key] = process.env[key];
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }

  return () => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  };
}

async function createTestClient() {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server };
}

describe("import safety", () => {
  it("should not start a server when imported as a module", () => {
    // Importing the module should only expose createServer and main
    // without starting a StdioServerTransport (which would block the process)
    expect(createServer).toBeTypeOf("function");
    expect(main).toBeTypeOf("function");
  });
});

describe("tether-name-mcp-server", () => {
  describe("tool listing", () => {
    let restore: () => void;

    beforeEach(() => {
      restore = setupEnv();
    });
    afterEach(() => restore());

    it("should list all tools", async () => {
      const { client } = await createTestClient();
      const result = await client.listTools();

      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "create_agent",
        "delete_agent",
        "get_agent_info",
        "list_agent_keys",
        "list_agents",
        "list_domains",
        "request_challenge",
        "revoke_agent_key",
        "rotate_agent_key",
        "sign_challenge",
        "submit_proof",
        "verify_identity",
      ]);
    });

    it("should have descriptions for all tools", async () => {
      const { client } = await createTestClient();
      const result = await client.listTools();

      for (const tool of result.tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.description!.length).toBeGreaterThan(10);
      }
    });

    it("sign_challenge should require a challenge parameter", async () => {
      const { client } = await createTestClient();
      const result = await client.listTools();

      const signTool = result.tools.find((t) => t.name === "sign_challenge");
      expect(signTool).toBeDefined();
      expect(signTool!.inputSchema.required).toContain("challenge");
    });

    it("submit_proof should require challenge and proof parameters", async () => {
      const { client } = await createTestClient();
      const result = await client.listTools();

      const submitTool = result.tools.find((t) => t.name === "submit_proof");
      expect(submitTool).toBeDefined();
      expect(submitTool!.inputSchema.required).toContain("challenge");
      expect(submitTool!.inputSchema.required).toContain("proof");
    });
  });

  describe("get_agent_info", () => {
    it("should return configured agent info", async () => {
      const restore = setupEnv({
        TETHER_AGENT_ID: "my-agent-id",
        TETHER_PRIVATE_KEY_PATH: "/path/to/key.der",
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "get_agent_info",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        const info = JSON.parse(content[0].text);
        expect(info.agentId).toBe("my-agent-id");
        expect(info.privateKeyPath).toBe("/path/to/key.der");
        expect(info.configured).toBe(true);
      } finally {
        restore();
      }
    });

    it("should show not-set when env vars are missing", async () => {
      const restore = setupEnv({
        TETHER_AGENT_ID: undefined,
        TETHER_PRIVATE_KEY_PATH: undefined,
        TETHER_BASE_URL: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "get_agent_info",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        const info = JSON.parse(content[0].text);
        expect(info.agentId).toBe("(not set)");
        expect(info.privateKeyPath).toBe("(not set)");
        expect(info.configured).toBe(false);
      } finally {
        restore();
      }
    });
  });

  describe("verify_identity", () => {
    it("should return error when TETHER_AGENT_ID is not set", async () => {
      const restore = setupEnv({
        TETHER_AGENT_ID: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "verify_identity",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_AGENT_ID");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });

    it("should return error when TETHER_PRIVATE_KEY_PATH is not set", async () => {
      const restore = setupEnv({
        TETHER_PRIVATE_KEY_PATH: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "verify_identity",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_PRIVATE_KEY_PATH");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("request_challenge", () => {
    it("should return error when agent settings are not configured", async () => {
      const restore = setupEnv({
        TETHER_AGENT_ID: undefined,
        TETHER_PRIVATE_KEY_PATH: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "request_challenge",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_AGENT_ID");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("sign_challenge", () => {
    it("should return error when agent settings are not configured", async () => {
      const restore = setupEnv({
        TETHER_AGENT_ID: undefined,
        TETHER_PRIVATE_KEY_PATH: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "sign_challenge",
          arguments: { challenge: "test-challenge" },
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_AGENT_ID");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("submit_proof", () => {
    it("should return error when agent settings are not configured", async () => {
      const restore = setupEnv({
        TETHER_AGENT_ID: undefined,
        TETHER_PRIVATE_KEY_PATH: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "submit_proof",
          arguments: { challenge: "test-challenge", proof: "test-proof" },
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_AGENT_ID");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("create_agent", () => {
    it("should return error when TETHER_API_KEY is not set", async () => {
      const restore = setupEnv({
        TETHER_API_KEY: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "create_agent",
          arguments: { agentName: "test-agent" },
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_API_KEY");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("list_agents", () => {
    it("should return error when TETHER_API_KEY is not set", async () => {
      const restore = setupEnv({
        TETHER_API_KEY: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "list_agents",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_API_KEY");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("delete_agent", () => {
    it("should return error when TETHER_API_KEY is not set", async () => {
      const restore = setupEnv({
        TETHER_API_KEY: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "delete_agent",
          arguments: { agentId: "test-id" },
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_API_KEY");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("list_domains", () => {
    it("should return error when TETHER_API_KEY is not set", async () => {
      const restore = setupEnv({
        TETHER_API_KEY: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "list_domains",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_API_KEY");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("list_agent_keys", () => {
    it("should return error when TETHER_API_KEY is not set", async () => {
      const restore = setupEnv({ TETHER_API_KEY: undefined });
      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "list_agent_keys",
          arguments: { agentId: "agent-1" },
        });
        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_API_KEY");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("rotate_agent_key", () => {
    it("should return error when TETHER_API_KEY is not set", async () => {
      const restore = setupEnv({ TETHER_API_KEY: undefined });
      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "rotate_agent_key",
          arguments: { agentId: "agent-1", publicKey: "BASE64_KEY" },
        });
        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_API_KEY");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("revoke_agent_key", () => {
    it("should return error when TETHER_API_KEY is not set", async () => {
      const restore = setupEnv({ TETHER_API_KEY: undefined });
      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "revoke_agent_key",
          arguments: { agentId: "agent-1", keyId: "key-1" },
        });
        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_API_KEY");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });
});
