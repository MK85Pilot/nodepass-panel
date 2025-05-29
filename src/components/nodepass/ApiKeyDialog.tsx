
"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import type { NamedApiConfig } from '@/hooks/use-api-key'; 

interface ApiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: Omit<NamedApiConfig, 'id'> & { id?: string }) => void; 
  currentConfig?: NamedApiConfig | null;
  isEditing?: boolean;
}

export function ApiConfigDialog({ open, onOpenChange, onSave, currentConfig, isEditing = false }: ApiConfigDialogProps) {
  const [nameInput, setNameInput] = useState('');
  const [apiUrlInput, setApiUrlInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [prefixPathInput, setPrefixPathInput] = useState('');
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (open) {
      setNameInput(currentConfig?.name || '');
      setApiUrlInput(currentConfig?.apiUrl || 'http://localhost:3000');
      setTokenInput(currentConfig?.token || '');
      setPrefixPathInput(currentConfig?.prefixPath || '');
      setShowToken(false); // Reset token visibility when dialog opens
    }
  }, [open, currentConfig]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim() && apiUrlInput.trim() && tokenInput.trim()) {
      onSave({
        id: currentConfig?.id, 
        name: nameInput.trim(),
        apiUrl: apiUrlInput.trim(),
        token: tokenInput.trim(),
        prefixPath: prefixPathInput.trim() || null,
      });
      onOpenChange(false);
    }
  };

  const displayApiUrl = apiUrlInput || "http://[2a12::1]:3134";
  const displayPrefixPath = prefixPathInput ? `/${prefixPathInput.replace(/^\/+|\/+$/g, '')}` : "/api";


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center font-title">
              <KeyRound className="mr-2 h-5 w-5 text-primary" />
              {isEditing ? '编辑主控连接' : '添加主控连接'}
            </DialogTitle>
            <DialogDescription>
              输入 NodePass 主控名称、URL、令牌和可选前缀路径。主控接口版本固定为 v1 (例: {displayApiUrl}{displayPrefixPath}/v1/*)。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1">
              <Label htmlFor="config-name">主控名称</Label>
              <Input
                id="config-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="例: 本地主控"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="api-url">主控地址</Label>
              <Input
                id="api-url"
                value={apiUrlInput}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder="例: http://localhost:3000"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="token">令牌</Label>
              <div className="relative">
                <Input
                  id="token"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="输入令牌"
                  type={showToken ? 'text' : 'password'}
                  required
                  className="pr-10" // Add padding to make space for the icon
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowToken(!showToken)}
                  aria-label={showToken ? '隐藏令牌' : '显示令牌'}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="prefix-path">前缀路径 (可选)</Label>
              <Input
                id="prefix-path"
                value={prefixPathInput}
                onChange={(e) => setPrefixPathInput(e.target.value)}
                placeholder="例: api (若主控为 http://host/api/v1)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={!nameInput.trim() || !apiUrlInput.trim() || !tokenInput.trim()}>保存配置</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
