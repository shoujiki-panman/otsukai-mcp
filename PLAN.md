# おつかい MCP（Amazon「Build, Ship, Shape」ハッカソン Alexa+ 部門）

締切: 2026-10-23 12:00 PT ＝ **10/24(土) 4:00 JST**。提出は **10/22** に済ませる。

## 完成形（3分のデモ）
1. 奥さんが Alexa+ に「牛乳切れたから帰りに買ってきてって言っといて」
2. AI が `send_errand` を呼ぶ → 数秒で「ここだよ」に「🛒 牛乳」
3. 店で買って「ここだよ」で「済んだ」
4. 「頼んだ牛乳、買ってくれた？」→ `check_errands` →「はい、18:12 に買ったそうです」

## 作るもの
- MCP サーバー（この repo）: Cloudflare Workers・MCP 2025-11-25 Streamable HTTP・道具 `send_errand` / `check_errands`。持つのは品物・ひと言・頼んだ人・済んだか・時刻だけ（居場所なし・30日・50件まで）
- 「ここだよ」: 通知から「済んだ」→ `POST /errands/<id>/done`（x-push-token で本人確認）。knock に errandId を通す
- Alexa+ の代わり: コミュニティのシミュレーター（alexa-plus-sim / mcp-voice-simulator / alexa-skill-mcp-bridge）から1つ

## 日程
| 時期 | やること | 状態 |
|---|---|---|
| 10/3〜10/6 | MCP サーバー（道具2つ）・Inspector で確認 | ✅ 10/3 デプロイ・2025-11-25 で応答・送信→即読み出しOK |
| 10/7〜10/10 | 「ここだよ」の「済んだ」と返し方 | |
| 10/11〜10/14 | シミュレーターを選んで通し | |
| 10/15〜10/18 | デモ動画・README・Devpost 説明 | |
| 10/19〜10/22 | 予備・提出 | |

## 合格ライン
- 自然な言い方3通りで iPhone に通知が届く
- 「済んだ」の後、「買ってくれた？」に正しく答える
- 公開 repo＋README＋3分以内の動画

## メモ
- URL: https://otsukai-mcp.shoujiki-panman.workers.dev/mcp（Bearer は Keychain の OTSUKAI_MCP_TOKEN → `kc get OTSUKAI_MCP_TOKEN`）
- KV の一覧取得は反映が約20秒遅れた → 全件を1キーに持つ形に変えた
- 確認: `npx @modelcontextprotocol/inspector --cli <URL> --transport http --header "Authorization: Bearer …" --method tools/list`
