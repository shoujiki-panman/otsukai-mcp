// おつかい MCP サーバー：家族が Alexa+ や ChatGPT に頼んだ買い物を「ここだよ」に通知で届け、済んだかを答える。
//   /mcp                      … MCP（Streamable HTTP）。OAuth 2.1（ChatGPT・Alexa+ はこちら。DCR と CIMD に対応）
//   /authorize                … OAuth の同意画面（合言葉で本人だけが許可できる）
//   /internal-mcp             … 同じ MCP を固定の合言葉（Bearer MCP_TOKEN）で。Echo の橋渡しスキルが Service Binding で使う
//   POST /errands/<id>/done   … 「ここだよ」アプリが「済んだ」を返す。x-push-token が届け先と一致するときだけ
import { createMcpHandler } from "agents/mcp/server";
import { AuthorizationError, CimdFetchError, OAuthProvider, type ConsentDescription, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { describe, Errand, LIST_KEY, markDone, newErrand, pickRecent, upsert } from "./errands";

type Env = {
  ERRANDS: KVNamespace;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  MCP_TOKEN: string;
  LOGIN_PASSPHRASE: string;
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

const ORIGIN = "https://otsukai-mcp.shoujiki-panman.workers.dev";
const escape = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function consentPage(d: ConsentDescription, handle: string, wrong = false): string {
  const name = escape(d.clientName);
  const origin = d.clientDomain ? `発行元: <strong>${escape(d.clientDomain)}</strong>` : "このアプリは自分で名乗っています（名前は確かめられていません）";
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>おつかい MCP</title><body style="font-family:system-ui;max-width:28rem;margin:2rem auto;padding:0 1rem;line-height:1.6">
<h1 style="font-size:1.3rem">${name} に、おつかいの送信と確認を許可しますか？</h1>
<p>${origin}<br>許可の結果は <strong>${escape(d.redirectHost)}</strong> に送られます。</p>
${d.redirectIsLoopback ? "<p><strong>このパソコンのアプリに送られます。</strong>自分で今ログインを始めたときだけ続けてください。</p>" : ""}
${wrong ? '<p style="color:#b00">合言葉が違います。</p>' : ""}
<form method="post"><input type="hidden" name="handle" value="${escape(handle)}">
<label>合言葉 <input name="passphrase" type="password" autocomplete="current-password" required style="width:100%;font-size:1rem;padding:.4rem"></label>
<p><button name="decision" value="approve" style="font-size:1rem;padding:.4rem 1rem">許可する</button>
<button name="decision" value="deny" style="font-size:1rem;padding:.4rem 1rem">やめる</button></p></form>`;
}

const html = (body: string, headers?: Headers) => {
  const h = headers ?? new Headers();
  h.set("Content-Type", "text/html; charset=utf-8");
  return new Response(body, { headers: h });
};

async function handleAuthorize(req: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (req.method === "GET") {
      const request = await oauth.parseAuthRequest(req);
      const details = await oauth.describeConsent(request);
      const consent = await oauth.beginConsent(request);
      return html(consentPage(details, consent.handle), consent.headers);
    }
    const form = await req.formData();
    const handle = String(form.get("handle"));
    if (form.get("decision") !== "approve") {
      const denied = await oauth.denyConsent(req, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    if (!env.LOGIN_PASSPHRASE || form.get("passphrase") !== env.LOGIN_PASSPHRASE) {
      return new Response("合言葉が違います。前の画面に戻ってやり直してください。", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    const approved = await oauth.approveConsent(req, handle, { scope: ["errands"] });
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId: "family",
      metadata: {},
      scope: approved.request.scope,
      props: { userId: "family" },
    });
    approved.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      const message = error instanceof AuthorizationError ? error.description : "このアプリを確かめられませんでした。";
      return new Response(escape(String(message)), { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    throw error;
  }
}

const mcp = (env: Env, ctx: ExecutionContext, req: Request, route: string) =>
  createMcpHandler(() => createServer(env), { route })(req, env, ctx);

const defaultHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    const done = pathname.match(/^\/errands\/([0-9a-f-]{36})\/done$/);
    if (done && request.method === "POST") return handleDone(request, env, done[1]);
    if (pathname === "/authorize") return handleAuthorize(request, env);
    if (pathname.startsWith("/internal-mcp")) {
      if (!env.MCP_TOKEN || request.headers.get("authorization") !== `Bearer ${env.MCP_TOKEN}`) {
        return new Response("unauthorized", { status: 401 });
      }
      return mcp(env, ctx, request, "/internal-mcp");
    }
    return new Response("otsukai MCP server");
  },
};

export default new OAuthProvider<Env>({
  apiRoute: "/mcp",
  apiHandler: { fetch: (req: Request, env: Env, ctx: ExecutionContext) => mcp(env, ctx, req, "/mcp") },
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: ["errands"],
  requiredScopes: ["errands"],
  resourceMetadata: { resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] },
  clientIdMetadataDocumentEnabled: true,
});
