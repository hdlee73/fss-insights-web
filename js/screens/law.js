// 스마트 법령검색: "법령명 제N조"는 위임 트리(법률→시행령→시행규칙→감독규정→시행세칙)와 관련 판례로,
// 조문 번호 없는 낱말은 법령·행정규칙·판례·조문 키워드 통합 검색으로 보여 준다.
// 주소: ?q=검색어&asOf=yyyyMMdd · &cmp=1 비교표 · ?prec=판례 · ?mst=법령&name= · ?adm=행정규칙
import { setHeader } from "../app.js";
import { APP_NAME, APP_VERSION, dialog, download, errorText, h, icon, iconButton, loading, message, share, store, toast } from "../core.js";
import * as L from "../lib/law-core.js";

const results = new Map(); // "검색어|기준일" → { tree } | { kw }
const views = new Map(); // 같은 키의 화면 상태(펼침·선택·찾기)
const wideMq = matchMedia("(min-width: 1100px)");
const EXAMPLES = ["자본시장법 제12조", "은행법 제34조", "보험업법 제95조의2", "내부통제"];

export async function render(root, params, ctx) {
  if (params.prec) return precedentView(root, params);
  if (params.adm) return adminRuleView(root, params, ctx);
  if (params.mst) return lawDocView(root, params, ctx);
  return searchView(root, params, ctx);
}

// ------------------------------------------------------------------ 검색 화면

function searchBar(params, ctx) {
  const q = params.q || "";
  const asOf = params.asOf || null;
  const input = h("input", { type: "search", value: q, placeholder: "예) 자본시장법 제12조 제2항 · 키워드 검색", enterkeyhint: "search", "aria-label": "법령 검색어" });
  const submit = (v) => {
    v = v.trim();
    if (!v) return;
    input.blur();
    ctx.go({ q: v, asOf });
  };
  const dateBtn = h("button", { type: "button", class: "pill" + (asOf ? " on" : ""), title: "조회 기준 시행일" }, icon("calendar"), asOf ? `${L.formatYmd(asOf)} 기준` : "현행 기준");
  dateBtn.onclick = async () => {
    const d = h("input", { type: "date", name: "d", value: asOf ? `${asOf.slice(0, 4)}-${asOf.slice(4, 6)}-${asOf.slice(6)}` : "", max: "2099-12-31" });
    const r = await dialog({ title: "조회 기준 시행일", text: "고른 날에 시행 중이던 조문 기준으로 찾습니다. 비워 두면 현행 기준입니다.", body: h("label", { class: "field" }, h("span", null, "날짜"), d), ok: "이 날짜 기준", cancel: "취소" });
    if (!r) return;
    const next = r.d ? r.d.replace(/-/g, "") : null;
    ctx.go({ q: q || null, asOf: next });
  };
  const form = h("form", { class: "lw-search", onsubmit: (e) => (e.preventDefault(), submit(input.value)) },
    h("div", { class: "search" }, icon("search"), input, h("button", { class: "btn sm", type: "submit" }, "조회")),
    h("div", { class: "lw-search-opts" }, dateBtn, asOf ? h("button", { type: "button", class: "link-more", onclick: () => ctx.go({ q: q || null }) }, "현행으로") : null,
      h("span", { class: "note" }, "조문 번호가 있으면 위임 트리, 없으면 키워드 통합 검색")));
  return form;
}

async function searchView(root, params, ctx) {
  setHeader("스마트 법령검색", "법조문 하나로 위임 규정(시행령·시행규칙·감독규정·세칙)과 판례를 한눈에");
  const q = (params.q || "").trim();
  const asOf = /^\d{8}$/.test(params.asOf || "") ? params.asOf : null;
  root.append(searchBar(params, ctx));
  if (!q) return root.append(idle(ctx));

  const key = `${q}|${asOf || ""}`;
  let res = results.get(key);
  if (!res) {
    const box = h("div", { class: "state" }, loading("찾는 중…"));
    root.append(box);
    const onStep = (m) => box.replaceChildren(loading(m + "…"));
    try {
      res = L.isArticleQuery(q) ? { tree: await L.getDelegationTree(q, { asOf, onStep }) } : { kw: await L.searchKeyword(q, { asOf, onStep }) };
      results.set(key, res);
      remember(q);
    } catch (e) {
      if (!ctx.alive()) return;
      box.replaceChildren(message(e instanceof L.LawError ? e.message : errorText(e), { error: true, action: "다시 시도", onAction: () => ctx.go(params, { replace: true }) }));
      return;
    }
    if (!ctx.alive()) return;
    box.remove();
  }
  if (res.kw) return root.append(keywordResults(res.kw, ctx));
  if (params.cmp) return compareView(root, res.tree, ctx, params);
  treeView(root, res.tree, key, params, ctx);
}

function remember(q) {
  const list = store.get("law.recent", []).filter((x) => x !== q);
  store.set("law.recent", [q, ...list].slice(0, 15));
}
const favorites = () => store.get("law.favorites", []);
function toggleFavorite(q) {
  const list = favorites();
  const on = !list.includes(q);
  store.set("law.favorites", on ? [q, ...list] : list.filter((x) => x !== q));
  toast(on ? "보관함에 담았습니다." : "보관함에서 뺐습니다.");
  return on;
}

function idle(ctx) {
  const chip = (q, onRemove) => h("span", { class: "lw-chip" },
    h("button", { type: "button", onclick: () => ctx.go({ q }) }, q),
    onRemove ? h("button", { type: "button", class: "x", title: "삭제", "aria-label": `${q} 삭제`, onclick: onRemove }, icon("x")) : null);
  const wrap = h("div", { class: "stack" });
  const draw = () => {
    const fav = favorites();
    const recent = store.get("law.recent", []);
    wrap.replaceChildren(...[
      h("section", { class: "card lw-hero" },
        h("div", { class: "lw-hero-t" }, h("b", null, "법조문 하나로"), h("b", null, "위임 규정을 한눈에")),
        h("p", { class: "note" }, "‘자본시장법 제85조’처럼 법령명과 조문을 넣으면 그 조문이 위임한 시행령·시행규칙·감독규정·시행세칙을 항·호 단위로 이어 보여 주고, 그 조문을 인용한 판례를 골라 드립니다. 낱말만 넣으면 법령·행정규칙·판례와 조문 제목·내용을 함께 찾습니다."),
        h("div", { class: "section-label" }, "이렇게 찾아보세요"),
        h("div", { class: "lw-chips" }, EXAMPLES.map((q) => chip(q)))),
      fav.length ? h("section", { class: "card" }, h("div", { class: "ch" }, icon("star"), h("h3", null, "보관함")),
        h("div", { class: "lw-chips" }, fav.map((q) => chip(q, () => (store.set("law.favorites", favorites().filter((x) => x !== q)), draw()))))) : null,
      recent.length ? h("section", { class: "card" }, h("div", { class: "ch" }, icon("history"), h("h3", null, "최근 조회"),
        h("div", { class: "ch-acts" }, h("button", { type: "button", class: "link-more", onclick: () => (store.set("law.recent", []), draw()) }, "지우기"))),
        h("div", { class: "lw-chips" }, recent.map((q) => chip(q, () => (store.set("law.recent", store.get("law.recent", []).filter((x) => x !== q)), draw()))))) : null,
      h("p", { class: "note" }, "출처: 국가법령정보센터 공동활용 API(law.go.kr). 법적 판단의 근거로는 반드시 원문을 확인하세요.")].filter(Boolean));
  };
  draw();
  return wrap;
}

// ------------------------------------------------------------------ 키워드 통합 검색 결과

function keywordResults(r, ctx) {
  const sec = (title, ic, count, rows, empty) => h("section", { class: "card" },
    h("div", { class: "ch" }, icon(ic), h("h3", null, title), h("div", { class: "ch-acts" }, `${count}건`)),
    rows.length ? h("div", { class: "list" }, rows) : h("p", { class: "note" }, empty));
  const row = (t, m, onclick) => h("div", { class: "item" }, h("div", { class: "body", role: "link", tabindex: 0, onclick, onkeydown: (e) => e.key === "Enter" && onclick() }, h("div", { class: "t" }, t), m ? h("div", { class: "m" }, m) : null));
  const out = h("div", { class: "stack" });
  if (r.scopeLaw) out.append(h("div", { class: "infobox" }, `‘${r.scopeLaw.name}’ 안에서 ‘${r.keyword.split(/\s+/).slice(1).join(" ") || r.keyword}’을(를) 조문 제목·내용으로 찾았습니다.`));
  if (r.warnings.length) out.append(h("div", { class: "lw-warn" }, r.warnings.map((w) => h("div", null, "※ " + w))));
  out.append(
    sec("조문 (제목·내용)", "book-open", r.articleHits.length, r.articleHits.map((hit) =>
      row(`${hit.law.name} ${hit.article.heading}`, (hit.inTitle ? "제목에 포함 · " : "내용에 포함 · ") + hit.snippet, () => ctx.go({ q: `${hit.law.name} ${L.noDisplay(hit.article.number)}` }))),
    "조문 제목·내용에서 찾지 못했습니다."));
  if (r.scanNote) out.append(h("p", { class: "note" }, r.scanNote));
  if (!r.scopeLaw) out.append(sec("법령", "landmark", r.laws.length, r.laws.map((law) =>
    row(law.name, [law.kind, law.abbreviation, law.effectiveDate ? "시행 " + L.formatYmd(law.effectiveDate) : null].filter(Boolean).join(" · "), () => ctx.go({ mst: law.mst, name: law.name }))), "찾은 법령이 없습니다."));
  if (r.adminRules.length) out.append(sec("행정규칙 (감독규정·세칙 등)", "file-text", r.adminRules.length, r.adminRules.map((a) =>
    row(a.name, [a.kind, a.agency].filter(Boolean).join(" · "), () => ctx.go({ adm: a.serialNo, name: a.name }))), ""));
  out.append(sec("판례", "gavel", r.precedents.length, r.precedents.map((p) => precRow(p, ctx)), "찾은 판례가 없습니다."));
  return out;
}

function precRow(p, ctx) {
  const open = () => ctx.go({ prec: p.serialNo });
  return h("div", { class: "item" }, h("div", { class: "body", role: "link", tabindex: 0, onclick: open, onkeydown: (e) => e.key === "Enter" && open() },
    h("div", { class: "t" }, p.caseName),
    h("div", { class: "m" }, p.matchNote ? h("span", { class: "tag green" }, p.matchNote) : null, [p.court, p.caseNumber, p.decisionDate ? L.formatYmd(p.decisionDate) : null].filter(Boolean).join(" · "))));
}

// ------------------------------------------------------------------ 위임 트리

function viewState(key, tree) {
  let v = views.get(key);
  if (!v) {
    v = { expanded: new Set([...tree.root.children, ...L.withParagraphPieces(tree.root).children].map((c) => c.id)), selected: tree.root.id, filter: "", showFilter: false, selectMode: false, citedOpen: false };
    for (const k of L.attach(tree.root.article, tree.root.children).keys()) v.expanded.add("grp:" + k);
    views.set(key, v);
  }
  return v;
}
const hiddenFor = (raw) => new Set(store.get("law.hidden", {})[raw] || []);
function setHidden(raw, keyName, on) {
  const all = store.get("law.hidden", {});
  const set = new Set(all[raw] || []);
  on ? set.add(keyName) : set.delete(keyName);
  if (set.size) all[raw] = [...set];
  else delete all[raw];
  store.set("law.hidden", all);
}

function treeView(root, tree, key, params, ctx) {
  const v = viewState(key, tree);
  const raw = tree.query.raw;
  const inline = () => store.get("law.inline", true);
  const split = () => wideMq.matches && store.get("law.split", true);
  const title = `${tree.law.name} ${L.queryTarget(tree.query)}`;

  const head = h("div");
  const bar = h("div");
  const body = h("div");
  root.append(head, bar, body);

  const fullRoot = () => (inline() ? L.withParagraphPieces(tree.root) : tree.root);
  const printable = () => ({ ...tree, root: L.withoutHidden(fullRoot(), hiddenFor(raw)) });

  function drawHead() {
    const fav = favorites().includes(raw);
    const star = iconButton("star", fav ? "보관함에서 빼기" : "보관함에 담기", () => (toggleFavorite(raw), drawHead()), fav ? "on" : "");
    head.replaceChildren(h("section", { class: "card lw-head" },
      h("div", { class: "lw-head-row" },
        h("div", { class: "lw-head-t" }, h("span", { class: "lv-badge l0" }, "법률"), h("h2", null, title)), star),
      h("div", { class: "lw-chips" },
        h("span", { class: "pill sm" }, `하위 규정 ${L.descendants(tree.root)}개`),
        tree.cited.length ? h("span", { class: "pill sm" }, `인용된 법규 ${tree.cited.length}건`) : null,
        h("span", { class: "pill sm" }, `관련 판례 ${tree.precedents.length}건`),
        h("button", { type: "button", class: "pill sm" + (tree.version ? " on" : ""), onclick: versions }, icon("history"), tree.version ? `${L.formatYmd(tree.version.effectiveDate)} 시행 기준` : "현행 기준 · 시행 연혁")),
      tree.warnings.length ? h("div", { class: "lw-warn" }, tree.warnings.map((w) => h("div", null, "※ " + w))) : null));
  }

  function drawBar() {
    const more = h("div", { class: "lw-menu", hidden: true });
    const item = (label, fn) => h("button", { type: "button", onclick: () => (more.hidden = true, fn()) }, label);
    more.append(
      item("시행 연혁", versions),
      item("모두 펼치기", () => (fullRoot() && L.flatten(fullRoot()).forEach((n) => v.expanded.add(n.id)), [...L.attach(fullRoot().article, fullRoot().children).keys()].forEach((k) => v.expanded.add("grp:" + k)), v.citedOpen = true, drawBody())),
      item("모두 접기", () => (v.expanded.clear(), v.citedOpen = false, drawBody())),
      wideMq.matches ? item(split() ? "화면: 한 줄로 보기" : "화면: 나눠 보기(목록|본문)", () => (store.set("law.split", !split()), drawBody())) : null,
      item(inline() ? "하위법규: 묶음으로 보기" : "하위법규: 위임한 줄 바로 아래", () => (store.set("law.inline", !inline()), drawBody())),
      item(v.selectMode ? "항목 숨기기 끝" : "항목 숨기기", () => (v.selectMode = !v.selectMode, drawBar(), drawBody())));
    const moreBtn = iconButton("ellipsis-vertical", "더보기", (e) => {
      e.stopPropagation();
      more.hidden = !more.hidden;
      if (!more.hidden) setTimeout(() => addEventListener("click", () => (more.hidden = true), { once: true }));
    });
    const filterInput = h("input", { type: "text", value: v.filter, placeholder: "결과 안에서 찾기 (키워드·제12조)", "aria-label": "결과 안에서 찾기" });
    let t = null;
    filterInput.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => (v.filter = filterInput.value, drawBody()), 200);
    });
    bar.replaceChildren(...[
      h("div", { class: "lw-bar" },
        h("button", { type: "button", class: "btn ghost sm", onclick: save }, icon("file-down"), "저장(PDF·한글)"),
        h("button", { type: "button", class: "btn ghost sm", onclick: () => ctx.go({ ...params, cmp: 1 }) }, icon("table"), "비교표"),
        iconButton("share-2", "공유", () => share(title, location.href)),
        iconButton("search", "결과 안에서 찾기", () => (v.showFilter = !v.showFilter, v.showFilter || (v.filter = ""), drawBar(), drawBody(), v.showFilter && bar.querySelector("input")?.focus()), v.showFilter || v.filter ? "act" : ""),
        v.selectMode ? h("button", { type: "button", class: "btn sm", onclick: () => (v.selectMode = false, drawBar(), drawBody()) }, "숨기기 끝") : null,
        h("div", { class: "lw-more" }, moreBtn, more)),
      v.showFilter || v.filter ? h("div", { class: "search lw-filter" }, icon("filter"), filterInput, iconButton("x", "찾기 닫기", () => (v.filter = "", v.showFilter = false, drawBar(), drawBody()))) : null,
      h("div", { class: "lw-banner", hidden: true })].filter(Boolean));
  }

  function drawBody() {
    const hidden = hiddenFor(raw);
    const full = fullRoot();
    const viewRoot = L.filterTree(v.selectMode ? full : L.withoutHidden(full, hidden), v.filter);
    const hc = L.hiddenCount(full, hidden);
    const mc = L.matchCount(viewRoot, v.filter);
    const expanded = v.filter.trim() ? new Set([...L.flatten(viewRoot).map((n) => n.id), ...[...L.attach(viewRoot.article, viewRoot.children).keys()].map((k) => "grp:" + k)]) : v.expanded;
    const banner = bar.querySelector(".lw-banner");
    const notes = [v.filter.trim() ? (mc ? `맞는 하위 규정 ${mc}개` : "맞는 하위 규정이 없어요") : null, v.selectMode ? "숨길 항목을 체크하세요" : null, hc ? `숨긴 항목 ${hc}개` : null].filter(Boolean);
    banner.hidden = !notes.length;
    banner.replaceChildren(...[h("span", null, notes.join(" · ")),
      hc && !v.selectMode ? h("button", { type: "button", class: "link-more", onclick: () => (v.selectMode = true, drawBar(), drawBody()) }, "숨긴 항목 보기") : null,
      hc ? h("button", { type: "button", class: "link-more", onclick: () => { const all = store.get("law.hidden", {}); delete all[raw]; store.set("law.hidden", all); drawBody(); } }, "모두 되돌리기") : null].filter(Boolean));

    const opts = {
      expanded,
      toggle: (id) => (v.expanded.has(id) ? v.expanded.delete(id) : v.expanded.add(id), drawBody()),
      inline: inline(),
      highlight: v.filter.trim(),
      selectMode: v.selectMode,
      hidden,
      onHide: (k, on) => (setHidden(raw, k, on), drawBody()),
      cite: (q) => ctx.go({ q }),
      treeRoot: viewRoot,
    };
    const cited = v.selectMode ? tree.cited : tree.cited.filter((c) => !hidden.has(L.stableKey(c)));
    if (split()) body.replaceChildren(splitView(tree, viewRoot, cited, v, opts, drawBody, ctx));
    else body.replaceChildren(h("div", { class: "stack" },
      h("section", { class: "card lw-article" }, articleBody(viewRoot, opts)),
      cited.length ? citedSection(cited, viewRoot, v, opts, drawBody) : null,
      precedentSection(tree, ctx)));
  }

  async function versions() {
    const list = h("div", { class: "lw-versions" }, loading("시행 연혁을 읽는 중…"));
    const p = dialog({ title: "시행 연혁", text: "시점을 고르면 그날 시행 중이던 조문 기준으로 다시 조회해요.", body: list, ok: "현행 기준으로 보기", cancel: "닫기" });
    try {
      const vs = await L.repo.lawVersions(tree.law);
      list.replaceChildren(...(vs.length ? vs : []).map((ver) => h("button", { type: "button", class: "lw-ver" + (tree.version && tree.version.effectiveDate === ver.effectiveDate ? " on" : ""), onclick: () => {
        document.querySelector(".modal-back")?.remove();
        ctx.go({ q: raw, asOf: ver.effectiveDate });
      } }, h("b", null, `${L.formatYmd(ver.effectiveDate)} 시행`), h("span", { class: "tag" + (ver.status === "현행" ? " green" : "") }, ver.status || ""), h("small", null, [ver.revisionType, ver.promulgationDate ? "공포 " + L.formatYmd(ver.promulgationDate) : null].filter(Boolean).join(" · ")))));
      if (!vs.length) list.replaceChildren(message("시행 연혁을 찾지 못했습니다."));
    } catch (e) {
      list.replaceChildren(message(errorText(e), { error: true }));
    }
    if (await p) ctx.go({ q: raw });
  }

  async function save() {
    const opt = await saveOptions(tree);
    if (!opt) return;
    let extras = { precedents: [], relatedArticles: [] };
    if (opt.precedentBodies || opt.relatedArticles) {
      toast("판례 본문·인용 조문을 불러오는 중이에요");
      extras = await L.buildExtras(tree, opt);
    }
    const t = printable();
    if (opt.format === "hwpx") {
      try {
        const { hwpx } = await import("../lib/hwpx.js");
        download(await hwpx(t, { ...opt, extras, footer: footerLine() }), fileName(t, "hwpx"));
        toast("한글(HWPX) 문서를 저장했어요");
      } catch (e) {
        toast("한글 문서를 만들지 못했어요: " + errorText(e));
      }
    } else printDoc(t, opt, extras);
  }

  drawHead();
  drawBar();
  drawBody();
  wideMq.onchange = () => ctx.alive() && (drawBar(), drawBody());
}

/** 조문 본문(인용은 눌러지는 링크, 찾는 말은 강조) */
function citeText(text, cctx, opts, cls = "lw-text") {
  const el = h("div", { class: cls });
  const cites = cctx ? L.findCitations(text, cctx) : [];
  let pos = 0;
  const plain = (s) => {
    const q = opts.highlight;
    if (!q || L.filterNo(q)) return el.append(s);
    const low = s.toLowerCase(), ql = q.toLowerCase();
    let i = 0, j;
    while ((j = low.indexOf(ql, i)) >= 0) {
      el.append(s.slice(i, j), h("mark", null, s.slice(j, j + q.length)));
      i = j + q.length;
    }
    el.append(s.slice(i));
  };
  for (const c of cites) {
    plain(text.slice(pos, c.start));
    el.append(h("a", { class: "cite", href: "#/law?q=" + encodeURIComponent(c.query), title: c.query + " 조회", onclick: (e) => (e.preventDefault(), opts.cite(c.query)) }, text.slice(c.start, c.end)));
    pos = c.end;
  }
  plain(text.slice(pos));
  return el;
}

function articleBody(rootN, opts) {
  const cctx = L.citationContext(rootN, rootN);
  const parsed = rootN.article.parsed;
  const attached = L.attach(rootN.article, rootN.children);
  const out = h("div", { class: "lw-body" },
    h("div", { class: "lw-src" }, h("span", { class: "lv-badge l0" }, "법률"), rootN.sourceName),
    h("h3", { class: "lw-title" }, rootN.article.fullTitle));
  const group = (p, depth) => {
    const nodes = attached.get(L.pathKey(p));
    if (!nodes) return;
    const label = L.pathDisplay(p) || "조 전체";
    const count = nodes.reduce((s, n) => s + 1 + L.descendants(n), 0);
    const list = () => h("div", { class: "lw-steps" }, nodes.map((n, i) => stepNode(n, i === nodes.length - 1, opts)));
    if (opts.inline) {
      out.append(h("div", { class: "lw-inline", style: { marginLeft: depth * 14 + "px" } }, h("div", { class: "lw-inline-t" }, `↳ ${label}에 위임한 하위 규정 (${count}건)`), list()));
      return;
    }
    const id = "grp:" + L.pathKey(p);
    const open = opts.expanded.has(id);
    const counts = new Map();
    nodes.flatMap(L.flatten).forEach((n) => counts.set(n.level, (counts.get(n.level) || 0) + 1));
    const summary = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([lv, c]) => `${L.LEVELS[lv].label} ${c}건`).join(" · ");
    out.append(h("div", { class: "lw-group", style: { marginLeft: depth * 14 + "px" } },
      h("button", { type: "button", class: "lw-group-h" + (open ? " open" : ""), "aria-expanded": String(open), onclick: () => opts.toggle(id) },
        h("div", null, h("b", null, L.isEmptyPath(p) ? "조 전체에 연결된 하위 규정" : `${label} 하위 규정`), h("small", null, summary)), icon("chevron-down")),
      open ? list() : null));
  };
  const item = (it, depth) => {
    const t = citeText(it.text, cctx, opts);
    t.style.paddingLeft = depth * 14 + "px";
    out.append(t);
    group(it.path, depth);
    it.children.forEach((c) => item(c, depth + 1));
  };
  if (parsed.lead.trim()) out.append(citeText(parsed.lead, cctx, opts));
  if (!parsed.items.length && !parsed.lead.trim()) out.append(citeText(rootN.article.content, cctx, opts));
  group(L.LEAD, 0);
  parsed.items.forEach((it) => item(it, 0));
  group(L.EMPTY, 0);
  if (!rootN.children.length && !opts.highlight) out.append(h("p", { class: "note" }, "이 조문에 연결된 하위 규정을 찾지 못했습니다."));
  return out;
}

function stepNode(n, isLast, opts) {
  const open = opts.expanded.has(n.id);
  const k = L.stableKey(n);
  const isHidden = opts.hidden.has(k);
  const headRow = h("div", { class: "lw-step-h", role: "button", tabindex: 0, "aria-expanded": String(open), onclick: () => opts.toggle(n.id), onkeydown: (e) => e.key === "Enter" && opts.toggle(n.id) },
    opts.selectMode ? h("input", { type: "checkbox", checked: isHidden, title: "숨기기", "aria-label": `${L.displayHeading(n)} 숨기기`, onclick: (e) => (e.stopPropagation(), opts.onHide(k, e.target.checked)) }) : null,
    h("span", { class: "lv-text l" + n.level }, L.LEVELS[n.level].label),
    h("b", null, mark(L.displayHeading(n) || n.sourceName, opts.highlight)),
    n.children.length ? h("small", null, `하위 ${L.descendants(n)}`) : null,
    icon("chevron-down", "i chev" + (open ? " up" : "")));
  return h("div", { class: "lw-step" + (isHidden ? " dim" : "") + (isLast ? " last" : "") },
    h("div", { class: "lw-rail" }, h("span", { class: "lv-dot l" + n.level }, String(n.level + 1))),
    h("div", { class: "lw-step-b" },
      headRow,
      h("div", { class: "lw-step-src" }, n.sourceName + (n.issuer ? ` · ${n.issuer}` : "")),
      n.delegatedBy.length ? h("div", { class: "lw-step-by" }, "위임 근거: " + n.delegatedBy.map((a) => `${opts.treeRoot.sourceName} ${a.heading}`).join(", ")) : null,
      open ? citeText(n.article.body, L.citationContext(opts.treeRoot, n), opts) : null,
      open && n.children.length ? h("div", { class: "lw-steps" }, n.children.map((c, i) => stepNode(c, i === n.children.length - 1, opts))) : null));
}

function mark(text, q) {
  if (!q || L.filterNo(q)) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? text : h("span", null, text.slice(0, i), h("mark", null, text.slice(i, i + q.length)), text.slice(i + q.length));
}

function citedSection(cited, rootN, v, opts, redraw) {
  const total = cited.reduce((s, n) => s + 1 + L.descendants(n), 0);
  return h("section", { class: "card" },
    h("button", { type: "button", class: "lw-group-h plain" + (v.citedOpen ? " open" : ""), "aria-expanded": String(v.citedOpen), onclick: () => (v.citedOpen = !v.citedOpen, redraw()) },
      h("div", null, h("b", null, `인용된 법규 ${total}건`), h("small", null, "이 조문을 인용했지만 그 위치를 위임받은 규정은 아닙니다.")), icon("chevron-down")),
    v.citedOpen ? h("div", { class: "lw-steps" }, cited.map((n, i) => stepNode(n, i === cited.length - 1, opts))) : null);
}

function precedentSection(tree, ctx) {
  return h("section", { class: "card" },
    h("div", { class: "ch" }, icon("gavel"), h("h3", null, "관련 판례"), h("div", { class: "ch-acts" }, `${tree.precedents.length}건`)),
    tree.precedentBasis ? h("p", { class: "note", style: { marginBottom: "6px" } }, tree.precedentBasis) : null,
    tree.precedents.length ? h("div", { class: "list" }, tree.precedents.map((p) => precRow(p, ctx))) : h("p", { class: "note" }, "이 조문을 인용한 판례를 찾지 못했어요."));
}

// ---- 나눠 보기(넓은 화면): 왼쪽 목록, 오른쪽 본문

function splitView(tree, viewRoot, cited, v, opts, redraw, ctx) {
  const all = [...L.flatten(viewRoot), ...cited.flatMap(L.flatten)];
  if (!all.some((n) => n.id === v.selected)) v.selected = viewRoot.id;
  const sel = all.find((n) => n.id === v.selected) || viewRoot;
  const pick = (id) => (v.selected = id, redraw());
  const row = (n, depth) => h("button", { type: "button", class: "lw-nav-r" + (n.id === sel.id ? " on" : "") + (opts.hidden.has(L.stableKey(n)) ? " dim" : ""), style: { paddingLeft: 10 + depth * 14 + "px" }, onclick: () => pick(n.id) },
    h("span", { class: "lv-dot sm l" + n.level }, String(n.level + 1)),
    h("span", { class: "t" }, mark(n.level === L.LAW ? n.article.fullTitle : L.displayHeading(n) || n.sourceName, opts.highlight)),
    n.level >= L.SUP ? h("small", null, n.sourceName) : null);
  const walk = (n, d, out) => (out.push(row(n, d)), n.children.forEach((c) => walk(c, d + 1, out)), out);
  const nav = h("div", { class: "card lw-nav" },
    walk(viewRoot, 0, []),
    cited.length ? [h("div", { class: "section-label" }, `인용된 법규 ${cited.length}건`), cited.flatMap((c) => walk(c, 0, []))] : null,
    h("div", { class: "section-label" }, `관련 판례 ${tree.precedents.length}건`),
    tree.precedents.length ? h("div", { class: "list" }, tree.precedents.map((p) => precRow(p, ctx))) : h("p", { class: "note" }, "이 조문을 인용한 판례를 찾지 못했어요."));

  let detail;
  if (sel.id === viewRoot.id) detail = h("section", { class: "card lw-article" }, articleBody(viewRoot, { ...opts, inline: false }));
  else {
    const parentOf = (target) => all.find((n) => n.children.some((c) => c.id === target.id));
    const parent = parentOf(sel);
    const k = L.stableKey(sel);
    detail = h("section", { class: "card lw-article" },
      h("div", { class: "lw-src" }, h("span", { class: "lv-badge l" + sel.level }, L.LEVELS[sel.level].label), sel.sourceName + (sel.issuer ? ` · ${sel.issuer}` : "")),
      h("h3", { class: "lw-title" }, L.displayHeading(sel) || sel.sourceName),
      sel.anchor && !L.isEmptyPath(sel.anchor) && sel.level !== L.LAW ? h("div", { class: "lw-step-by" }, `${viewRoot.sourceName} ${L.noDisplay(viewRoot.article.number)} ${L.pathDisplay(sel.anchor)}을(를) 위임받음`) : null,
      sel.delegatedBy.length ? h("div", { class: "lw-step-by" }, "위임 근거: " + sel.delegatedBy.map((a) => `${viewRoot.sourceName} ${a.heading}`).join(", ")) : null,
      citeText(sel.article.body, L.citationContext(viewRoot, sel), opts),
      sel.children.length ? [h("div", { class: "section-label" }, "이 조문이 위임한 하위 규정"), h("div", { class: "lw-chips" }, sel.children.map((c) => h("button", { type: "button", class: "pill sm", onclick: () => pick(c.id) }, `${L.LEVELS[c.level].short} ${L.noDisplay(c.article.number) || c.article.title}${c.part ? " " + c.part : ""}`)))] : null,
      h("div", { class: "lw-detail-acts" },
        parent ? h("button", { type: "button", class: "btn ghost sm", onclick: () => pick(parent.id) }, `상위 ${L.LEVELS[parent.level].label} ${L.noDisplay(parent.article.number)} 보기`) : null,
        opts.selectMode ? h("label", { class: "lw-check" }, h("input", { type: "checkbox", checked: opts.hidden.has(k), onchange: (e) => opts.onHide(k, e.target.checked) }), "이 항목 숨기기") : null));
  }
  return h("div", { class: "lw-split" }, nav, detail);
}

// ------------------------------------------------------------------ 비교표

function compareView(root, tree, ctx, params) {
  const title = `${tree.law.name} ${L.queryTarget(tree.query)}`;
  setHeader("비교표", title);
  const rootN = L.withoutHidden(tree.root, hiddenFor(tree.query.raw));
  const available = new Set(rootN.children.flatMap(L.flatten).map((n) => n.level));
  const saved = store.get("law.cmpLevels", null);
  let chosen = new Set((saved || [...available]).filter((l) => l !== L.LAW));
  if (!chosen.size) chosen.add(L.DECREE);
  const chips = h("div", { class: "lw-chips" });
  const table = h("div", { class: "lw-cmp-wrap" });
  const draw = () => {
    chips.replaceChildren(h("span", { class: "pill sm on", "aria-disabled": "true" }, "법률(고정)"),
      ...[L.DECREE, L.RULE, L.SUP, L.DETAIL].map((lv) => h("button", { type: "button", class: "pill sm" + (chosen.has(lv) ? " on" : ""), onclick: () => (chosen.has(lv) ? chosen.delete(lv) : chosen.add(lv), store.set("law.cmpLevels", [...chosen]), draw()) }, L.LEVELS[lv].label)));
    table.replaceChildren(compareTable(rootN, chosen));
  };
  root.append(
    h("div", { class: "lw-bar" },
      h("button", { type: "button", class: "btn ghost sm", onclick: () => history.back() }, icon("chevron-left"), "트리로"),
      chips,
      h("button", { type: "button", class: "btn ghost sm", onclick: () => printDoc({ ...tree, root: rootN }, { compare: true, levels: new Set([L.LAW, ...chosen]), precedentList: false, paper: "A4" }, { precedents: [], relatedArticles: [] }) }, icon("printer"), "PDF 저장"),
      h("button", { type: "button", class: "btn ghost sm", onclick: async () => {
        const { hwpx } = await import("../lib/hwpx.js");
        download(await hwpx({ ...tree, root: rootN }, { compare: true, levels: new Set([L.LAW, ...chosen]), paper: "A4", precedentList: false, extras: { precedents: [], relatedArticles: [] }, footer: footerLine() }), fileName(tree, "hwpx"));
      } }, icon("file-down"), "한글 저장")),
    table);
  draw();
}

/** 비교표 표: 하위 규정 칸은 법률 칸에서 위임한 줄과 같은 높이에서 시작한다. */
function compareTable(rootN, chosen) {
  const levels = L.compareColumns(chosen);
  const rows = L.compareRows(rootN, chosen);
  return h("table", { class: "lw-cmp" },
    h("thead", null, h("tr", null, levels.map((lv) => h("th", { class: "l" + lv }, L.LEVELS[lv].label)))),
    h("tbody", null, rows.map((r) => {
      const lead = r.cells.size ? r.lawText.slice(0, r.anchorStart).split("\n").length - 1 : 0;
      const law = h("td", null, r.lawText);
      return h("tr", null, law, levels.slice(1).map((lv) => {
        const nodes = r.cells.get(lv) || [];
        const td = h("td", { "data-lead": lead });
        nodes.forEach((n, i) => {
          if (i) td.append(h("br"));
          td.append(...[h("b", null, L.displayHeading(n) || n.sourceName), lv >= L.SUP ? h("small", null, n.sourceName) : null, h("div", null, n.article.body)].filter(Boolean));
        });
        return td;
      }));
    })));
}
// 같은 줄 맞추기: 법률 칸에서 위임한 줄이 시작하는 높이만큼 하위 칸을 내린다(그린 뒤 실제 줄 높이로 계산).
function alignCompare(table) {
  for (const tr of table.querySelectorAll("tbody tr")) {
    const law = tr.cells[0];
    const lead = +(tr.cells[1]?.dataset.lead || 0);
    if (!lead) continue;
    const lh = parseFloat(getComputedStyle(law).lineHeight) || 18;
    for (const td of [...tr.cells].slice(1)) if (td.childNodes.length) td.style.paddingTop = 8 + lead * lh + "px";
  }
}
new MutationObserver(() => document.querySelectorAll(".lw-cmp:not([data-aligned])").forEach((t) => (t.dataset.aligned = "1", requestAnimationFrame(() => alignCompare(t))))).observe(document.body, { childList: true, subtree: true });

// ------------------------------------------------------------------ 저장(PDF·한글)

const footerLine = () => `${APP_NAME} v${APP_VERSION} · 만든이: 이현덕 with Claude (hdlee73@gmail.com) · 금융감독원 공식 자료가 아닙니다`;
const fileName = (tree, ext) => `${tree.law.name}_${L.queryTarget(tree.query)}`.replace(/[\\/:*?"<>|\s]+/g, "_") + "." + ext;

async function saveOptions(tree) {
  const present = new Set(tree.root.children.flatMap(L.flatten).map((n) => n.level));
  const radio = (name, value, label, checked) => h("label", { class: "lw-opt" }, h("input", { type: "radio", name: "_" + name, value, checked }), label);
  const check = (id, label, checked, disabled = false) => h("label", { class: "lw-opt" }, h("input", { type: "checkbox", "data-k": id, checked, disabled }), label);
  const body = h("div", { class: "lw-save" },
    h("div", { class: "section-label" }, "저장 형식"),
    radio("fmt", "pdf", "PDF (인쇄 창에서 ‘PDF로 저장’)", true), radio("fmt", "hwpx", "한글(HWPX)", false),
    h("div", { class: "section-label" }, "보기 방식"),
    radio("mode", "seq", "조문 아래에 하위 규정을 차례로", true), radio("mode", "cmp", "단계별 비교표(가로)", false),
    h("div", { class: "section-label" }, "용지"),
    radio("paper", "A4", "A4", true), radio("paper", "B4", "B4", false), radio("paper", "Letter", "Letter", false),
    h("div", { class: "section-label" }, "법령"),
    check("lv0", "법률 조문 (항상 포함)", true, true),
    [L.DECREE, L.RULE, L.SUP, L.DETAIL].map((lv) => check("lv" + lv, lv === L.DETAIL ? "감독업무 시행세칙" : L.LEVELS[lv].label, true, !present.has(lv))),
    h("div", { class: "section-label" }, "판례"),
    check("precList", "판례 목록", true), check("precBodies", "판례 본문 (최대 10건)", false),
    h("div", { class: "section-label" }, "그 밖에"),
    check("related", "본문이 인용한 같은 법의 다른 조문", false));
  const ok = await dialog({ title: "저장할 범위", body, ok: "저장", cancel: "취소" });
  if (!ok) return null;
  const val = (n) => body.querySelector(`input[name="_${n}"]:checked`).value;
  const on = (k) => body.querySelector(`input[data-k="${k}"]`).checked;
  return {
    format: val("fmt"),
    compare: val("mode") === "cmp",
    paper: val("paper"),
    levels: new Set([L.LAW, ...[L.DECREE, L.RULE, L.SUP, L.DETAIL].filter((lv) => on("lv" + lv))]),
    precedentList: on("precList"),
    precedentBodies: on("precBodies"),
    relatedArticles: on("related"),
  };
}

/** 단계 필터: 고르지 않은 단계는 빼고 그 아래 단계는 위로 올린다 */
export function keepLevels(children, levels) {
  return children.flatMap((c) => {
    const kept = keepLevels(c.children, levels);
    return levels.has(c.level) ? [{ ...c, children: kept }] : kept;
  });
}

/** 인쇄용 문서를 만들어 브라우저 인쇄 창(‘PDF로 저장’)을 연다. */
function printDoc(tree, opt, extras) {
  const levels = opt.levels;
  const landscape = opt.compare && L.compareColumns(levels).length >= 2;
  const doc = h("div", { class: "print-doc" });
  const p = (text, cls) => doc.append(h("p", { class: cls || "" }, text));
  doc.append(h("h1", null, "FSS Insights 위임 법령 조회 결과"), h("h2", null, `${tree.law.name} ${L.queryTarget(tree.query)}`));
  p("기준: " + (tree.version ? `${L.formatYmd(tree.version.effectiveDate)} 시행 (${tree.version.status || "연혁"})` : "현행") + "   ·   출력: " + new Date().toLocaleDateString("ko-KR"), "meta");
  if (landscape) p(`비교 방식: ${L.compareColumns(levels).length}단 비교 (${L.compareColumns(levels).map((l) => L.LEVELS[l].label).join("·")}) · ${opt.paper} 가로`, "meta");
  else p("포함 범위: " + ["법률", ...[L.DECREE, L.RULE, L.SUP, L.DETAIL].filter((l) => levels.has(l)).map((l) => L.LEVELS[l].label), opt.precedentList ? "판례 목록" : null, opt.precedentBodies ? "판례 본문" : null, opt.relatedArticles ? "인용 조문" : null].filter(Boolean).join(", "), "meta");
  tree.warnings.forEach((w) => p("※ " + w, "gray"));

  const nodeBlock = (n, depth, into = doc) => {
    const box = h("div", { class: "pn", style: { marginLeft: depth * 14 + "pt" } },
      h("div", { class: "pl l" + n.level }, `[${L.LEVELS[n.level].label}] ${n.sourceName}`),
      h("div", { class: "ph" }, L.displayHeading(n)),
      h("div", { class: "pb" }, n.article.body));
    into.append(box);
    n.children.forEach((c) => nodeBlock(c, depth + 1, into));
  };
  if (landscape) {
    const t = compareTable(tree.root, new Set([...levels].filter((l) => l !== L.LAW)));
    doc.append(t);
  } else {
    const root = tree.root;
    const attached = L.attach(root.article, keepLevels(root.children, levels));
    const parsed = root.article.parsed;
    doc.append(h("div", { class: "pl l0" }, `[법률] ${root.sourceName}`), h("div", { class: "ph" }, root.article.heading));
    const group = (path, depth, label) => {
      const nodes = attached.get(L.pathKey(path));
      if (!nodes) return;
      doc.append(h("div", { class: "pg", style: { marginLeft: (depth + 1) * 14 + "pt" } }, `▼ ${label} 하위 규정`));
      nodes.forEach((n) => nodeBlock(n, depth + 1));
    };
    if (parsed.lead.trim()) doc.append(h("div", { class: "pb" }, parsed.lead));
    if (!parsed.items.length && !parsed.lead.trim()) doc.append(h("div", { class: "pb" }, root.article.content));
    group(L.LEAD, 0, "각 호 외의 부분");
    const item = (it, d) => (doc.append(h("div", { class: "pb", style: { marginLeft: d * 14 + "pt" } }, it.text)), group(it.path, d, L.pathDisplay(it.path)), it.children.forEach((c) => item(c, d + 1)));
    parsed.items.forEach((it) => item(it, 0));
    group(L.EMPTY, 0, "조 전체에 연결된");
  }
  const cited = keepLevels(tree.cited, levels);
  if (cited.length) {
    doc.append(h("h3", null, `인용된 법규 (${cited.reduce((s, n) => s + 1 + L.descendants(n), 0)}건)`));
    p("이 조문을 인용했지만 위임받은 규정은 아닙니다.", "meta");
    cited.forEach((n) => (nodeBlock(n, 0), n.delegatedBy.length && p("위임 근거: " + n.delegatedBy.map((a) => `${tree.root.sourceName} ${a.heading}`).join(", "), "meta")));
  }
  if (opt.relatedArticles) {
    doc.append(h("h3", null, `인용 조문 (${extras.relatedArticles.length}건)`));
    if (!extras.relatedArticles.length) p("본문이 인용한 같은 법의 다른 조문이 없거나 불러오지 못했습니다.", "gray");
    extras.relatedArticles.forEach((a) => doc.append(h("div", { class: "ph" }, `${tree.law.name} ${a.heading}`), h("div", { class: "pb" }, a.body)));
  }
  if (opt.precedentList) {
    doc.append(h("h3", null, `관련 판례 (${tree.precedents.length}건)`));
    if (!tree.precedents.length) p("찾은 판례가 없습니다.", "gray");
    tree.precedents.forEach((x) => doc.append(h("div", { class: "ph" }, "• " + x.caseName), h("p", { class: "meta", style: { marginLeft: "14pt" } }, [x.court, x.caseNumber, x.decisionDate ? L.formatYmd(x.decisionDate) : null].filter(Boolean).join(" · "))));
  }
  if (opt.precedentBodies) {
    doc.append(h("h3", null, `판례 본문 (${extras.precedents.length}건)`));
    if (!extras.precedents.length) p("불러온 판례 본문이 없습니다.", "gray");
    extras.precedents.forEach((d) => {
      doc.append(h("div", { class: "ph" }, d.summary.caseName), h("p", { class: "meta" }, [d.summary.court, d.summary.caseNumber, d.summary.decisionDate ? L.formatYmd(d.summary.decisionDate) : null].filter(Boolean).join(" · ")));
      [["판시사항", d.holdings], ["판결요지", d.gist], ["참조조문", d.referencedArticles], ["참조판례", d.referencedCases]].forEach(([t, b]) => b.trim() && doc.append(h("div", { class: "pk" }, `[${t}]`), h("div", { class: "pb" }, b)));
    });
  }
  p("출처: 국가법령정보센터 공동활용 API (law.go.kr). 법적 판단의 근거로는 반드시 원문을 확인하세요.", "foot");
  p(footerLine(), "foot");

  const size = { A4: "210mm 297mm", B4: "257mm 364mm", Letter: "8.5in 11in" }[opt.paper || "A4"].split(" ");
  const style = h("style", null, `@page { size: ${landscape ? size[1] + " " + size[0] : size.join(" ")}; margin: 17mm; }`);
  document.head.append(style);
  document.body.append(doc);
  document.body.classList.add("printing");
  const done = () => (doc.remove(), style.remove(), document.body.classList.remove("printing"));
  addEventListener("afterprint", done, { once: true });
  const prevTitle = document.title;
  document.title = fileName(tree, "pdf").replace(/\.pdf$/, "");
  setTimeout(() => {
    window.print();
    document.title = prevTitle;
    setTimeout(() => document.body.contains(doc) && matchMedia("print").matches === false && done(), 1500);
  }, 50);
}

// ------------------------------------------------------------------ 판례·법령·행정규칙 본문

async function precedentView(root, params) {
  setHeader("판례", "판시사항 · 판결요지 · 참조조문 · 전문");
  const box = h("div", null, loading());
  root.append(box);
  try {
    const d = await L.repo.precedent(params.prec);
    const s = d.summary;
    const sec = (t, b, hl) => (b.trim() ? h("section", { class: "card" + (hl ? " lw-hl" : "") }, h("div", { class: "ch" }, h("h3", null, t)), citeText(b, null, { highlight: "" }, "lw-text prose")) : null);
    const refs = L.extractCitations(d.referencedArticles + "\n" + d.gist);
    box.replaceChildren(h("div", { class: "stack" },
      h("section", { class: "card" }, h("h2", { class: "lw-title" }, s.caseName), h("div", { class: "note" }, [s.court, s.caseNumber, s.decisionDate ? L.formatYmd(s.decisionDate) : null, s.caseType].filter(Boolean).join(" · ")),
        h("div", { class: "lw-detail-acts" }, h("a", { class: "btn ghost sm", href: `https://www.law.go.kr/LSW/precInfoP.do?precSeq=${encodeURIComponent(s.serialNo || params.prec)}`, target: "_blank", rel: "noopener" }, icon("external-link"), "법령정보센터에서 보기"))),
      refs.length ? h("section", { class: "card" }, h("div", { class: "ch" }, icon("network"), h("h3", null, "인용 조문 위임 트리로 보기")), h("div", { class: "lw-chips" }, refs.map((c) => h("a", { class: "pill sm", href: "#/law?q=" + encodeURIComponent(c.query) }, c.text)))) : null,
      sec("판시사항", d.holdings), sec("판결요지", d.gist, true), sec("참조조문", d.referencedArticles), sec("참조판례", d.referencedCases), sec("전문", d.fullText)));
  } catch (e) {
    box.replaceChildren(message(errorText(e), { error: true }));
  }
}

async function lawDocView(root, params, ctx) {
  const name = params.name || "법령";
  setHeader(name, "조문을 누르면 하위 규정까지 위임 트리로 보여 드려요");
  const box = h("div", null, loading("조문을 읽는 중…"));
  root.append(box);
  try {
    const arts = (await L.repo.lawArticles({ mst: params.mst })).filter((a) => a.number);
    if (!ctx.alive()) return;
    const filter = h("input", { type: "search", placeholder: "조문 제목·내용에서 찾기", "aria-label": "조문 찾기" });
    const list = h("div", { class: "stack" });
    const draw = () => {
      const q = filter.value.trim();
      const shown = q ? arts.filter((a) => (a.title + a.content).includes(q)) : arts;
      list.replaceChildren(...shown.slice(0, 400).map((a) => h("section", { class: "card lw-doc-a" },
        h("div", { class: "lw-head-row" }, h("h3", { class: "lw-title" }, a.fullTitle), iconButton("network", "위임 트리 보기", () => ctx.go({ q: `${name} ${L.noDisplay(a.number)}` }))),
        citeText(a.body, { lawName: name, ownName: name }, { highlight: q, cite: (x) => ctx.go({ q: x }) }))));
      if (!shown.length) list.append(message("맞는 조문이 없습니다."));
    };
    filter.addEventListener("input", draw);
    box.replaceChildren(h("div", { class: "search" }, icon("search"), filter), h("p", { class: "note", style: { margin: "8px 2px" } }, `조문 ${arts.length}개`), list);
    draw();
  } catch (e) {
    box.replaceChildren(message(errorText(e), { error: true }));
  }
}

async function adminRuleView(root, params, ctx) {
  setHeader(params.name || "행정규칙", "감독규정·시행세칙 등 행정규칙 본문");
  const box = h("div", null, loading("본문을 읽는 중…"));
  root.append(box);
  try {
    const doc = await L.repo.adminRule(params.adm);
    if (!ctx.alive()) return;
    setHeader(doc.name || params.name || "행정규칙", [doc.agency, `조문 ${doc.articles.length}개`].filter(Boolean).join(" · "));
    box.replaceChildren(h("div", { class: "stack" }, doc.articles.length
      ? doc.articles.map((a) => h("section", { class: "card lw-doc-a" }, h("h3", { class: "lw-title" }, a.fullTitle), citeText(a.body, null, { highlight: "" })))
      : message("조문을 나누지 못했습니다. 법령정보센터에서 원문을 확인해 주세요.")));
  } catch (e) {
    box.replaceChildren(message(errorText(e), { error: true }));
  }
}
