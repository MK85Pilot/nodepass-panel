
"use client";

import React from 'react';
import type { Instance } from '@/types/nodepass';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmationDialog } from './ConfirmationDialog'; 
import { Trash2 } from 'lucide-react';

interface BulkDeleteInstancesDialogProps {
  selectedInstances: Pick<Instance, 'id' | 'url'>[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  isLoading: boolean;
}

export function BulkDeleteInstancesDialog({
  selectedInstances,
  open,
  onOpenChange,
  onConfirmDelete,
  isLoading,
}: BulkDeleteInstancesDialogProps) {
  if (!open) return null;

  if (selectedInstances.length === 0 && open) {
    return (
      <ConfirmationDialog
        open={open}
        onOpenChange={onOpenChange}
        title="无选中实例"
        description="没有选中任何实例进行删除。"
        onConfirm={() => onOpenChange(false)} 
        confirmText="关闭"
        isLoading={false} 
      />
    );
  }

  const mainDescription = (
    <>
      确定删除以下 <span className="font-semibold">{selectedInstances.length}</span> 个选中的实例吗？此操作无法撤销。
    </>
  );

  const listContent = selectedInstances.length > 0 ? (
    <ScrollArea className="max-h-[200px] my-2 rounded-md border p-2 bg-muted/30">
      <ul className="space-y-1 text-xs">
        {selectedInstances.map(instance => (
          <li key={instance.id} className="font-mono truncate" title={instance.url}>
            ID: {instance.id.substring(0, 12)}... (URL: {instance.url.length > 30 ? instance.url.substring(0, 27) + '...' : instance.url})
          </li>
        ))}
      </ul>
    </ScrollArea>
  ) : null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="批量删除实例"
      description={mainDescription}
      onConfirm={onConfirmDelete}
      confirmText={isLoading ? "删除中..." : `删除 ${selectedInstances.length} 个实例`}
      confirmButtonVariant="destructive"
      ConfirmButtonIcon={Trash2}
      isLoading={isLoading || selectedInstances.length === 0}
    >
      {listContent}
    </ConfirmationDialog>
  );
}

