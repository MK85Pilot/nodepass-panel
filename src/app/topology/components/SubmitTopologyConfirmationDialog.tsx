
"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send } from 'lucide-react';
import type { BuildUrlParams } from '@/components/nodepass/create-instance-dialog/utils';

export interface InstanceUrlConfigWithName {
  nodeId: string;
  nodeLabel: string;
  masterId: string;
  masterName: string;
  url: string;
  instanceType: "入口(c)" | "出口(s)";
}

interface SubmitTopologyConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instancesToCreate: InstanceUrlConfigWithName[];
  onConfirm: () => void;
  isSubmitting: boolean;
}

export function SubmitTopologyConfirmationDialog({
  open,
  onOpenChange,
  instancesToCreate,
  onConfirm,
  isSubmitting,
}: SubmitTopologyConfirmationDialogProps) {

  const groupedInstances = instancesToCreate.reduce((acc, inst) => {
    if (!acc[inst.masterName]) {
      acc[inst.masterName] = [];
    }
    acc[inst.masterName].push(inst);
    return acc;
  }, {} as Record<string, InstanceUrlConfigWithName[]>);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-title flex items-center">
            <Send className="mr-2 h-5 w-5 text-primary" />
            确认提交拓扑
          </DialogTitle>
          <DialogDescription className="font-sans">
            将创建以下 {instancesToCreate.length} 个实例。请检查配置是否正确。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow my-2 rounded-md border p-3 bg-muted/20">
          {Object.entries(groupedInstances).map(([masterName, masterInstances]) => (
            <div key={masterName} className="mb-3 last:mb-0">
              <h4 className="text-sm font-semibold mb-1 font-sans text-primary">{masterName} ({masterInstances.length} 个实例)</h4>
              <ul className="space-y-1 text-xs">
                {masterInstances.map(instance => (
                  <li key={instance.nodeId} className="font-mono p-1.5 bg-background rounded shadow-sm border border-border/50">
                    <div className="font-semibold text-foreground">{instance.instanceType}: <span className="text-muted-foreground">{instance.nodeLabel} (ID: {instance.nodeId.substring(0,8)}...)</span></div>
                    <div className="truncate text-blue-600 dark:text-blue-400" title={instance.url}>{instance.url}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </ScrollArea>
        
        <DialogFooter className="font-sans pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isSubmitting || instancesToCreate.length === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              <>
              <Send className="mr-2 h-4 w-4" />
              确认创建 {instancesToCreate.length} 个实例
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
