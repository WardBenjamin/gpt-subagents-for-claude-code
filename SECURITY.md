# Security

The plugin handles an OpenAI API key and runs a model's tool calls on your machine. Please report vulnerabilities privately: use GitHub's **Report a vulnerability** (Security tab) on this repository, or email opensource@blward.com. Don't open a public issue. Expect a reply within a week.

**In scope:**
- the bridge leaking the key, in a tool result, an error or a log;
- GPT's tool calls escaping Claude Code's permission checks;
- the bridge's `turn`, `wait`, `result` or `cancel` being callable by anything other than the plugin.

**What the plugin does and doesn't protect:**
- **Where the key comes from:** the macOS Keychain, the Linux Secret Service, an owner-only file, or `OPENAI_API_KEY`.
- **Same-user processes:** any process running as you can read the key from those stores. The plugin doesn't defend against them.
- **What GPT sees:** GPT receives the prompt, and everything its tools read, on OpenAI's servers.
- **Web access:** when enabled, it runs at OpenAI, outside Claude Code's permissions.
