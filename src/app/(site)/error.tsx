"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <h1 className="text-2xl font-extrabold">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-muted">Please check your internet connection and try again.</p>
      <Button onClick={reset} className="mt-6" size="lg">
        <RotateCw /> Try again
      </Button>
    </div>
  );
}
