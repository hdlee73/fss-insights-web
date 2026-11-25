// node tests/heatmap.test.mjs — 시총 히트맵 계산 검증
import assert from "node:assert/strict";
import { buildFromNaver, capText, pctText, squarify, tileColor, splitBrand, brandColor, layoutEtf, ETF_CATS } from "../js/lib/heatmap-core.js";

// 칸 배치: 면적 합 = 전체, 칸이 서로 겹치지 않고 상자를 벗어나지 않음, 면적은 값에 비례
const items = Array.from({ length: 150 }, (_, i) => ({ v: Math.round(1e6 / (i + 1)) }));
for (const [W, H] of [[800, 464], [360, 396], [1200, 600]]) {
  const cells = squarify(items, W, H);
  assert.equal(cells.length, 150);
  const area = cells.reduce((s, c) => s + c.w * c.h, 0);
  assert.ok(Math.abs(area - W * H) < 1, "면적 합");
  const total = items.reduce((s, i) => s + i.v, 0);
  for (const c of cells) {
    assert.ok(c.x >= -1e-6 && c.y >= -1e-6 && c.x + c.w <= W + 1e-6 && c.y + c.h <= H + 1e-6, "상자 안");
    assert.ok(Math.abs((c.w * c.h) / (W * H) - c.v / total) < 1e-9, "면적 ∝ 값");
  }
  for (let i = 0; i < cells.length; i++)
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j];
      assert.ok(a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6, "겹침 없음");
    }
}
// 빈 값·0 이하·크기 0
assert.deepEqual(squarify([], 100, 100), []);
assert.deepEqual(squarify([{ v: 0 }, { v: -1 }], 100, 100), []);
assert.deepEqual(squarify([{ v: 1 }], 0, 100), []);
assert.equal(squarify([{ v: 5 }], 100, 50).length, 1);

// 글자
assert.equal(capText(10266065), "1,027조");
assert.equal(capText(8400), "8,400억");
assert.equal(capText(25000), "2.5조");
assert.equal(capText(0), "—");
assert.equal(pctText(1.234), "+1.23%");
assert.equal(pctText(-7.29), "-7.29%");
assert.equal(pctText(0), "0.00%");

// 색: 0 근처 회색, 상승 빨강 계열, 하락 파랑 계열, ±3 이상은 같은 색
assert.equal(tileColor(0), "rgb(133,144,166)");
assert.equal(tileColor(NaN), "rgb(133,144,166)");
const [r1, , b1] = tileColor(3).match(/\d+/g).map(Number);
assert.ok(r1 > b1);
const [r2, , b2] = tileColor(-3).match(/\d+/g).map(Number);
assert.ok(b2 > r2);
assert.equal(tileColor(3), tileColor(9));

// NAVER 목록 정리: ETF·잘못된 값 제외, 시총순(억원), 중복 제거
const st = (c, n, raw, p, t = "stock") => ({ itemCode: c, stockName: n, marketValueRaw: String(raw), fluctuationsRatio: String(p), stockEndType: t, localTradedAt: "2026-11-25T09:48:21+09:00" });
const d = buildFromNaver([{ marketStatus: "OPEN", stocks: [st("1", "a", 5e11, 1.2), st("2", "e", 9e14, 0, "etf"), st("3", "b", 1.5e14, -7.29), st("1", "a", 5e11, 1.2), st("4", "x", "bad", 1)] }], "KOSPI", 1);
assert.deepEqual(d.rows, [["3", "b", 1500000, -7.29], ["1", "a", 5000, 1.2]]);
assert.equal(d.status, "OPEN");

// ETF: 브랜드 분리(공백으로 끊길 때만, 합성 표기 제거), 알 수 없는 브랜드는 그대로
assert.deepEqual(splitBrand("KODEX 미국S&P500"), { brand: "KODEX", short: "미국S&P500" });
assert.deepEqual(splitBrand("TIGER CD금리투자KIS(합성)"), { brand: "TIGER", short: "CD금리투자KIS" });
assert.deepEqual(splitBrand("TIME 글로벌AI인공지능액티브"), { brand: "TIME", short: "글로벌AI인공지능액티브" });
assert.deepEqual(splitBrand("KODEX200"), { brand: "", short: "KODEX200" });
assert.deepEqual(splitBrand("처음보는 상품"), { brand: "", short: "처음보는 상품" });
assert.equal(splitBrand("KODEX").brand, "");
assert.equal(brandColor("KODEX") === brandColor("TIGER"), false);
assert.equal(brandColor("없는브랜드"), "#5c6372");

// ETF 배치: 분류 묶음이 상자를 채우고 겹치지 않으며, 칸은 묶음 안쪽에 들어간다. 순자산 합 큰 분류가 먼저
const erows = Array.from({ length: 100 }, (_, i) => ["C" + i, "KODEX 상품" + i, Math.round(2e6 / (i + 1)), (i % 7) - 3, (i % 7) + 1]);
for (const [W, H] of [[1600, 544], [360, 468]]) {
  const gs = layoutEtf(erows, W, H, 17);
  assert.equal(gs.length, 7);
  const area = gs.reduce((s, g) => s + g.w * g.h, 0);
  assert.ok(Math.abs(area - W * H) < 5, "묶음 면적 합 = 전체");
  for (const g of gs) {
    assert.ok(g.x >= -0.5 && g.y >= -0.5 && g.x + g.w <= W + 0.5 && g.y + g.h <= H + 0.5);
    assert.ok(g.name === ETF_CATS[g.cat]);
    for (const c of g.cells) {
      assert.ok(c.x >= -0.5 && c.y >= -0.5 && c.x + c.w <= g.iw + 0.5 && c.y + c.h <= g.ih + 0.5, "칸은 묶음 안쪽");
      assert.equal(c.r[4], g.cat);
    }
    assert.equal(g.cells.length, erows.filter((r) => r[4] === g.cat).length);
  }
  for (let i = 1; i < gs.length; i++) assert.ok(gs[i - 1].sum >= gs[i].sum);
}
assert.deepEqual(layoutEtf([], 800, 400), []);
assert.deepEqual(layoutEtf([["a", "x", 0, 0, 1]], 800, 400), []);
console.log("heatmap tests OK");
