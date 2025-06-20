
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
import { KeyRound, Eye, EyeOff, Info } from 'lucide-react'; 
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key'; 
import type { AppLogEntry } from './EventLog';
import { MASTER_TLS_MODE_DISPLAY_MAP } from './create-instance-dialog/constants';

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
  const [showToken, setShowToken] = useState(false);
  const [masterLogLevelInput, setMasterLogLevelInput] = useState<MasterLogLevel>('master');
  const [masterTlsModeInput, setMasterTlsModeInput] = useState<MasterTlsMode>('master');

  useEffect(() => {
    if (open) {
      setNameInput(currentConfig?.name || '');
      setApiUrlInput(currentConfig?.apiUrl || 'http://localhost:3000/api/v1');
      setTokenInput(currentConfig?.token || '');
      if (isEditing) {
        setMasterLogLevelInput(currentConfig?.masterDefaultLogLevel || 'master');
        setMasterTlsModeInput(currentConfig?.masterDefaultTlsMode || 'master');
      } else {
        setMasterLogLevelInput('master');
        setMasterTlsModeInput('master');
      }
      setShowToken(false);
    } else {
      setNameInput('');
      setApiUrlInput('http://localhost:3000/api/v1');
      setTokenInput('');
      setMasterLogLevelInput('master');
      setMasterTlsModeInput('master');
      setShowToken(false);
    }
  }, [open, currentConfig, isEditing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim() && apiUrlInput.trim() && tokenInput.trim()) {
      const configToSave: Omit<NamedApiConfig, 'id'> & { id?: string } = {
        id: currentConfig?.id, 
        name: nameInput.trim(),
        apiUrl: apiUrlInput.trim(),
        token: tokenInput.trim(),
      };
      if (isEditing) {
        configToSave.masterDefaultLogLevel = masterLogLevelInput;
        configToSave.masterDefaultTlsMode = masterTlsModeInput;
      }
      // If not editing, masterDefaultLogLevel and masterDefaultTlsMode are not included,
      // useApiConfig will default them to 'master'.
      onSave(configToSave);
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
              {isEditing ? '编辑主控连接' : '添加新主控连接'}
            </DialogTitle>
            <DialogDescription className="font-sans">
              {isEditing ? `修改主控 "${currentConfig?.name}" 的连接配置。` : '为此 NodePass 主控配置连接。信息将保存在浏览器本地。'}
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
                placeholder="例: http://localhost:3000/api/v1" 
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

            {isEditing && (
              <>
                <div className="my-3 border-t border-border"></div>
                <p className="text-sm text-muted-foreground font-sans pb-2">
                  以下字段用于配置此主控在 NodePanel 中的默认启动参数参考值。
                </p>

                <div className="space-y-1">
                  <Label htmlFor="master-log-level" className="font-sans flex items-center">
                    <Info size={14} className="mr-1.5 text-muted-foreground" />
                    NodePanel 参考: 默认日志级别
                  </Label>
                  <Select value={masterLogLevelInput} onValueChange={(value) => setMasterLogLevelInput(value as MasterLogLevel)}>
                    <SelectTrigger className="font-sans text-sm">
                      <SelectValue placeholder="选择日志级别" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="master">主控实际配置</SelectItem>
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
                    NodePanel 参考: 默认TLS模式
                  </Label>
                  <Select value={masterTlsModeInput} onValueChange={(value) => setMasterTlsModeInput(value as MasterTlsMode)}>
                    <SelectTrigger className="font-sans text-sm">
                      <SelectValue placeholder="选择TLS模式" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MASTER_TLS_MODE_DISPLAY_MAP).map(([val, lab]) => (
                        <SelectItem key={val} value={val}>{lab === "主控配置" ? "主控实际配置" : lab}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
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
