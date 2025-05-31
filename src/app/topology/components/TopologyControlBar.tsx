
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Maximize, LayoutGrid, RefreshCw, UploadCloud, Eraser } from 'lucide-react';

interface TopologyControlBarProps {
  onFitView: () => void;
  onFormatLayout: () => void;
  onRefreshData: () => void;
  onSubmitTopology: () => void;
  onClearCanvas: () => void;
  isLoadingData: boolean;
  lastRefreshed: Date | null;
}

export const TopologyControlBar: React.FC<TopologyControlBarProps> = ({
  onFitView,
  onFormatLayout,
  onRefreshData,
  onSubmitTopology,
  onClearCanvas,
  isLoadingData,
  lastRefreshed,
}) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
      <h1 className="text-2xl sm:text-3xl font-bold font-title">实例连接拓扑</h1>
      <div className="flex items-center gap-2 flex-wrap">
        {lastRefreshed && (
          <span className="text-xs text-muted-foreground font-sans">
            数据刷新: {lastRefreshed.toLocaleTimeString()}
          </span>
        )}
        <Button variant="outline" onClick={onFitView} title="自适应视图" size="sm" className="font-sans h-9">
          <Maximize className="mr-1 h-4 w-4" />自适应
        </Button>
        <Button variant="outline" onClick={onFormatLayout} size="sm" className="font-sans h-9">
          <LayoutGrid className="mr-1 h-4 w-4" />格式化
        </Button>
        <Button variant="outline" onClick={onRefreshData} disabled={isLoadingData} size="sm" className="font-sans">
          <RefreshCw className={`mr-1 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
          {isLoadingData ? '刷新中' : '刷新数据'}
        </Button>
        <Button variant="default" onClick={onSubmitTopology} size="sm" className="font-sans bg-green-600 hover:bg-green-700 text-white">
          <UploadCloud className="mr-1 h-4 w-4" />
          提交拓扑
        </Button>
        <Button variant="destructive" onClick={onClearCanvas} size="sm" className="font-sans">
          <Eraser className="mr-1 h-4 w-4" />
          清空画布
        </Button>
      </div>
    </div>
  );
};
