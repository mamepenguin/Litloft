"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/Button";
import { useToast } from "@/components/ToastProvider";
import { FileNavControls } from "@/components/FileDetail/FileNavControls";
import { useFileNavState } from "@/lib/fileNavContext";
import { markInboxDone, undoInboxDone } from "@/lib/api";
import { useInboxDetailHost } from "./inboxDetailHost";

/**
 * The detail's half of the inbox: the same 済み the row carries, beside the
 * arrows that walk the arrivals, rendered in whichever host opened the file.
 */
export function InboxDetailActions({
  fileId,
  drive,
}: {
  fileId: string;
  drive: string;
}) {
  const searchParams = useSearchParams();
  const host = useInboxDetailHost();
  const nav = useFileNavState();
  const tInbox = useTranslations("inbox");
  const tErrors = useTranslations("errors");
  const toast = useToast();

  if (searchParams.get("nav") !== "inbox" || !host || !nav) return null;

  const nextId = nav.nextId;
  const { onNext, onClose } = host;

  async function handleDone() {
    let doneAt: string | null = null;
    try {
      const answer = await markInboxDone(drive, { file_ids: [fileId] });
      doneAt = answer.done_at;
      if (answer.done > 0) {
        toast.success(tInbox("markedDone", { count: answer.done }), {
          action: {
            label: tInbox("undo"),
            onClick: () => {
              void undoInboxDone(drive, doneAt!);
            },
          },
        });
      }
    } catch {
      toast.error(tErrors("pageError"));
      return;
    }
    if (nextId) onNext(nextId);
    else onClose();
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-2">
      <FileNavControls />
      <Button variant="secondary" onClick={() => void handleDone()}>
        {tInbox("done")}
      </Button>
    </div>
  );
}
