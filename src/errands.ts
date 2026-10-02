// おつかい（家族からの買い物のお願い）の記録。居場所は持たない。
// 持つのは「品物・ひと言・頼んだ人・済んだか・時刻」だけで、30日で消える。

export type Errand = {
  id: string;
  item: string;
  note?: string;
  requestedBy: string;
  status: "sent" | "done";
  createdAt: number;
  doneAt?: number;
};

// 全部を1つのキーに入れる（KV の一覧取得は反映が数十秒遅れ、「買ってくれた？」に間に合わないため）。
export const LIST_KEY = "errands";
export const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_KEEP = 50;

// 同じ id は差し替え、無ければ足す。30日より古いものと、51件目以降は落とす。
export function upsert(list: Errand[], e: Errand, now: number): Errand[] {
  return [e, ...list.filter((x) => x.id !== e.id)]
    .filter((x) => now - x.createdAt < KEEP_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_KEEP);
}

export function newErrand(
  input: { item: string; note?: string; requestedBy?: string },
  now: number,
  id: string,
): Errand {
  const item = input.item.trim().slice(0, 60);
  const note = input.note?.trim().slice(0, 120) || undefined;
  const requestedBy = input.requestedBy?.trim().slice(0, 20) || "Home";
  return { id, item, note, requestedBy, status: "sent", createdAt: now };
}

export function markDone(errand: Errand, now: number): Errand {
  return errand.status === "done" ? errand : { ...errand, status: "done", doneAt: now };
}

// 新しい順。item を渡したら、その言葉を含むものだけ（大文字小文字は区別しない）。
export function pickRecent(errands: Errand[], item?: string, limit = 10): Errand[] {
  const q = item?.trim().toLowerCase();
  return errands
    .filter((e) => !q || e.item.toLowerCase().includes(q) || q.includes(e.item.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

const fmt = (ms: number) =>
  new Date(ms).toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function describe(e: Errand): string {
  const asked = `${e.item}${e.note ? ` (${e.note})` : ""} — asked by ${e.requestedBy} at ${fmt(e.createdAt)}`;
  return e.status === "done" && e.doneAt ? `${asked}; DONE at ${fmt(e.doneAt)}` : `${asked}; not done yet`;
}
