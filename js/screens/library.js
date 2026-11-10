// 참고 자료실: 서버(/library)가 중계하는 구글 드라이브 공유 폴더(읽기 전용). 폴더 이동, 제목·설명·본문·#태그 검색, 열기·저장.
// 주소: ?f=폴더ID · ?q=검색어
import { setHeader } from "../app.js";
import { api, apiBlob, download, errorText, h, icon, iconButton, loading, message, searchBox, toast } from "../core.js";

const folders = new Map(); // 폴더ID → { name, parent } (경로 표시용)
let rootId = null;

export async function render(root, params, ctx) {
  setHeader("기타 참고자료", "법령·감독 자료 모음", [iconButton("refresh-cw", "새로고침", () => ctx.go(params, { replace: true }))]);
  const q = (params.q || "").trim();
  const box = searchBox({ placeholder: "제목·설명·본문·#태그 검색", value: q, onSearch: (v) => ctx.go(v ? { q: v } : {}) });
  box.input.addEventListener("input", () => !box.input.value && q && ctx.go({}, { replace: true }));
  const contact = h("a", { class: "note lib-contact", href: "mailto:hdlee73@gmail.com" }, "자료 게시 문의 : hdlee73@gmail.com");
  const crumbs = h("div", { class: "lib-crumbs" });
  const tagRow = h("div", { class: "lw-chips lib-tags" });
  const list = h("div", { class: "card list" }, loading());
  root.append(box, contact, crumbs, tagRow, list);

  let data;
  try {
    data = q ? await api("/library/search", { q }) : await api("/library/list", params.f ? { folder: params.f } : null);
  } catch (e) {
    if (!ctx.alive()) return;
    const text = e.status === 501 ? "자료실 서버가 아직 연결되지 않았습니다.\n구글 드라이브 연결 설정 후 사용할 수 있습니다." : errorText(e);
    list.replaceChildren(message(text, { error: e.status !== 501, action: "새로고침", onAction: () => ctx.go(params, { replace: true }) }));
    return;
  }
  if (!ctx.alive()) return;
  if (data.root) rootId = data.folder;
  for (const it of data.items || []) if (it.folder) folders.set(it.id, { name: it.name, parent: data.folder });

  // 위치: 전체 › 폴더 › 하위 폴더 (검색이면 결과 수)
  if (q) crumbs.append(h("b", { class: "on" }, `검색 결과 ${data.items.length}건 · ‘${q}’`));
  else {
    const trail = [];
    for (let id = params.f; id && id !== rootId && folders.has(id) && trail.length < 12; id = folders.get(id).parent) trail.unshift([id, folders.get(id).name]);
    const inner = params.f && !data.root;
    crumbs.append(h("a", { href: "#/library", class: trail.length || inner ? "" : "on" }, "전체"));
    if (inner && !trail.length) crumbs.append(h("span", null, "›"), h("b", { class: "on" }, "하위 폴더"));
    trail.forEach(([id, name], i) => crumbs.append(h("span", null, "›"), h("a", { href: "#/library?f=" + encodeURIComponent(id), class: i === trail.length - 1 ? "on" : "" }, name)));
  }
  const tags = data.tags || [];
  tagRow.hidden = !tags.length;
  tagRow.append(...tags.slice(0, 30).map((t) => h("a", { class: "pill sm" + (q.toLowerCase() === "#" + t.toLowerCase() ? " on" : ""), href: "#/library?q=" + encodeURIComponent("#" + t) }, "#" + t)));

  const items = data.items || [];
  if (!items.length) return list.replaceChildren(message(q ? "검색 결과가 없습니다." : "이 폴더에는 자료가 없습니다."));
  list.replaceChildren(...items.map((it) => row(it, ctx)));
}

function row(it, ctx) {
  const meta = it.folder ? null : [it.bodyMatch ? "본문 일치" : "", it.location, sizeText(it.size), (it.modified || "").slice(0, 10)].filter(Boolean).join(" · ");
  const open = () => (it.folder ? ctx.go({ f: it.id }) : openFile(it, false));
  return h("div", { class: "item lib-item" },
    h("span", { class: "lib-ic" + (it.folder ? " folder" : "") }, icon(it.folder ? "folder-open" : "file-text")),
    h("div", { class: "body", role: "link", tabindex: 0, onclick: open, onkeydown: (e) => e.key === "Enter" && open() },
      h("div", { class: "t" }, it.name),
      it.description ? h("div", { class: "note lib-desc" }, it.description) : null,
      it.tags?.length ? h("div", { class: "lw-chips" }, it.tags.map((t) => h("span", { class: "tag" }, "#" + t))) : null,
      meta ? h("div", { class: "m" }, meta) : null),
    it.folder ? h("div", { class: "acts" }, icon("chevron-right")) : h("div", { class: "acts" }, iconButton("download", "내 기기에 저장", () => openFile(it, true))));
}

const OPENABLE = /^(application\/pdf|image\/|text\/plain)/;
async function openFile(it, save) {
  // 미리 창을 열어 두어야 팝업 차단에 걸리지 않는다(PDF·이미지는 브라우저에서 바로 연다).
  const viewer = !save && OPENABLE.test(it.type || "") ? window.open("", "_blank") : null;
  toast("내려받는 중…");
  try {
    const { blob } = await apiBlob(`/library/file/${encodeURIComponent(it.id)}?folder=${encodeURIComponent(it.parent || "")}`);
    if (viewer) {
      const url = URL.createObjectURL(new Blob([blob], { type: it.type }));
      viewer.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } else download(blob, it.downloadName || it.name);
  } catch (e) {
    viewer?.close();
    toast(errorText(e));
  }
}

function sizeText(b) {
  if (!b || b <= 0) return "";
  return b < 1048576 ? `${Math.floor(b / 1024) + 1}KB` : `${(b / 1048576).toFixed(1)}MB`;
}
