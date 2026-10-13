/** Grok Bot registers this scheme. The page must still show the MCP URL if it does not open. */
export function grokBotConnectLink(mcpUrl: string): string {
  return `grokbot://connect?url=${encodeURIComponent(mcpUrl)}`;
}
