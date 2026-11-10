// 보관함: 스크랩한 기사·보도자료·리포트를 모아 보고, 항목마다 메모를 남긴다. 서버 없이 이 브라우저에만 저장된다.
import { setHeader } from "../app.js";
import { dialog, dotDate, download, h, icon, iconButton, message, openUrl, share, tabs, toast, ymd } from "../core.js";
import { allItems, editNote, exportAll, importAll, isRead, markRead, removeItem, setNote } from "../lib/vault.js";
import { matchText } from "../lib/text.js";

let tab = 0;
let query = "";

export async function render(root, params, ctx) {
  const redraw = () => ctx.go(params, { replace: true });
  setHeader("보관함", "스크랩한 기사·자료와 메모 · 이 브라우저에만 저장", [
    h("button", { class: "pill", type: "button", onclick: () => {
      download(new Blob([exportAll()], { type: "application/json" }), `fss-보관함-${ymd(new Date())}.json`);
    } }, icon("download"), h("span", { class: "lbl" }, "내보내기")),
    h("button", { class: "pill", type: "button", onclick: () => pickFile(redraw) }, icon("upload"), h("span", { class: "lbl" }, "가져오기")),
  ]);

  const items = allItems();
  const labels = ["전체", "기사", "보도자료·리포트", "메모 있음"];
  const filters = [() => true, (x) => x.kind === "news", (x) => x.kind === "release", (x) => !!x.note];
  const count = (f) => items.filter(f).length;

  const input = h("input", { type: "search", placeholder: "보관한 글·메모 검색 (초성 가능)", value: query, "aria-label": "보관함 검색" });
  const list = h("div", { class: "card list" });
  const draw = () => {
    const shown = items.filter((x) => filters[tab](x) && matchText(`${x.title} ${x.summary} ${x.note} ${x.source}`, query));
    if (!shown.length) {
      list.replaceChildren(message(items.length ? "조건에 맞는 항목이 없습니다." : "보관함이 비어 있습니다.\n기사나 보도자료의 북마크 버튼으로 담고, 연필 버튼으로 메모를 남겨 보세요."));
      return;
    }
    list.replaceChildren(...shown.map((it) => row(it, redraw)));
  };
  input.addEventListener("input", () => ((query = input.value), draw()));
  root.append(
    tabs(labels.map((l, i) => `${l} ${count(filters[i])}`), tab, (i) => ((tab = i), redraw())),
    h("form", { class: "search", onsubmit: (e) => e.preventDefault() }, icon("search"), input),
    list,
    h("p", { class: "note", style: { margin: "12px 2px" } }, "브라우저 데이터를 지우면 보관함도 사라집니다. 중요한 내용은 ‘내보내기’로 파일에 백업해 두세요.")
  );
  draw();
}

function row(it, redraw) {
  const open = () => { markRead(it.link); body.closest(".item")?.classList.add("read"); openUrl(it.link); };
  const meta = [it.kind === "news" ? "기사" : "보도자료·리포트", it.source, it.kind === "news" ? (it.at ? dotDate(new Date(it.at + 9 * 3600e3).toISOString()) : "") : dotDate(it.date)].filter(Boolean).join(" · ");
  const body = h("div", { class: "body", onclick: open, role: "link", tabindex: 0, onkeydown: (e) => e.key === "Enter" && open() },
    h("div", { class: "t" }, it.title), h("div", { class: "m" }, meta),
    it.summary ? h("div", { class: "sum" }, it.summary) : null,
    it.note ? h("div", { class: "memo" }, icon("pencil"), h("span", null, it.note)) : null);
  return h("div", { class: "item vault-item" + (isRead(it.link) ? " read" : "") }, body,
    h("div", { class: "acts" },
      iconButton("pencil", it.note ? "메모 고치기" : "메모 쓰기", async () => (await editNote(it.link, it.title)) && redraw(), it.note ? "on" : ""),
      iconButton("share-2", "제목과 링크 공유", () => share(it.title, it.link)),
      iconButton("trash-2", "보관함에서 빼기", async () => {
        if (it.note && !(await dialog({ title: "보관함에서 뺄까요?", text: "작성한 메모도 함께 지워집니다.", ok: "빼기", danger: true }))) return;
        removeItem(it);
        toast("보관함에서 뺐습니다.");
        redraw();
      })));
}

function pickFile(done) {
  const f = h("input", { type: "file", accept: "application/json,.json" });
  f.addEventListener("change", async () => {
    const file = f.files?.[0];
    if (!file) return;
    try {
      const n = importAll(await file.text());
      toast(`${n}건을 합쳤습니다.`);
      done();
    } catch (e) {
      toast(e?.message?.includes("JSON") ? "읽을 수 없는 파일입니다." : e.message || "가져오지 못했습니다.");
    }
  });
  f.click();
}
