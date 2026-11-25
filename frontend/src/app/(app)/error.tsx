"use client";
import { AlertTriangle } from "lucide-react";
import { Button, Card } from "@/components/ui";

export default function SectionError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-300"><AlertTriangle className="h-7 w-7" /></div>
      <h2 className="mt-4 text-xl font-bold text-white">This section failed to load</h2>
      <p className="mt-2 text-sm text-slate-400">The rest of the app still works. Try again, or use the menu to go elsewhere.</p>
      <Button className="mt-5" onClick={reset}>Try again</Button>
    </Card>
  );
}
