# tether-name-mcp-server

MCP server for [tether.name](https://tether.name) — AI agent identity verification.

This server wraps the [`tether-name`](https://www.npmjs.com/package/tether-name) SDK, letting any MCP-compatible AI
agent verify its identity through Tether without writing integration code.

## What is Tether?

Tether is an identity verification service for AI agents. Agents hold their own RSA private keys and prove their
identity by signing cryptographic challenges — no custodial risk, no passwords.

## Quick Start

```bash
npx tether-name-mcp-server
```

## Configuration

The server reads from environment variables:

| Variable                  | Required | Description                                          |
|---------------------------|----------|------------------------------------------------------|
| `TETHER_AGENT_ID`    | ✅        | Your Tether agent ID                            |
| `TETHER_PRIVATE_KEY_PATH` | ✅        | Path to your RSA private key (PEM or DER)            |

## MCP Client Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tether": {
      "command": "npx",
      "args": [
        "-y",
        "tether-name-mcp-server"
      ],
      "env": {
        "TETHER_AGENT_ID": "your-agent-id",
        "TETHER_PRIVATE_KEY_PATH": "/path/to/private-key.pem"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "tether": {
      "command": "npx",
      "args": [
        "-y",
        "tether-name-mcp-server"
      ],
      "env": {
        "TETHER_AGENT_ID": "your-agent-id",
        "TETHER_PRIVATE_KEY_PATH": "/path/to/private-key.pem"
      }
    }
  }
}
```

### VS Code

Add to your VS Code settings or `.vscode/mcp.json`:

```json
{
  "mcp": {
    "servers": {
      "tether": {
        "command": "npx",
        "args": [
          "-y",
          "tether-name-mcp-server"
        ],
        "env": {
          "TETHER_AGENT_ID": "your-agent-id",
          "TETHER_PRIVATE_KEY_PATH": "/path/to/private-key.pem"
        }
      }
    }
  }
}
```

## Tools

| Tool                  | Description                                                                                |
|-----------------------|--------------------------------------------------------------------------------------------|
| `verify_identity`     | Complete verification flow in one call — requests a challenge, signs it, and submits proof |
| `request_challenge`   | Request a new challenge string from the Tether API                                         |
| `sign_challenge`      | Sign a challenge string with the configured RSA private key                                |
| `submit_proof`        | Submit a signed proof for a challenge                                                      |
| `get_agent_info` | Show the currently configured agent ID and key path                        |

## How It Works

1. The agent calls `verify_identity`
2. The MCP server requests a challenge from `api.tether.name`
3. The challenge is signed locally using the agent's private key (the key never leaves the machine)
4. The signed proof is submitted back to Tether for verification
5. The result includes the agent's verified name and a public verification URL

For more granular control, use `request_challenge`, `sign_challenge`, and `submit_proof` individually.

## Security

- **Non-custodial**: Your private key stays on your machine. The MCP server reads it from a local file path — it's never
  transmitted.
- **No passwords**: Identity is proven through RSA challenge-response, not stored secrets.
- **Local execution**: The server runs as a local subprocess via STDIO. No remote server holds your keys.

## Publishing

Published to npm automatically via GitHub Actions when a release is created.

### Version checklist

Update the version in:

1. `package.json` → `"version"`
2. `src/index.ts` → `version` in `McpServer` constructor

### Steps

1. Update version numbers above (they must match)
2. Commit and push to `main`
3. Create a GitHub release with a matching tag (e.g. `v1.0.0`)
4. CI builds and publishes to npm automatically

### Manual publish (if needed)

```bash
npm run build
npm publish --access public
```

## Links

- [tether.name](https://tether.name) — Agent identity verification
- [tether-name SDK](https://www.npmjs.com/package/tether-name) — Node.js SDK
- [MCP Protocol](https://modelcontextprotocol.io) — Model Context Protocol

## License

MIT
