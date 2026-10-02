import Form from "next/form";
import { Search } from "lucide-react";

/** GET search form that keeps selected filters as hidden fields. Works without JS. */
export function SearchBox({
  action,
  defaultValue,
  placeholder,
  hidden = {},
}: {
  action: string;
  defaultValue?: string;
  placeholder: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <Form action={action} role="search" className="relative w-full">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-faint" aria-hidden />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="search"
        autoComplete="off"
        className="h-12 w-full rounded-full border border-line-strong bg-white pr-4 pl-11 text-[16px] text-ink shadow-soft transition placeholder:text-faint focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
      />
    </Form>
  );
}
