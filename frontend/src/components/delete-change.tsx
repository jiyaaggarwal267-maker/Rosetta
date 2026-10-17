"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

/**
 * Delete one of your changes, after a confirm. It goes from everyone's feed
 * with its comments; pasting the commit link again brings it back.
 */
export function DeleteChange({
  id,
  title,
  onDeleted,
  trigger,
  triggerClassName,
}: {
  id: string;
  title: string;
  onDeleted: () => void;
  trigger: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteCard(id);
      setOpen(false);
      toast("Change deleted. Paste the commit link again to bring it back.");
      onDeleted();
    } catch (e) {
      toast(e instanceof api.ApiError && e.detail ? e.detail : "That didn't delete. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={cn("press", triggerClassName)} aria-label={`Delete “${title}”`}>
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-50 bg-abyss/50" />
        <Dialog.Popup className="dialog-popup fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface-1 p-6 shadow-elev-3 outline-none sm:p-8">
          <Dialog.Title className="t-heading text-fg-1">Delete this change?</Dialog.Title>
          <Dialog.Description className="mt-2 t-small text-fg-2">
            &ldquo;{title}&rdquo; and its comments disappear from your feed and your manager&rsquo;s. Questions about it stay. To bring it back, paste the
            commit link again.
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="press h-10 rounded-sm px-4 t-small font-medium text-fg-2 hover:bg-surface-2 hover:text-fg-1">Cancel</Dialog.Close>
            <Button variant="primary" loading={busy} onClick={remove} className="bg-(--risk-high)! text-canvas!">
              Delete this change
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
