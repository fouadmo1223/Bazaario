"use client";

/** Browser print, not a generated PDF — "Save as PDF" in the print dialog covers that. */
export function InvoicePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hover"
    >
      Print / Save as PDF
    </button>
  );
}
