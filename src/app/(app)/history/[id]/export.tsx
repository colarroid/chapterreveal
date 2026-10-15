"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui";

export function ExportButton({
  filename,
  segments,
  verses,
}: {
  filename: string;
  segments: { at: string; text: string }[];
  verses: { at: string; label: string }[];
}) {
  function download() {
    const text = [
      "VERSES SHOWN",
      ...verses.map((v) => `${v.at}  ${v.label}`),
      "",
      "TRANSCRIPT",
      ...segments.map((s) => `[${s.at}] ${s.text}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Button variant="secondary" onClick={download}>
      <Download size={16} /> Export
    </Button>
  );
}
