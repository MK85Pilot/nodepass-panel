
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KeyRound, Eye, EyeOff, Info, AlertTriangle } from 'lucide-react'; 
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key'; 
import type { AppLogEntry } from './EventLog';

interface ApiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: Omit<NamedApiConfig, 'id'> & { id?: string }) => void; 
  currentConfig?: NamedApiConfig | null;
  isEditing?: boolean;
  onLog?: (message: string, type: AppLogEntry['type']) => void;
}

export function ApiConfigDialog({ open, onOpenChange, onSave, currentConfig, isEditing = false, onLog }: ApiConfigDialogProps) {
  const [nameInput, setNameInput] = useState('');
  const [apiUrlInput, setApiUrlInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [prefixPathInput, setPrefixPathInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [masterLogLevelInput, setMasterLogLevelInput] = useState<MasterLogLevel>('master');
  const [masterTlsModeInput, setMasterTlsModeInput] = useState<MasterTlsMode>('master');

  useEffect(() => {
    if (open) {
      setNameInput(currentConfig?.name || '');
      setApiUrlInput(currentConfig?.apiUrl || 'http://localhost:3000');
      setTokenInput(currentConfig?.token || '');
      setPrefixPathInput(currentConfig?.prefixPath || '');
      setMasterLogLevelInput(currentConfig?.masterDefaultLogLevel || 'master');
      setMasterTlsModeInput(currentConfig?.masterDefaultTlsMode || 'master');
      setShowToken(false);
    } else {
      // Reset on close
      setNameInput('');
      setApiUrlInput('http://localhost:3000');
      setTokenInput('');
      setPrefixPathInput('');
      setMasterLogLevelInput('master');
      setMasterTlsModeInput('master');
      setShowToken(false);
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
        masterDefaultLogLevel: masterLogLevelInput,
        masterDefaultTlsMode: masterTlsModeInput,
      });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center font-title">
              <KeyRound className="mr-2 h-5 w-5 text-primary" />
              {isEditing ? '编辑主控' : '添加新主控'}
            </DialogTitle>
            <DialogDescription className="font-sans">
              为此 NodePass 主控配置连接。信息将保存在浏览器本地。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="space-y-1">
              <Label htmlFor="config-name" className="font-sans">主控名称</Label>
              <Input
                id="config-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="例: 本地主控"
                required
                className="font-sans"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="api-url" className="font-sans">主控 API 地址</Label>
              <Input
                id="api-url"
                value={apiUrlInput}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder="例: http://localhost:3000"
                required
                className="font-sans"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="token" className="font-sans">令牌 (API Key)</Label>
              <div className="relative">
                <Input
                  id="token"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="输入令牌"
                  type={showToken ? 'text' : 'password'}
                  required
                  className="pr-10 font-sans"
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
              <Label htmlFor="prefix-path" className="font-sans">API 前缀路径 (可选)</Label>
              <Input
                id="prefix-path"
                value={prefixPathInput}
                onChange={(e) => setPrefixPathInput(e.target.value)}
                placeholder="例: api (若为 /api/v1/*)"
                className="font-sans"
              />
               <p className="text-xs text-muted-foreground font-sans">
                如果主控的API路径是 `http://host/custom-prefix/v1`，则此处填 `custom-prefix`。留空则默认为 `/api`。
              </p>
            </div>

            <div className="my-3 border-t border-border"></div>
            <p className="text-sm text-muted-foreground font-sans pb-2">
              以下可选字段用于记录此主控的默认启动配置，供创建实例时参考。
            </p>

            <div className="space-y-1">
              <Label htmlFor="master-log-level" className="font-sans flex items-center">
                <Info size={14} className="mr-1.5 text-muted-foreground" />
                主控默认日志级别 (参考)
              </Label>
              <Select value={masterLogLevelInput} onValueChange={(value) => setMasterLogLevelInput(value as MasterLogLevel)}>
                <SelectTrigger className="font-sans text-sm">
                  <SelectValue placeholder="选择日志级别" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="master">未指定</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="master-tls-mode" className="font-sans flex items-center">
                 <Info size={14} className="mr-1.5 text-muted-foreground" />
                主控默认TLS模式 (参考)
              </Label>
              <Select value={masterTlsModeInput} onValueChange={(value) => setMasterTlsModeInput(value as MasterTlsMode)}>
                <SelectTrigger className="font-sans text-sm">
                  <SelectValue placeholder="选择TLS模式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="master">未指定</SelectItem>
                  <SelectItem value="0">0: 无TLS (明文)</SelectItem>
                  <SelectItem value="1">1: 自签名证书</SelectItem>
                  <SelectItem value="2">2: 自定义证书</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="font-sans">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={!nameInput.trim() || !apiUrlInput.trim() || !tokenInput.trim()}>保存配置</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
