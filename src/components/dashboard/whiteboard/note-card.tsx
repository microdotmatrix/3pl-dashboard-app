"use client";

import {
  Delete02Icon,
  MoreHorizontalIcon,
  PackageIcon,
  PinIcon,
  PinOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { formatDistanceToNowStrict } from "date-fns";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { deleteNote, togglePinNote } from "@/lib/whiteboard/actions";
import type { NoteDto } from "@/lib/whiteboard/types";

import { VendorPill } from "../shipments/vendor-pill";

type NoteCardProps = {
  note: NoteDto;
  currentUserId: string;
  isAdmin: boolean;
  onFocusShipment: (externalId: string) => void;
};

const initials = (name: string, email: string): string => {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export const NoteCard = ({
  note,
  currentUserId,
  isAdmin,
  onFocusShipment,
}: NoteCardProps) => {
  const [isPending, startTransition] = useTransition();

  const canModify = note.author.id === currentUserId || isAdmin;

  const handleTogglePin = () => {
    startTransition(async () => {
      const result = await togglePinNote(note.id, !note.pinned).catch(
        (error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Unable to update note";
          toast.error(message);
          return null;
        },
      );
      if (result?.ok) {
        toast.success(note.pinned ? "Note unpinned" : "Note pinned");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteNote(note.id).catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unable to delete note";
        toast.error(message);
        return null;
      });
      if (result?.ok) {
        toast.success("Note deleted");
      } else if (result && "reason" in result) {
        toast.error(
          result.reason === "forbidden"
            ? "You can only delete your own notes"
            : "Note already gone",
        );
      }
    });
  };

  const createdLabel = formatDistanceToNowStrict(new Date(note.createdAt), {
    addSuffix: true,
  });

  return (
    <article
      className={cn(
        "relative flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-3 text-xs",
        note.pinned && "border-primary/50 bg-primary/5",
        isPending && "opacity-70",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar size="sm">
            {note.author.image ? (
              <AvatarImage
                src={note.author.image}
                alt={note.author.name || note.author.email}
              />
            ) : null}
            <AvatarFallback>
              {initials(note.author.name, note.author.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col leading-tight">
            <span className="font-medium text-foreground">
              {note.author.name || note.author.email}
            </span>
            <time
              className="text-[0.65rem] text-muted-foreground"
              dateTime={note.createdAt}
            >
              {createdLabel}
            </time>
          </div>
          {note.pinned ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-primary">
              <HugeiconsIcon
                icon={PinIcon}
                strokeWidth={2}
                className="size-3"
              />
              Pinned
            </span>
          ) : null}
        </div>
        {canModify ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Note actions"
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleTogglePin}>
                <HugeiconsIcon
                  icon={note.pinned ? PinOffIcon : PinIcon}
                  strokeWidth={2}
                />
                {note.pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={(event) => event.preventDefault()}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    Delete note
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This cannot be undone. Linked shipments remain untouched.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDelete}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      <p className="whitespace-pre-wrap text-[0.8rem] leading-relaxed text-foreground">
        {note.body}
      </p>

      {note.vendors.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-1">
          {note.vendors.map((vendor) => (
            <li key={`${note.id}-vendor-${vendor.slug}`}>
              <VendorPill
                slug={vendor.slug}
                displayName={vendor.displayName}
                variant="soft"
              />
            </li>
          ))}
        </ul>
      ) : null}

      {note.shipments.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {note.shipments.map((shipment) => (
            <li key={`${note.id}-shipment-${shipment.id}`}>
              <button
                type="button"
                onClick={() => onFocusShipment(shipment.externalId)}
                className="group/shipment-ref flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-left text-[0.7rem] transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <HugeiconsIcon
                  icon={PackageIcon}
                  strokeWidth={2}
                  className="size-3.5 opacity-60 group-hover/shipment-ref:opacity-100"
                />
                <VendorPill
                  slug={shipment.account.slug}
                  displayName={shipment.account.displayName}
                  variant="soft"
                />
                <span className="font-mono text-foreground/90">
                  {shipment.externalId}
                </span>
                {shipment.recipientName ? (
                  <span className="truncate text-muted-foreground">
                    {shipment.recipientName}
                  </span>
                ) : null}
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.6rem] text-muted-foreground">
                  {shipment.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
};
