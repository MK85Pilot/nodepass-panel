
"use client";

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Instance } from '@/types/nodepass';

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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除实例</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除实例 <span className="font-semibold">{instance.id}</span>？此操作无法撤销。URL: <span className="font-semibold break-all">{instance.url}</span>。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirmDelete(instance.id)}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? '删除中...' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
