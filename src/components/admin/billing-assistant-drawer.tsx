"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type {
  BillingAccountSlug,
  BillingReportStatus,
} from "@/lib/billing/types";

type BillingAssistantDrawerProps = {
  reportId: string;
  accountSlug: BillingAccountSlug;
  reportStatus: BillingReportStatus | null;
  periodLabel: string;
  zohoInvoiceId: string | null;
};

const isToolPart = (part: UIMessage["parts"][number]): part is ToolPart =>
  part.type === "dynamic-tool" || part.type.startsWith("tool-");

const hasCreatedInvoice = (messages: UIMessage[]): string | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") {
      continue;
    }

    for (const part of message.parts) {
      if (
        part.type === "tool-createDraftInvoice" &&
        part.state === "output-available" &&
        part.output &&
        typeof part.output === "object" &&
        "ok" in part.output &&
        (part.output as { ok: unknown }).ok === true &&
        "invoiceId" in part.output
      ) {
        return String((part.output as { invoiceId: unknown }).invoiceId);
      }
    }
  }

  return null;
};

const renderPart = (part: UIMessage["parts"][number], key: string) => {
  if (part.type === "text") {
    return <MessageResponse key={key}>{part.text}</MessageResponse>;
  }

  if (isToolPart(part)) {
    return (
      <Tool key={key}>
        {part.type === "dynamic-tool" ? (
          <ToolHeader
            state={part.state}
            toolName={part.toolName}
            type={part.type}
          />
        ) : (
          <ToolHeader state={part.state} type={part.type} />
        )}
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput errorText={part.errorText} output={part.output} />
        </ToolContent>
      </Tool>
    );
  }

  return null;
};

export const BillingAssistantDrawer = ({
  reportId,
  accountSlug,
  reportStatus,
  periodLabel,
  zohoInvoiceId,
}: BillingAssistantDrawerProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const seenInvoiceRef = useRef<string | null>(zohoInvoiceId);

  useEffect(() => {
    seenInvoiceRef.current = zohoInvoiceId;
  }, [zohoInvoiceId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/admin/billing/agent",
        body: { reportId },
      }),
    [reportId],
  );

  const { messages, sendMessage, status, error, stop } = useChat({ transport });

  useEffect(() => {
    const invoiceId = hasCreatedInvoice(messages);
    if (invoiceId && invoiceId !== seenInvoiceRef.current) {
      seenInvoiceRef.current = invoiceId;
      router.refresh();
    }
  }, [messages, router]);

  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text.trim()) {
      return;
    }

    setInput("");
    await sendMessage({ text: message.text });
  };

  const greeting = `Ask about ${accountSlug.toUpperCase()} for ${periodLabel}. Status: ${reportStatus ?? "no report"}.`;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          Assistant
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Billing Assistant</SheetTitle>
          <SheetDescription>{greeting}</SheetDescription>
        </SheetHeader>

        <Conversation className="min-h-0 flex-1 px-6 pb-2">
          <ConversationContent className="pt-4">
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="Start a billing conversation"
                description='Try "create the draft invoice", "what is the packaging total?", or "list recent invoices for this client".'
              />
            ) : (
              messages.map((message) => (
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.parts.map((part, index) =>
                      renderPart(part, `${message.id}-${index}`),
                    )}
                  </MessageContent>
                </Message>
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {error ? (
          <p className="px-6 pb-2 text-destructive text-xs">{error.message}</p>
        ) : null}

        <PromptInput className="border-t px-6 py-4" onSubmit={handleSubmit}>
          <PromptInputTextarea
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="Ask about this month's billing…"
            value={input}
          />
          <PromptInputSubmit onStop={stop} status={status} />
        </PromptInput>
      </SheetContent>
    </Sheet>
  );
};
