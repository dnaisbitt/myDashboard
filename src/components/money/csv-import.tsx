"use client";

import { Upload } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { importTransactions } from "@/app/actions/money";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { decodeCsvBytes, DELIMITER_NAME, detectDelimiter, formatGBP, guessMapping, mapRows, parseCsv, type CsvMapping } from "@/lib/money";
import { keyLabel } from "@/lib/time";

/** Bank CSV import: parsed in the browser, previewed, then saved. Duplicates are skipped. */
export function CsvImport() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; rows: string[][]; delimiter: string; encoding: string } | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { notify } = useToast();

  const header = file?.rows[0] ?? [];
  const mapped = useMemo(() => (file && mapping ? mapRows(file.rows.slice(1), mapping) : null), [file, mapping]);
  const out = mapped?.rows.filter((r) => r.amountPence > 0).reduce((s, r) => s + r.amountPence, 0) ?? 0;
  const inn = mapped?.rows.filter((r) => r.amountPence < 0).reduce((s, r) => s - r.amountPence, 0) ?? 0;

  const col = (label: string, value: number | undefined, set: (v: number | undefined) => void, optional = false) => (
    <label className="flex flex-col gap-1 text-small">
      <span className="font-medium">{label}</span>
      <Select value={value ?? ""} onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))} className="h-9 text-small">
        {optional ? <option value="">Not in this file</option> : null}
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </Select>
    </label>
  );

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-[62ch] text-body text-ink-2">
        Download a CSV statement from your banking app or website and choose it here. Nothing leaves your browser until you press Import, and
        rows you&apos;ve imported before are skipped.
      </p>
      <div>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          id="csv-file"
          onChange={async (e) => {
            setError(null);
            setResult(null);
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 3_000_000) return setError("That file is over 3 MB. Export a shorter date range.");
            const { text, encoding } = decodeCsvBytes(await f.arrayBuffer());
            const delimiter = detectDelimiter(text);
            const rows = parseCsv(text, delimiter);
            if (rows.length < 2) return setError("That file has no rows.");
            const guess = guessMapping(rows[0], rows.slice(1, 61));
            setFile({ name: f.name, rows, delimiter, encoding });
            setMapping(guess ?? { date: 0, description: 1, amount: 2, outIsNegative: true });
            if (!guess) setError("Couldn't tell which columns are which. Pick them below.");
          }}
        />
        <Button onClick={() => input.current?.click()}>
          <Upload size={15} aria-hidden />
          Choose CSV file
        </Button>
      </div>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      {result ? <p className="text-small font-medium">{result}</p> : null}

      {file && mapping ? (
        <section className="flex flex-col gap-5">
          <SectionHeader title={file.name} count={`${file.rows.length - 1} rows · ${DELIMITER_NAME[file.delimiter] ?? "comma"}-separated · ${file.encoding}`} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {col("Date", mapping.date, (v) => setMapping({ ...mapping, date: v ?? 0 }))}
            {col("Description", mapping.description, (v) => setMapping({ ...mapping, description: v ?? 0 }))}
            {col("Amount", mapping.amount, (v) => setMapping({ ...mapping, amount: v, ...(v !== undefined ? { moneyOut: undefined, moneyIn: undefined } : {}) }), true)}
            {mapping.amount === undefined ? (
              <>
                {col("Money out", mapping.moneyOut, (v) => setMapping({ ...mapping, moneyOut: v }), true)}
                {col("Money in", mapping.moneyIn, (v) => setMapping({ ...mapping, moneyIn: v }), true)}
              </>
            ) : (
              <>
              <label className="flex flex-col gap-1 text-small">
                <span className="font-medium">Spending shows as</span>
                <Select
                  value={mapping.outIsNegative ? "neg" : "pos"}
                  onChange={(e) => setMapping({ ...mapping, outIsNegative: e.target.value === "neg" })}
                  className="h-9 text-small"
                >
                  <option value="neg">Negative (−12.40)</option>
                  <option value="pos">Positive (12.40)</option>
                </Select>
              </label>
              {col("Type (for unsigned amounts)", mapping.type, (v) => setMapping({ ...mapping, type: v }), true)}
              </>
            )}
          </div>
          {mapped ? (
            <>
              <p className="text-body">
                <span className="font-medium">{mapped.rows.length} transactions</span>: {formatGBP(out)} out, {formatGBP(inn)} in
                {mapped.skipped ? <span className="text-ink-2"> · {mapped.skipped} rows couldn&apos;t be read and will be skipped</span> : null}
              </p>
              {mapped.reasons.length ? (
                <ul className="-mt-2 list-disc pl-5 text-small text-ink-2">
                  {mapped.reasons.map((r) => (
                    <li key={r.line}>
                      Line {r.line}: {r.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="overflow-x-auto rounded-md border border-rule">
                <table className="w-full text-small">
                  <thead className="bg-surface text-left text-ink-2">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapped.rows.slice(0, 10).map((r) => (
                      <tr key={r.importKey} className="border-t border-rule">
                        <td className="px-3 py-1.5 whitespace-nowrap">{keyLabel(r.occurredOn)}</td>
                        <td className="max-w-64 truncate px-3 py-1.5">{r.description}</td>
                        <td className="px-3 py-1.5 text-ink-2">{r.category}</td>
                        <td className="px-3 py-1.5 text-right">
                          {r.amountPence < 0 ? "+" : "−"}
                          {formatGBP(Math.abs(r.amountPence))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-small text-ink-2">Categories are guessed from the description. You can change any of them afterwards.</p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setFile(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  pending={pending}
                  disabled={!mapped.rows.length}
                  onClick={() =>
                    start(async () => {
                      const r = await importTransactions(
                        mapped.rows.map((x) => ({ occurredOn: x.occurredOn, description: x.description, amountPence: x.amountPence, category: x.category, importKey: x.importKey })),
                      );
                      if (!r.ok) return setError(r.error);
                      const msg = `Imported ${r.data!.added}${r.data!.duplicates ? `, skipped ${r.data!.duplicates} already imported` : ""}.`;
                      setResult(msg);
                      notify(msg);
                      setFile(null);
                    })
                  }
                >
                  Import {mapped.rows.length}
                </Button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
