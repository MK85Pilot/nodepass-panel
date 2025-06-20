
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { LocateFixed, Trash2, Send, RefreshCw, PanelLeft } from 'lucide-react'; 

interface TopologyToolbarProps {
  onCenterView: () => void;
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  onRefreshAllInstanceCounts: () => void;
  canSubmit: boolean;
  isSubmitting?: boolean;
  isRefreshingCounts?: boolean;
  isMobile?: boolean;
  onToggleMobilePalette?: () => void;
}

export function TopologyToolbar({
  onCenterView,
  onClearCanvas,
  onSubmitTopology,
  onRefreshAllInstanceCounts,
  canSubmit,
  isSubmitting,
  isRefreshingCounts,
  isMobile,
  onToggleMobilePalette,
}: TopologyToolbarProps) {
  return (
    <div className="flex flex-row flex-wrap gap-2 items-center">
      {isMobile && onToggleMobilePalette && (
        <Button onClick={onToggleMobilePalette} size="sm" variant="outline" className="font-sans">
          <PanelLeft className="mr-2 h-4 w-4" />
          组件面板
        </Button>
      )}
      <Button onClick={onRefreshAllInstanceCounts} size="sm" variant="outline" className="font-sans" disabled={isSubmitting || isRefreshingCounts}>
        <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingCounts ? 'animate-spin' : ''}`} />
        {isRefreshingCounts ? "刷新中..." : "刷新计数"}
      </Button>
      <Button onClick={onCenterView} size="sm" variant="outline" className="font-sans" disabled={isSubmitting}>
        <LocateFixed className="mr-2 h-4 w-4" />
        居中
      </Button>
      <Button onClick={onSubmitTopology} size="sm" variant="default" className="font-sans" disabled={!canSubmit || isSubmitting}>
        <Send className="mr-2 h-4 w-4" />
        {isSubmitting ? "提交中..." : "提交"}
      </Button>
      <Button onClick={onClearCanvas} size="sm" variant="destructive" className="font-sans" disabled={isSubmitting}>
        <Trash2 className="mr-2 h-4 w-4" />
        清空
      </Button>
    </div>
  );
}
