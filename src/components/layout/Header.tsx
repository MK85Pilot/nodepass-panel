
"use client"

import React from 'react';
import Link from 'next/link';
import { Moon, Sun, Settings, LogOut, PlusCircle, ListTree, BarChartHorizontalBig, HelpCircle, Grid2X2 } from 'lucide-react'; // Removed Check
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import type { AppLogEntry } from '@/components/nodepass/EventLog';
import { AppLogo } from './AppLogo'; 

interface HeaderProps {
  onManageApiConfigs: (configToEdit?: NamedApiConfig | null) => void;
  onClearActiveConfig?: () => void;
  hasActiveApiConfig: boolean;
  onLog?: (message: string, type: AppLogEntry['type']) => void;
}

export function Header({ onManageApiConfigs, onClearActiveConfig, hasActiveApiConfig, onLog }: HeaderProps) {
  const { setTheme, theme } = useTheme();
  const { activeApiConfig } = useApiConfig(); // Removed apiConfigsList, setActiveApiConfigId, useToast, router

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" style={{ height: 'var(--header-height)' }}>
      <div className="container mx-auto flex h-16 items-center px-4 sm:px-6 lg:px-8">
        <div className="flex items-center">
          <Link href="/" className="flex items-center" aria-label="主页">
            <AppLogo className="h-[20px] sm:h-[24px] w-auto mr-2" /> 
            <h1 className="text-flow-effect text-xl font-title tracking-tight sm:text-2xl">NodePanel</h1>
          </Link>
           {activeApiConfig && (
            <span className="ml-3 text-xs px-2 py-1 bg-muted text-muted-foreground rounded-full hidden sm:inline-block font-sans">
              当前主控: {activeApiConfig.name}
            </span>
          )}
        </div>

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
            <DropdownMenuContent align="end" className="w-64 font-sans">
              <DropdownMenuLabel>主控管理</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onManageApiConfigs(null)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                <span>添加新主控</span>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link href="/connections">
                  <ListTree className="mr-2 h-4 w-4" />
                  <span>管理所有主控</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>可视化与分析</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/topology/advanced">
                  <Grid2X2 className="mr-2 h-4 w-4" />
                  <span>拓扑页面</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/traffic">
                  <BarChartHorizontalBig className="mr-2 h-4 w-4" />
                  <span>流量统计</span>
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/help">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  <span>帮助与说明</span>
                </Link>
              </DropdownMenuItem>

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
    
