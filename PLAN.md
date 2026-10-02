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
- Alexa+ の代わり: **本物の Echo**。たぬきテストのスキルが話した文を丸ごと受け取り（FREE_TEXT スロット）、AI が MCP の道具を選び、返事はコードで日本語にする。Bedrock の鍵を作れば Nova に切り替わる（本人は鍵の発行を嫌がった）

## 日程
| 時期 | やること | 状態 |
|---|---|---|
| 10/3〜10/6 | MCP サーバー（道具2つ）・Inspector で確認 | ✅ 10/3 デプロイ・2025-11-25 で応答・送信→即読み出しOK |
| 10/7〜10/10 | 「ここだよ」の「済んだ」と返し方 | ✅ 10/3 実機で確認（アプリを完全に閉じた状態で通知を長押し→済んだ→check_errands が DONE）。ここだよ ブランチ alexa-errand 49c729b |
| 10/11〜10/14 | ~~シミュレーター~~ → **本物の Echo** で通す（本人「シミュレーターはしょぼい」） | 🔧 10/3 Echo→スキル（work/alexa/hello）→Workers AI(Llama 4 Scout・鍵いらず)→MCP の通しをシミュレーターで確認。実機 Echo 待ち |
| 10/15〜10/18 | デモ動画・README・Devpost 説明 | |
| 10/19〜10/22 | 予備・提出 | |

## 合格ライン
- 自然な言い方3通りで iPhone に通知が届く
- 「済んだ」の後、「買ってくれた？」に正しく答える
- 公開 repo＋README＋3分以内の動画

## メモ
- 「済んだ」が届かなかった原因（推測）：通知を押して開いたとき1秒待ちで札が出なかった／閉じた状態で送り終わる前に止められた → 画面が前に出てから聞く・beginBackgroundTask で直した
- 入れ直した直後はアプリを1回開くまで「済んだ」ボタンが出ない（通知の種類の登録が起動時のため）
- 呼び鈴 knock は「ここだよ」本体と共用。本番 v5 の正本は alexa-errand ブランチ
- URL: https://otsukai-mcp.shoujiki-panman.workers.dev/mcp（Bearer は Keychain の OTSUKAI_MCP_TOKEN → `kc get OTSUKAI_MCP_TOKEN`）
- KV の一覧取得は反映が約20秒遅れた → 全件を1キーに持つ形に変えた
- 確認: `npx @modelcontextprotocol/inspector --cli <URL> --transport http --header "Authorization: Bearer …" --method tools/list`
