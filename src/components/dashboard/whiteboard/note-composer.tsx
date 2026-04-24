"use client";

import { Loading03Icon, PinIcon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { VendorSlug } from "@/lib/shipments/vendor-colors";
import { cn } from "@/lib/utils";
import { createNote } from "@/lib/whiteboard/actions";

import { type LinkedShipment, ShipmentPicker } from "./shipment-picker";
import { VendorToggleGroup } from "./vendor-toggle-group";

const MAX_BODY_LENGTH = 4000;

type NoteComposerProps = {
  onNoteCreated?: () => void;
};

export const NoteComposer = ({ onNoteCreated }: NoteComposerProps) => {
  const [body, setBody] = useState("");
  const [vendors, setVendors] = useState<VendorSlug[]>([]);
  const [shipments, setShipments] = useState<LinkedShipment[]>([]);
  const [pinned, setPinned] = useState(false);
  const [isPending, startTransition] = useTransition();

  const bodyTrimmed = body.trim();
  const canSubmit = bodyTrimmed.length > 0 && !isPending;
  const remaining = MAX_BODY_LENGTH - body.length;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    startTransition(async () => {
      const result = await createNote({
        body: bodyTrimmed,
        vendorSlugs: vendors,
        shipmentIds: shipments.map((s) => s.id),
        pinned,
      }).catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Failed to create note";
        toast.error(message);
        return null;
      });

      if (!result?.ok) return;

      setBody("");
      setVendors([]);
      setShipments([]);
      setPinned(false);
      toast.success("Note posted");
      onNoteCreated?.();
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3"
    >
      <label htmlFor="whiteboard-note-body" className="sr-only">
        Write a note
      </label>
      <Textarea
        id="whiteboard-note-body"
        value={body}
        onChange={(event) =>
          setBody(event.target.value.slice(0, MAX_BODY_LENGTH))
        }
        placeholder={
          "Leave a note for the team\u2026 Tag vendors, link shipments, or pin for urgency."
        }
        className="min-h-20"
        disabled={isPending}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VendorToggleGroup
          value={vendors}
          onChange={(next) => setVendors(next as VendorSlug[])}
          disabled={isPending}
        />
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={pinned ? "default" : "ghost"}
            size="sm"
            aria-pressed={pinned}
            onClick={() => setPinned((value) => !value)}
            disabled={isPending}
          >
            <HugeiconsIcon
              icon={PinIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {pinned ? "Pinned" : "Pin"}
          </Button>
        </div>
      </div>
      <ShipmentPicker value={shipments} onChange={setShipments} max={5} />
      <div className="flex items-center justify-between gap-2 pt-1">
        <span
          className={cn(
            "text-[0.65rem] text-muted-foreground",
            remaining <= 100 && "text-amber-600 dark:text-amber-400",
            remaining <= 0 && "text-destructive",
          )}
        >
          {remaining} characters left
        </span>
        <Button
          type="submit"
          size="sm"
          disabled={!canSubmit}
          aria-label="Post whiteboard note"
        >
          {isPending ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="animate-spin"
              data-icon="inline-start"
            />
          ) : (
            <HugeiconsIcon
              icon={SentIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
          )}
          Post
        </Button>
      </div>
    </form>
  );
};
