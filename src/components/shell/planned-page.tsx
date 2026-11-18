import { Planned } from "@/components/ui/misc";
import { PageFrame, PageHeader } from "./page-header";

/** A section that is designed but not built yet. States that plainly, with what's coming. */
export function PlannedPage({
  title,
  phase,
  lede,
  coming,
  limits,
}: {
  title: string;
  phase: string;
  lede: string;
  coming: string[];
  limits?: string[];
}) {
  return (
    <PageFrame>
      <PageHeader title={title} lede={lede} action={<Planned phase={phase} />} />
      <section className="border-t border-rule pt-6">
        <h2 className="text-body font-semibold">What arrives in {phase}</h2>
        <ul className="mt-3 flex flex-col gap-2 text-body text-ink-2">
          {coming.map((c) => (
            <li key={c} className="flex gap-3">
              <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-ink-3" />
              {c}
            </li>
          ))}
        </ul>
      </section>
      {limits?.length ? (
        <section className="mt-10 border-t border-rule pt-6">
          <h2 className="text-body font-semibold">Honest limits</h2>
          <ul className="mt-3 flex flex-col gap-2 text-small text-ink-2">
            {limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </PageFrame>
  );
}
