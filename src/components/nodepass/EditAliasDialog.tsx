
"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tag } from 'lucide-react';

interface EditAliasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string | null;
  currentAlias: string | undefined;
  onSave: (instanceId: string, newAlias: string) => void;
}

export function EditAliasDialog({ open, onOpenChange, instanceId, currentAlias, onSave }: EditAliasDialogProps) {
  const [aliasInput, setAliasInput] = useState('');

  useEffect(() => {
    if (open) {
      setAliasInput(currentAlias || '');
    }
  }, [open, currentAlias]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (instanceId) {
      onSave(instanceId, aliasInput.trim());
    }
    onOpenChange(false);
  };

  if (!instanceId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center font-title">
              <Tag className="mr-2 h-5 w-5 text-primary" />
              编辑实例别名
            </DialogTitle>
            <DialogDescription className="font-sans">
              为实例 <span className="font-mono font-semibold">{instanceId}</span> 设置或修改别名。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1">
              <Label htmlFor="alias-input" className="font-sans">别名</Label>
              <Input
                id="alias-input"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                placeholder="输入别名 (可选)"
                className="font-sans"
                maxLength={50}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="font-sans">
            <DialogClose asChild>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            </DialogClose>
            <Button type="submit">保存别名</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
