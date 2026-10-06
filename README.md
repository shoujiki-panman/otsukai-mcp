# otsukai-mcp

**Ask your family to pick something up — just by saying it to Alexa+.**

"We're out of milk, tell him to grab some on the way home."
Alexa+ understands the request, calls this MCP server, and the person who is out gets a push notification on their phone right away.
Later, "Did he get the milk?" — Alexa+ asks the server and answers: "Yes, he got it at 6:12 PM."

*Otsukai* (おつかい) is Japanese for running a small errand for the family.

Built for the **Alexa+ track** of [Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/).

## How it works

```
Alexa+ ──MCP (2025-11-25, Streamable HTTP)──▶ otsukai-mcp (Cloudflare Workers)
                                                 │  send_errand  → push notification
                                                 ▼
                                   Kokodayo app on the family member's iPhone
                                                 │  taps "Done"
                                                 ▼
                                   otsukai-mcp marks it done ◀── check_errands
```

| Tool | When Alexa+ uses it |
|---|---|
| `send_errand(item, note?, requestedBy?)` | "Tell him to buy milk", "We're out of eggs, let her know" |
| `check_errands(item?)` | "Did he get the milk?", "What did I ask him to buy?" |

The notification is delivered by [Kokodayo](https://github.com/shoujiki-panman), a meetup app for family and friends, through its Apple Push Notification relay.

## Authentication

`/mcp` is protected with OAuth 2.1 (authorization code + PKCE S256), using Cloudflare's [workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider).
Clients can register with Dynamic Client Registration or a Client ID Metadata Document, which is what ChatGPT and Alexa+ expect.
The consent page asks for a family passphrase, so only the household can connect an assistant.

## Privacy

The server keeps only what the errand needs: the item, an optional note, who asked, whether it is done, and when.
No location. Entries disappear after 30 days, and at most 50 are kept.

## Run it yourself

```bash
npm install
npm run check        # typecheck + unit tests
npx wrangler kv namespace create ERRANDS   # put the id into wrangler.jsonc
npx wrangler kv namespace create OAUTH_KV  # put the id into wrangler.jsonc
npx wrangler secret put LOGIN_PASSPHRASE   # passphrase on the consent page
npx wrangler secret put MCP_TOKEN          # bearer token for /internal-mcp (Echo bridge)
npx wrangler secret put KOKODAYO_PUSH_TO   # the phone to notify
npm run deploy
```

Try it with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector --cli https://<your-worker>/internal-mcp \
  --transport http --header "Authorization: Bearer <MCP_TOKEN>" --method tools/list
```

## Status

Work in progress for the hackathon (deadline: Oct 23, 2026). See [PLAN.md](PLAN.md) (Japanese).

## License

MIT
