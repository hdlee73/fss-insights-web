// 빠른 검색(Ctrl+K / ⌘K): 이 브라우저에 저장된 기사·보도자료·리포트·보관함을 제목+요약에서 바로 찾는다(초성 검색 지원).
import { dotDate, h, icon, openUrl } from "./core.js";
import { idbAll } from "./lib/offline.js";
import { allItems, getNote, isRead, markRead } from "./lib/vault.js";
import { matchText } from "./lib/text.js";

let corpus = null;
let corpusAt = 0;

async function loadCorpus() {
  if (corpus && Date.now() - corpusAt < 15000) return corpus;
  const map = new Map();
  const add = (it) => {
    if (!it?.link || !it.title) return;
    const prev = map.get(it.link);
    if (!prev || (it.summary && !prev.summary)) map.set(it.link, { ...prev, ...it });
  };
  for (const e of await idbAll("news:home:")) for (const a of e.value?.articles || []) add({ kind: "news", link: a.link, title: a.title, summary: a.summary || "", source: a.source || "", at: a.at || 0 });
  for (const e of await idbAll("rel:")) for (const x of Array.isArray(e.value) ? e.value : []) add({ kind: "release", link: x.link, title: x.title, summary: "", source: x.label || x.author || "", at: x.date ? Date.parse(x.date) || 0 : 0, date: x.date });
  for (const v of allItems()) add({ ...v, saved: true });
  corpus = [...map.values()].sort((a, b) => (b.at || 0) - (a.at || 0));
  corpusAt = Date.now();
  return corpus;
}

const KIND = { news: "기사", release: "보도·리포트" };
let panel = null;

export function openQuickSearch() {
  if (panel) return panel.querySelector("input")?.focus();
  const input = h("input", { type: "search", placeholder: "제목·요약 검색 (초성 가능: ㄱㄱㅇ → 금감원)", "aria-label": "빠른 검색", autocomplete: "off", enterkeyhint: "search" });
  const unreadOnly = h("input", { type: "checkbox" });
  const list = h("div", { class: "qs-list", role: "listbox" });
  const foot = h("div", { class: "qs-foot" });
  let results = [];
  let active = 0;

  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    panel.remove();
    panel = null;
  };
  const choose = (it) => {
    markRead(it.link);
    openUrl(it.link);
    close();
  };
  const paint = () => {
    list.replaceChildren(...results.map((it, i) => {
      const meta = [KIND[it.kind], it.source, it.at ? dotDate(new Date(it.at + 9 * 3600e3).toISOString()) : it.date ? dotDate(it.date) : ""].filter(Boolean).join(" · ");
      return h("div", { class: "qs-item" + (i === active ? " on" : "") + (isRead(it.link) ? " read" : ""), role: "option", "aria-selected": String(i === active), onclick: () => choose(it), onmousemove: () => i !== active && ((active = i), paint()) },
        h("div", { class: "qs-t" }, it.title), h("div", { class: "qs-m" }, meta, it.saved ? " · 보관함" : "", getNote(it.link) ? " · 메모" : ""), it.summary ? h("div", { class: "qs-s" }, it.summary) : null);
    }));
    list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  };
  const run = async () => {
    const q = input.value.trim();
    const all = await loadCorpus();
    if (!panel) return;
    if (!q) {
      results = [];
      list.replaceChildren(h("div", { class: "qs-empty" }, all.length ? `저장된 자료 ${all.length}건에서 찾습니다. 검색어를 입력하세요.` : "아직 저장된 자료가 없습니다. 오늘의 브리핑이나 뉴스검색을 한 번 열어 자료를 불러오세요."));
      return;
    }
    results = all.filter((it) => (!unreadOnly.checked || !isRead(it.link)) && matchText(`${it.title} ${it.summary || ""}`, q)).slice(0, 40);
    active = 0;
    if (!results.length) return void list.replaceChildren(h("div", { class: "qs-empty" }, "찾는 자료가 없습니다. 검색어를 줄이거나 초성만 입력해 보세요."));
    paint();
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!results.length) return;
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length;
      paint();
    } else if (e.key === "Enter" && results[active] && panel.contains(document.activeElement) && document.activeElement === input) {
      e.preventDefault();
      choose(results[active]);
    }
  };
  panel = h("div", { class: "modal-back qs-back", onclick: (e) => e.target === panel && close() },
    h("div", { class: "qs", role: "dialog", "aria-label": "빠른 검색" },
      h("div", { class: "qs-in" }, icon("search"), input, h("kbd", null, "Esc")),
      h("label", { class: "qs-opt" }, unreadOnly, "안 읽은 글만"),
      list, foot));
  foot.textContent = "↑↓ 이동 · Enter 열기 · 저장된 자료(최근 불러온 기사·보도자료, 보관함)에서 찾습니다";
  document.body.append(panel);
  document.addEventListener("keydown", onKey, true);
  input.addEventListener("input", run);
  unreadOnly.addEventListener("change", run);
  input.focus();
  run();
}

export function installQuickSearchKey() {
  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openQuickSearch();
    }
  });
}
