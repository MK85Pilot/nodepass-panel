
"use client";

import React from 'react';
import type { Instance } from '@/types/nodepass';
import { ConfirmationDialog } from './ConfirmationDialog'; // Import the new generic dialog
import { Trash2 } from 'lucide-react';

interface DeleteInstanceDialogProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: (instanceId: string) => void;
  isLoading: boolean;
}

export function DeleteInstanceDialog({
  instance,
  open,
  onOpenChange,
  onConfirmDelete,
  isLoading,
}: DeleteInstanceDialogProps) {
  if (!instance) return null;

  const description = (
    <>
      确定删除实例 <span className="font-semibold">{instance.id.substring(0,12)}...</span>？此操作无法撤销。
      <br />
      URL: <span className="font-semibold break-all">{instance.url}</span>。
    </>
  );

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="删除实例"
      description={description}
      onConfirm={() => onConfirmDelete(instance.id)}
      confirmText="删除"
      confirmButtonVariant="destructive"
      ConfirmButtonIcon={Trash2}
      isLoading={isLoading}
    />
  );
}
