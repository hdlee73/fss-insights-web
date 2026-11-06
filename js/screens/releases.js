// 보도자료(금융당국) · 금융관련 리포트(연구기관) 화면. 기관 탭 → 최근 20건, 제목 검색(10년), 저장함, 기관 추가.
import { setHeader } from "../app.js";
import { cached, dialog, dotDate, errorText, forget, h, icon, iconButton, loading, message, openUrl, searchBox, share, store, tabs, toast } from "../core.js";
import { AGENCIES, GROUPS, addCustom, agencyById, customList, latest, latestCustom, removeCustom, search } from "../lib/agencies.js";

const searches = new Map(); // 기관별 검색 상태(화면을 오가도 유지)

export function savedItems() {
  return store.get("savedReleases", []);
}
function isSaved(link) {
  return savedItems().some((x) => x.link === link);
}
function toggleSaved(item) {
  const list = savedItems();
  const i = list.findIndex((x) => x.link === item.link);
  if (i >= 0) list.splice(i, 1);
  else list.unshift({ ...item, group: agencyById(item.agency)?.group || item.group });
  store.set("savedReleases", list);
  return i < 0;
}

/** 목록 한 줄(브리핑·알림에서도 쓴다). */
export function releaseRow(item, { showAgency = false, isNew = false } = {}) {
  const meta = [showAgency ? item.label : null, item.author, item.date ? dotDate(item.date) : null].filter(Boolean).join(" · ");
  const saveButton = () => {
    const saved = isSaved(item.link);
    const b = iconButton(saved ? "bookmark-check" : "bookmark", saved ? "저장함에서 빼기" : "저장함에 담기", () => {
      const now = toggleSaved(item);
      b.replaceWith(saveButton());
      toast(now ? "저장함에 담았습니다." : "저장함에서 뺐습니다.");
    }, saved ? "on" : "");
    return b;
  };
  return h(
    "div",
    { class: "item" },
    h("div", { class: "body", onclick: () => openUrl(item.link), role: "link", tabindex: 0, onkeydown: (e) => e.key === "Enter" && openUrl(item.link) },
      h("div", { class: "t" }, item.title),
      h("div", { class: "m" }, isNew ? h("span", { class: "new" }, "N") : null, meta)),
    h("div", { class: "acts" }, saveButton(), iconButton("share-2", "제목과 링크 공유", () => share(item.title, item.link)))
  );
}

export async function render(root, params, ctx) {
  const groupKey = ctx.id === "press" ? "PRESS" : "RESEARCH";
  const group = GROUPS[groupKey];
  const agencies = AGENCIES.filter((a) => a.group === groupKey);
  const institutes = customList(groupKey);
  const showSaved = params.saved === "1";
  const tabIds = [...agencies.map((a) => a.id), ...institutes.map((x) => "c:" + x.url)];
  let sel = Math.max(0, tabIds.indexOf(params.agency || store.get("tab." + groupKey, tabIds[0])));
  if (sel >= tabIds.length) sel = 0;

  setHeader(group.label, groupKey === "PRESS" ? "금융당국 보도자료 최근 20건 · 제목 검색" : "국내외 연구기관 보고서 최근 20건", [
    h("button", { class: "pill", type: "button", onclick: addInstitute }, icon("plus"), h("span", { class: "lbl" }, `${group.addNoun} 추가`)),
    h("button", { class: "pill" + (showSaved ? " on" : ""), type: "button", onclick: () => ctx.go({ agency: tabIds[sel], saved: showSaved ? null : "1" }) }, icon("bookmark"), h("span", { class: "lbl" }, "저장함")),
  ]);

  async function addInstitute() {
    const v = await dialog({
      title: `${group.addNoun} 추가`,
      text: "목록 페이지 주소를 넣으면 제목과 날짜를 읽어 옵니다. 웹 버전은 서버가 허용한 사이트(금융기관·연구원 등)만 읽을 수 있습니다.",
      fields: [{ name: "name", label: `${group.addNoun} 이름` }, { name: "url", label: `${group.noun} 목록 주소(URL)`, placeholder: "https://" }],
      ok: "추가",
    });
    if (!v || !v.name || !v.url) return;
    const url = /^https?:\/\//.test(v.url) ? v.url : "https://" + v.url;
    addCustom(v.name, url, groupKey);
    ctx.go({ agency: "c:" + url });
  }

  root.append(tabs([...agencies.map((a) => a.short), ...institutes.map((x) => x.name)], showSaved ? -1 : sel, (i) => {
    store.set("tab." + groupKey, tabIds[i]);
    ctx.go({ agency: tabIds[i] }, { replace: true });
  }));

  if (showSaved) {
    const saved = savedItems().filter((x) => (x.group || agencyById(x.agency)?.group || "RESEARCH") === groupKey);
    root.append(h("div", { class: "section-label" }, `저장한 ${group.noun} ${saved.length}건`));
    root.append(saved.length ? h("div", { class: "card list" }, saved.map((x) => releaseRow(x, { showAgency: true }))) : message("저장한 자료가 없습니다.\n목록의 북마크 버튼을 눌러 담아 두세요."));
    return;
  }

  const agency = agencies[sel];
  const inst = agency ? null : institutes[sel - agencies.length];
  const name = agency ? agency.label : inst.name;
  const home = agency ? agency.home : inst.url;
  const noun = agency ? agency.noun : "자료";
  const searchable = agency && groupKey === "PRESS" && agency.deepSearch;
  const key = agency ? agency.id : "c:" + inst.url;

  root.append(h("a", { class: "banner", href: home, target: "_blank", rel: "noopener" }, searchable ? `${name} 사이트에서 전체 목록 보기` : `${name} 사이트에서 찾기`, icon("external-link")));

  const body = h("div");
  if (searchable) {
    const st = searches.get(key);
    const box = searchBox({ placeholder: `${agency.short} 과거 ${noun} 제목 검색`, value: st?.query || "", onSearch: (q) => q && runSearch(q) });
    root.append(box);
  }
  root.append(body);

  const seenKey = "seen." + key;
  const seen = new Set(store.get(seenKey, []));

  function showLatest() {
    const label = h("div", { class: "section-label" }, `최근 20건`, h("div", { class: "acts" },
      inst ? iconButton("trash-2", `${name} 삭제`, async () => {
        if (await dialog({ title: `${name} 삭제`, text: `이 ${group.addNoun}을(를) 목록에서 뺍니다.`, ok: "삭제", danger: true })) {
          removeCustom(inst.url);
          ctx.go({}, { replace: true });
        }
      }) : null,
      iconButton("refresh-cw", "새로고침", () => {
        forget("rel:" + key);
        showLatest();
      })));
    const list = h("div", { class: "card list" }, loading());
    body.replaceChildren(label, list);
    const draw = (items) => {
      if (!ctx.alive()) return;
      list.replaceChildren(...items.map((x) => releaseRow(x, { isNew: seen.size > 0 && !seen.has(x.link) })));
    };
    cached("rel:" + key, 10 * 60 * 1000, () => (agency ? latest(agency, 20, draw) : latestCustom(inst, 20)))
      .then((items) => {
        draw(items);
        store.set(seenKey, [...new Set([...items.map((x) => x.link), ...seen])].slice(0, 200));
      })
      .catch((e) => {
        if (!ctx.alive()) return;
        list.replaceChildren(message(errorText(e), { error: true, action: "사이트에서 보기", onAction: () => openUrl(home) }));
      });
  }

  // 검색 결과 그리기. busy면 아래에 읽는 중 표시. 화면을 다시 열면 기억한 결과를 그대로 보여 준다.
  function drawSearch(st, busy = false, err = null) {
    const query = st.query;
    const label = h("div", { class: "section-label" }, h("span", null, `‘${query}’ 검색 결과 ${st.items.length}건`), h("div", { class: "acts" }, h("button", { class: "btn ghost sm", type: "button", onclick: () => (searches.delete(key), root.querySelector(".search input").value = "", showLatest()) }, "지우기")));
    const list = h("div", { class: "card list" });
    const tail = h("div", { class: "row-gap", style: { margin: "10px 0" } });
    body.replaceChildren(label, list, tail);
    list.append(...st.items.map((x) => releaseRow(x)));
    if (busy) list.append(loading("과거 자료를 찾는 중…"));
    if (err) list.append(message(err, { error: true }));
    if (!busy && !err && !st.items.length) list.append(message(`읽은 범위에서 일치하는 ${noun}이 없습니다.`));
    tail.append(
      !busy && st.hasMore ? h("button", { class: "btn ghost", type: "button", onclick: () => runSearch(query, true) }, "더 오래된 항목 찾기") : "",
      h("button", { class: "btn ghost", type: "button", onclick: () => openUrl(agency.siteSearch ? agency.siteSearch(query) : agency.home) }, "사이트에서 직접 검색")
    );
  }

  async function runSearch(query, more = false) {
    const prev = searches.get(key);
    const st = more && prev ? prev : { query, items: [], nextPage: 1, hasMore: false };
    searches.set(key, st);
    drawSearch(st, true);
    try {
      const page = await search(agency, query, st.nextPage);
      for (const x of page.items) if (!st.items.some((y) => y.link === x.link)) st.items.push(x);
      st.items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      st.hasMore = page.hasMore;
      st.nextPage = page.nextPage;
      if (ctx.alive()) drawSearch(st);
    } catch (e) {
      if (ctx.alive()) drawSearch(st, false, errorText(e));
    }
  }

  const st = searches.get(key);
  if (searchable && st) drawSearch(st);
  else showLatest();
}
