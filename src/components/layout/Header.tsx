
"use client"

import React from 'react';
import Link from 'next/link';
import { Moon, Sun, Settings, LogOut, PlusCircle, ListTree, Network, BarChartHorizontalBig, Check, Edit3, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  onManageApiConfigs: (configToEdit?: NamedApiConfig | null) => void;
  onClearActiveConfig?: () => void;
  hasActiveApiConfig: boolean;
}

export function Header({ onManageApiConfigs, onClearActiveConfig, hasActiveApiConfig }: HeaderProps) {
  const { setTheme, theme } = useTheme();
  const { apiConfigsList, activeApiConfig, setActiveApiConfigId, deleteApiConfig } = useApiConfig();
  const { toast } = useToast();
  const router = useRouter();

  const handleSwitchApiConfig = (id: string) => {
    const newActiveConf = apiConfigsList.find(c => c.id === id);
    setActiveApiConfigId(id);
     toast({
      title: '活动主控已切换',
      description: `已连接到 “${newActiveConf?.name}”。`,
    });
    window.location.href = '/';
  };

  const handleDeleteConfigFromDropdown = (configId: string, configName: string) => {
    if (activeApiConfig?.id === configId) {
      toast({
        title: '操作失败',
        description: '不能删除当前活动的主控。请先切换到其他主控。',
        variant: 'destructive',
      });
      return;
    }
    deleteApiConfig(configId);
    toast({
      title: '主控已删除',
      description: `“${configName}”已被删除。`,
      variant: 'destructive',
    });
  };


  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" style={{ height: 'var(--header-height)' }}>
      <div className="container mx-auto flex h-16 items-center px-4 sm:px-6 lg:px-8">
        {/* Left Group: Logo, Title, Active API Name */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center" aria-label="主页">
            <Network className="mr-2 h-6 w-6 text-primary" />
            <h1 className="text-flow-effect text-xl font-bold tracking-tight sm:text-2xl">NodePass 管理器</h1>
          </Link>
           {activeApiConfig && (
            <span className="ml-3 text-xs px-2 py-1 bg-muted text-muted-foreground rounded-full hidden sm:inline-block">
              已连接: {activeApiConfig.name}
            </span>
          )}
        </div>

        {/* Right Group: Theme Toggle, Settings Dropdown - This group gets ml-auto */}
        <div className="flex items-center space-x-2 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label="切换主题"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="应用设置">
                <Settings className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>主控连接</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onManageApiConfigs(null)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                <span>添加新主控</span>
              </DropdownMenuItem>

              <Link href="/connections" passHref legacyBehavior>
                <DropdownMenuItem>
                  <ListTree className="mr-2 h-4 w-4" />
                  <span>管理所有主控</span>
                </DropdownMenuItem>
              </Link>

              {apiConfigsList.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                     <Check className="mr-2 h-4 w-4 text-primary" />
                    <span>切换活动主控</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="max-h-60 overflow-y-auto">
                      {apiConfigsList.map(config => (
                        <DropdownMenuItem
                          key={config.id}
                          onClick={() => handleSwitchApiConfig(config.id)}
                          disabled={activeApiConfig?.id === config.id}
                        >
                          {activeApiConfig?.id === config.id && <Check className="mr-2 h-4 w-4 text-green-500" />}
                          <span className={`truncate ${activeApiConfig?.id !== config.id ? 'ml-6' : ''}`}>{config.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuLabel>可视化与分析</DropdownMenuLabel>
               <Link href="/topology" passHref legacyBehavior>
                <DropdownMenuItem>
                  <Network className="mr-2 h-4 w-4" />
                  <span>连接拓扑图</span>
                </DropdownMenuItem>
              </Link>
              <Link href="/traffic" passHref legacyBehavior>
                <DropdownMenuItem>
                  <BarChartHorizontalBig className="mr-2 h-4 w-4" />
                  <span>流量统计</span>
                </DropdownMenuItem>
              </Link>

              {hasActiveApiConfig && onClearActiveConfig && (
                 <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onClearActiveConfig} className="text-destructive hover:!text-destructive focus:!text-destructive focus:!bg-destructive/10">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>断开当前主控</span>
                  </DropdownMenuItem>
                 </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
