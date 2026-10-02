// おつかい MCP サーバー：家族が Alexa+ に頼んだ買い物を「ここだよ」に通知で届け、済んだかを答える。
//   POST /mcp                 … MCP（Streamable HTTP）。Authorization: Bearer <MCP_TOKEN>
//   POST /errands/<id>/done   … 「ここだよ」アプリが「済んだ」を返す。x-push-token が届け先と一致するときだけ
import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { describe, Errand, LIST_KEY, markDone, newErrand, pickRecent, upsert } from "./errands";

type Env = {
  ERRANDS: KVNamespace;
  MCP_TOKEN: string;
  KOKODAYO_PUSH_TO: string;
  KOKODAYO_PUSH_ENV?: string;
};

// 「ここだよ」の呼び鈴（Supabase の関数 knock）。公開してよい鍵（アプリにも入っている）。
const KNOCK_URL = "https://dmewybltarntlapasoiz.supabase.co/functions/v1/knock";
const KNOCK_KEY = "sb_publishable_iT6waNVeHj-Kb0Rp_Ux90w_1VCCk-WK";

const ring = (env: Env, e: Errand) =>
  fetch(KNOCK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: KNOCK_KEY, authorization: `Bearer ${KNOCK_KEY}` },
    body: JSON.stringify({
      kind: "errand",
      to: env.KOKODAYO_PUSH_TO,
      env: env.KOKODAYO_PUSH_ENV ?? "sandbox",
      name: e.requestedBy,
      text: e.note ? `${e.item}（${e.note}）` : e.item,
      errandId: e.id,
    }),
  });

const loadAll = async (env: Env): Promise<Errand[]> => (await env.ERRANDS.get<Errand[]>(LIST_KEY, "json")) ?? [];

const save = async (env: Env, e: Errand) =>
  env.ERRANDS.put(LIST_KEY, JSON.stringify(upsert(await loadAll(env), e, Date.now())));

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

function createServer(env: Env) {
  const server = new McpServer({ name: "otsukai", version: "0.1.0" });

  server.registerTool(
    "send_errand",
    {
      description:
        "Ask a family member who is out to pick something up. Sends a push notification to their phone (the Kokodayo app) right away. " +
        "Use when someone says things like 'tell him to buy milk on the way home' or 'we're out of eggs, let her know'. " +
        "One item per call; call again for each item.",
      inputSchema: {
        item: z.string().min(1).describe("What to buy, as the person said it, e.g. 'milk' or '牛乳'"),
        note: z.string().optional().describe("Optional detail such as brand, amount, or deadline, e.g. 'low-fat, 2 bottles'"),
        requestedBy: z.string().optional().describe("Who is asking, if known, e.g. 'Mom'"),
      },
    },
    async ({ item, note, requestedBy }) => {
      const e = newErrand({ item, note, requestedBy }, Date.now(), crypto.randomUUID());
      await save(env, e);
      const res = await ring(env, e);
      if (!res.ok) return text(`Saved "${e.item}", but the notification failed (${res.status}). Ask them directly.`);
      return text(`Sent. Their phone was notified: "${e.item}"${e.note ? ` (${e.note})` : ""}.`);
    },
  );

  server.registerTool(
    "check_errands",
    {
      description:
        "Check whether requested items were bought. Use for questions like 'did he get the milk?' or 'what did I ask him to buy?'. " +
        "Returns the most recent requests, newest first, each marked done (with time) or not done yet.",
      inputSchema: {
        item: z.string().optional().describe("Only requests that mention this item, e.g. 'milk'"),
      },
    },
    async ({ item }) => {
      const found = pickRecent(await loadAll(env), item);
      if (found.length === 0) return text(item ? `No requests for "${item}".` : "No requests yet.");
      return text(found.map(describe).join("\n"));
    },
  );

  return server;
}

async function handleDone(request: Request, env: Env, id: string): Promise<Response> {
  if (!env.KOKODAYO_PUSH_TO || request.headers.get("x-push-token") !== env.KOKODAYO_PUSH_TO) {
    return new Response("forbidden", { status: 403 });
  }
  const e = (await loadAll(env)).find((x) => x.id === id);
  if (!e) return new Response("not found", { status: 404 });
  await save(env, markDone(e, Date.now()));
  return Response.json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    const done = pathname.match(/^\/errands\/([0-9a-f-]{36})\/done$/);
    if (done && request.method === "POST") return handleDone(request, env, done[1]);
    if (pathname.startsWith("/mcp")) {
      if (!env.MCP_TOKEN || request.headers.get("authorization") !== `Bearer ${env.MCP_TOKEN}`) {
        return new Response("unauthorized", { status: 401 });
      }
      return createMcpHandler(() => createServer(env), { route: "/mcp" })(request, env, ctx);
    }
    return new Response("otsukai MCP server");
  },
};
