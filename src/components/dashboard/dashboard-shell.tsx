"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSwipe } from "@/hooks/use-swipe";
import { cn } from "@/lib/utils";

import { UnreadBadge } from "./whiteboard/unread-badge";

type DashboardShellProps = {
  shipments: React.ReactNode;
  whiteboard: React.ReactNode;
  initialUnreadCount: number;
};

type MobileTab = "shipments" | "whiteboard";

export const DashboardShell = ({
  shipments,
  whiteboard,
  initialUnreadCount,
}: DashboardShellProps) => {
  const [activeTab, setActiveTab] = useState<MobileTab>("shipments");

  const swipeHandlers = useSwipe<HTMLDivElement>({
    onSwipeLeft: () => setActiveTab("whiteboard"),
    onSwipeRight: () => setActiveTab("shipments"),
  });

  return (
    <div className="mx-auto flex w-full flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
      {/* Desktop / tablet split layout */}
      <div className="hidden min-h-0 flex-1 gap-4 lg:grid lg:grid-cols-[minmax(0,_2fr)_minmax(0,_1fr)]">
        <div id="shipments" className="min-h-0 overflow-hidden">
          {shipments}
        </div>
        <aside className="min-h-0 overflow-hidden">{whiteboard}</aside>
      </div>

      {/* Mobile stacked tabs */}
      <div className="flex flex-1 flex-col gap-3 lg:hidden" {...swipeHandlers}>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as MobileTab)}
          className="flex flex-1 flex-col"
        >
          <TabsList className="sticky top-0 z-10 w-full self-start">
            <TabsTrigger value="shipments" className="flex-1">
              Shipments
            </TabsTrigger>
            <TabsTrigger value="whiteboard" className="flex-1 gap-1.5">
              Whiteboard
              <UnreadBadge count={initialUnreadCount} />
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="shipments"
            id="shipments-mobile"
            className={cn("mt-3 flex-1", "data-[state=inactive]:hidden")}
          >
            {shipments}
          </TabsContent>
          <TabsContent
            value="whiteboard"
            className="mt-3 flex-1 data-[state=inactive]:hidden"
          >
            {whiteboard}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
