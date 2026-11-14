// 회사 정보 같은 화면 내용을 PDF(인쇄 창) 또는 한글(HWPX)로 저장한다.
// doc 모양은 hwpx.js의 hwpxReport 설명을 따른다. 저장 범위는 sections의 id로 고른다.
import { APP_NAME, APP_VERSION, dialog, download, errorText, h, toast } from "../core.js";

export const footerLine = () => `${APP_NAME} v${APP_VERSION} · 만든이: 이현덕 with Claude (hdlee73@gmail.com)`;
const safeName = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, "_");

/**
 * 저장 창을 띄우고 고른 형식·범위로 저장한다.
 * parts: [{ id, label, checked }] · build(ids:Set) → Promise<doc>
 */
export async function saveReport({ title, parts, build }) {
  const radio = (value, label, checked) => h("label", { class: "lw-opt" }, h("input", { type: "radio", name: "_fmt", value, checked }), label);
  const body = h("div", { class: "lw-save" },
    h("div", { class: "section-label" }, "저장 형식"),
    radio("pdf", "PDF (인쇄 창에서 ‘PDF로 저장’)", true), radio("hwpx", "한글(HWPX)", false),
    h("div", { class: "section-label" }, "포함할 내용"),
    parts.map((p) => h("label", { class: "lw-opt" }, h("input", { type: "checkbox", "data-k": p.id, checked: p.checked !== false }), p.label)));
  const ok = await dialog({ title: title || "저장할 범위", body, ok: "저장", cancel: "취소" });
  if (!ok) return;
  const fmt = body.querySelector('input[name="_fmt"]:checked').value;
  const ids = new Set(parts.filter((p) => body.querySelector(`input[data-k="${p.id}"]`).checked).map((p) => p.id));
  if (!ids.size) return toast("저장할 내용을 하나 이상 골라 주세요.");
  toast("자료를 모으는 중…");
  let doc;
  try {
    doc = await build(ids);
  } catch (e) {
    return toast("자료를 불러오지 못했어요: " + errorText(e));
  }
  doc.footer = [...(doc.footer || []), footerLine()];
  const base = safeName(doc.fileName || [doc.subtitle, doc.title].filter(Boolean).join("_"));
  if (fmt === "hwpx") {
    try {
      const { hwpxReport } = await import("./hwpx.js");
      download(await hwpxReport(doc), base + ".hwpx");
      toast("한글(HWPX) 문서를 저장했어요");
    } catch (e) {
      toast("한글 문서를 만들지 못했어요: " + errorText(e));
    }
  } else printReport(doc, base);
}

/** 인쇄 창(→ PDF로 저장) */
export function printReport(doc, base) {
  const el = h("div", { class: "print-doc" });
  el.append(h("h1", null, doc.title));
  if (doc.subtitle) el.append(h("h2", null, doc.subtitle));
  (doc.meta || []).forEach((m) => el.append(h("p", { class: "meta" }, m)));
  for (const s of doc.sections) {
    el.append(h("h3", null, s.title));
    if (s.note) el.append(h("p", { class: "meta" }, s.note));
    for (const b of s.blocks) {
      if (b.kv) el.append(h("table", { class: "rp-kv" }, h("tbody", null, b.kv.filter(([, v]) => v).map(([k, v]) => h("tr", null, h("th", null, k), h("td", null, v))))));
      else if (b.table) {
        const t = b.table;
        const num = (c) => (t.num ? t.num(c) : c > 0);
        el.append(h("table", { class: "rp-tbl" },
          h("thead", null, h("tr", null, t.head.map((x, c) => h("th", { class: num(c) ? "num" : "" }, x)))),
          h("tbody", null, t.rows.map((r, i) => h("tr", { class: t.bold?.(i) ? "b" : "" }, r.map((x, c) => h("td", { class: num(c) ? "num" : "" }, x ?? "")))))));
      } else if (b.heading) el.append(h("div", { class: "ph" }, b.heading));
      else if (b.text != null) el.append(h("div", { class: "pb" + (b.gray ? " gray" : ""), style: b.indent ? { marginLeft: b.indent * 14 + "pt" } : null }, b.text));
    }
  }
  (doc.footer || []).filter(Boolean).forEach((l) => el.append(h("p", { class: "foot" }, l)));

  document.querySelectorAll(".print-doc").forEach((e) => e.remove()); // 앞서 남은 인쇄용 문서
  const style = h("style", null, "@page { size: 210mm 297mm; margin: 17mm; }");
  document.head.append(style);
  document.body.append(el);
  document.body.classList.add("printing");
  const prevTitle = document.title;
  const done = () => (el.remove(), style.remove(), document.body.classList.remove("printing"), (document.title = prevTitle));
  addEventListener("afterprint", done, { once: true });
  document.title = base;
  setTimeout(() => {
    window.print();
    // 휴대폰 브라우저는 print()가 바로 돌아오고 미리보기를 나중에 만든다. 그때 인쇄용 문서가 없으면 화면의 현재 탭이 인쇄되므로
    // 시간으로 치우지 않고 afterprint(인쇄 창을 닫을 때)에만 치운다. 화면에서는 .print-doc가 숨겨져 있어 남아도 보이지 않는다.
  }, 50);
}
