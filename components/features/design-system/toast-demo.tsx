"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => toast.success("Booking confirmed for Tue, 11:30")}>
        Success toast
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.error("This slot was just taken", { description: "Please pick another time." })
        }
      >
        Error toast
      </Button>
      <Button variant="outline" onClick={() => toast("Reminder set for 24 hours before")}>
        Info toast
      </Button>
    </div>
  );
}
