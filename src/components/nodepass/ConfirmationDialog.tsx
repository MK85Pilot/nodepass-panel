
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
import { Button, type buttonVariants } from '@/components/ui/button'; // Import Button for variant props
import type { VariantProps } from 'class-variance-authority'; // Import VariantProps
import { Loader2 } from 'lucide-react';

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode; // Allow for more complex descriptions
  children?: React.ReactNode; // Added to allow for more complex content below description
  onConfirm: () => void;
  confirmText?: string;
  confirmButtonVariant?: VariantProps<typeof buttonVariants>["variant"];
  ConfirmButtonIcon?: React.ElementType;
  isLoading?: boolean;
  cancelText?: string;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  children, // Destructure new prop
  onConfirm,
  confirmText = "确认",
  confirmButtonVariant = "default",
  ConfirmButtonIcon,
  isLoading = false,
  cancelText = "取消",
}: ConfirmationDialogProps) {
  if (!open) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-title">{title}</AlertDialogTitle>
          <AlertDialogDescription className="font-sans">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children && <div className="py-2">{children}</div>} 
        <AlertDialogFooter className="font-sans">
          <AlertDialogCancel disabled={isLoading} onClick={() => onOpenChange(false)}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className={confirmButtonVariant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              ConfirmButtonIcon && <ConfirmButtonIcon className="mr-2 h-4 w-4" />
            )}
            {isLoading ? "处理中..." : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

