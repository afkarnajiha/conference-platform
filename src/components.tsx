import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { ArrowDownUp, Search, X, Inbox, LoaderCircle } from "lucide-react";
import type { Row } from "./domain";
export function Empty({
  title = "لا توجد بيانات بعد",
  text = "ستظهر السجلات هنا عند إضافتها.",
  children,
}: {
  title?: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={34} />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" />
      <p>جارٍ تحميل البيانات…</p>
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow || "الأفكار الناجحة التجارية"}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className={
        "badge " +
        (children === "تمت الزيارة" || children === "نشط" ? "filled" : "")
      }
    >
      {children}
    </span>
  );
}
export function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b aria-label="مطلوب"> *</b>}
      </span>
      {children}
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const items = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]",
              ) || [],
            );
            const first = items[0],
              last = items[items.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="section-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="إغلاق">
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Submit({
  busy,
  children = "حفظ التغييرات",
}: {
  busy: boolean;
  children?: ReactNode;
}) {
  return (
    <button className="button primary" type="submit" disabled={busy}>
      {busy && <LoaderCircle className="spin" size={18} />}
      {busy ? "جارٍ الحفظ…" : children}
    </button>
  );
}
export function Form({
  onSave,
  children,
  className = "",
}: {
  onSave: () => Promise<unknown>;
  children: (busy: boolean) => ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSave();
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={className}
      onSubmit={submit}
      onInvalidCapture={(e) => {
        const input = e.target as HTMLInputElement;
        input.setCustomValidity(
          input.validity.valueMissing
            ? "يرجى تعبئة هذا الحقل."
            : input.validity.typeMismatch
              ? "أدخل قيمة صحيحة لهذا الحقل."
              : input.validity.tooShort
                ? `أدخل ${input.minLength} أحرف على الأقل.`
                : "تحقق من القيمة ونطاق التاريخ المطلوب.",
        );
      }}
      onInputCapture={(e) => {
        const input = e.target as HTMLInputElement;
        input.setCustomValidity?.("");
      }}
    >
      {children(busy)}
    </form>
  );
}
export type Column = {
  key: string;
  label: string;
  render?: (r: Row) => ReactNode;
  sort?: (r: Row) => string | number;
};
export function DataTable({
  rows,
  columns,
  searchKeys,
  filters,
  emptyText = "لا توجد سجلات تطابق البحث أو التصفية.",
}: {
  rows: Row[];
  columns: Column[];
  searchKeys: string[];
  filters?: ReactNode;
  emptyText?: string;
}) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState({ key: "", direction: 1 }),
    [page, setPage] = useState(0);
  const col = columns.find((c) => c.key === sort.key);
  const filtered = rows
    .filter((r) =>
      searchKeys.some((k) =>
        String(r[k] ?? "")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    )
    .sort((a, b) => {
      if (!sort.key) return 0;
      const av = col?.sort ? col.sort(a) : a[sort.key],
        bv = col?.sort ? col.sort(b) : b[sort.key];
      return (
        (typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""), "ar")) *
        sort.direction
      );
    });
  const maxPage = Math.max(0, Math.ceil(filtered.length / 12) - 1),
    current = Math.min(page, maxPage);
  return (
    <section className="panel table-panel">
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            placeholder="ابحث في السجلات…"
            aria-label="البحث"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        {filters}
        <span className="muted">
          {filtered.length.toLocaleString("ar-SA")} سجل
        </span>
      </div>
      {!filtered.length ? (
        <Empty title="لا توجد نتائج" text={emptyText} />
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>
                      <button
                        className="sort"
                        onClick={() =>
                          setSort({
                            key: c.key,
                            direction: sort.key === c.key ? -sort.direction : 1,
                          })
                        }
                      >
                        {c.label}
                        <ArrowDownUp size={13} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(current * 12, current * 12 + 12).map((r) => (
                  <tr key={r.id}>
                    {columns.map((c) => (
                      <td key={c.key}>
                        {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              className="button ghost"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              السابق
            </button>
            <span>
              صفحة {current + 1} من {maxPage + 1}
            </span>
            <button
              className="button ghost"
              disabled={current === maxPage}
              onClick={() => setPage(current + 1)}
            >
              التالي
            </button>
          </div>
        </>
      )}
    </section>
  );
}
