import type { Metadata } from "next";
import { CsvImport } from "@/components/money/csv-import";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { MONEY_TABS } from "@/components/shell/section-tabs";
import { LinkTabs } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <PageFrame className="max-w-[1120px]">
      <PageHeader title="Money" />
      <LinkTabs items={MONEY_TABS} className="-mt-4 mb-8" />
      <CsvImport />
    </PageFrame>
  );
}
