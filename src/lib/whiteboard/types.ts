import { z } from "zod";

import { VENDOR_SLUGS } from "@/lib/shipments/vendor-colors";

export const noteInputSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  shipmentIds: z
    .array(z.string().uuid())
    .max(10)
    .default([])
    .transform((ids) => Array.from(new Set(ids))),
  vendorSlugs: z
    .array(z.enum(VENDOR_SLUGS as [string, ...string[]]))
    .max(3)
    .default([])
    .transform((slugs) => Array.from(new Set(slugs))),
  pinned: z.boolean().default(false),
});

export type NoteInput = z.infer<typeof noteInputSchema>;

export type NoteVendorRef = {
  slug: string;
  displayName: string;
};

export type NoteShipmentRef = {
  id: string;
  externalId: string;
  status: string;
  recipientName: string | null;
  recipientCity: string | null;
  account: {
    id: string;
    slug: string;
    displayName: string;
  };
};

export type NoteAuthor = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type NoteDto = {
  id: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  author: NoteAuthor;
  vendors: NoteVendorRef[];
  shipments: NoteShipmentRef[];
};

export type WhiteboardPollResponse = {
  notes: NoteDto[];
  unreadCount: number;
  serverTime: string;
};
