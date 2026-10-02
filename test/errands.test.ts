import { describe as group, expect, it } from "vitest";
import { describe, markDone, newErrand, pickRecent } from "../src/errands";

const at = (iso: string) => Date.parse(iso);

group("newErrand", () => {
  it("正常系: 前後の空白を落とし、頼んだ人が無ければ Home", () => {
    const e = newErrand({ item: "  milk " }, 1, "a");
    expect(e).toEqual({ id: "a", item: "milk", note: undefined, requestedBy: "Home", status: "sent", createdAt: 1 });
  });
  it("境界: 品物は60文字・ひと言は120文字で切る、空のひと言は無し", () => {
    const e = newErrand({ item: "x".repeat(80), note: "   " }, 1, "a");
    expect(e.item).toHaveLength(60);
    expect(e.note).toBeUndefined();
  });
});

group("markDone", () => {
  it("正常系: 済んだ時刻を付ける", () => {
    expect(markDone(newErrand({ item: "milk" }, 1, "a"), 5)).toMatchObject({ status: "done", doneAt: 5 });
  });
  it("二度押し: 最初の済んだ時刻を変えない", () => {
    const once = markDone(newErrand({ item: "milk" }, 1, "a"), 5);
    expect(markDone(once, 9).doneAt).toBe(5);
  });
});

group("pickRecent", () => {
  const list = [
    newErrand({ item: "milk" }, 1, "a"),
    newErrand({ item: "eggs" }, 3, "b"),
    newErrand({ item: "Milk tea" }, 2, "c"),
  ];
  it("正常系: 新しい順", () => {
    expect(pickRecent(list).map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
  it("品物で絞る: 大文字小文字を区別しない・部分一致", () => {
    expect(pickRecent(list, "MILK").map((e) => e.id)).toEqual(["c", "a"]);
  });
  it("聞き方の方が長いときも拾う（'the milk' → milk）", () => {
    expect(pickRecent(list, "the milk").map((e) => e.id)).toEqual(["a"]);
  });
  it("無いものは空", () => {
    expect(pickRecent(list, "bread")).toEqual([]);
  });
});

group("describe", () => {
  it("まだのもの", () => {
    const e = newErrand({ item: "milk", requestedBy: "Mom" }, at("2026-10-03T09:00:00Z"), "a");
    expect(describe(e)).toBe("milk — asked by Mom at Oct 3, 6:00 PM; not done yet");
  });
  it("済んだもの（日本時間で書く）", () => {
    const e = markDone(newErrand({ item: "milk", note: "2 bottles" }, at("2026-10-03T09:00:00Z"), "a"), at("2026-10-03T09:12:00Z"));
    expect(describe(e)).toBe("milk (2 bottles) — asked by Home at Oct 3, 6:00 PM; DONE at Oct 3, 6:12 PM");
  });
});

import { MAX_KEEP, upsert } from "../src/errands";

group("upsert", () => {
  const day = 24 * 60 * 60 * 1000;
  it("正常系: 新しいものを先頭に足す", () => {
    const a = newErrand({ item: "milk" }, 1, "a");
    const b = newErrand({ item: "eggs" }, 2, "b");
    expect(upsert([a], b, 3).map((e) => e.id)).toEqual(["b", "a"]);
  });
  it("同じ id は差し替える（済んだにした版が残る）", () => {
    const a = newErrand({ item: "milk" }, 1, "a");
    expect(upsert([a], markDone(a, 5), 6)).toEqual([markDone(a, 5)]);
  });
  it("30日より古いものは落とす", () => {
    const old = newErrand({ item: "old" }, 0, "o");
    const now = 31 * day;
    expect(upsert([old], newErrand({ item: "new" }, now, "n"), now).map((e) => e.id)).toEqual(["n"]);
  });
  it("上限を超えたら古い方から落とす", () => {
    const many = Array.from({ length: MAX_KEEP }, (_, i) => newErrand({ item: `i${i}` }, i + 1, `id${i}`));
    const out = upsert(many, newErrand({ item: "new" }, 1000, "n"), 1000);
    expect(out).toHaveLength(MAX_KEEP);
    expect(out[0].id).toBe("n");
    expect(out.some((e) => e.id === "id0")).toBe(false);
  });
});
