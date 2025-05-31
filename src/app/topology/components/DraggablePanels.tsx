
"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Cog, Network, ServerIcon, SmartphoneIcon, Globe, UserCircle2 } from 'lucide-react';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import type { DraggableNodeType, TopologyNodeData } from '../lib/topology-types';
import { getNodeIconColorClass } from '../lib/topology-utils';


interface DraggablePanelsProps {
  apiConfigsList: NamedApiConfig[];
  onDragStartPanelItem: (
    event: React.DragEvent<HTMLDivElement>,
    nodeType: TopologyNodeData['type'],
    label?: string,
    apiId?: string,
    apiName?: string
  ) => void;
}

const nodePanelTypes: DraggableNodeType[] = [
    { type: 'server', title: '服务端', icon: ServerIcon },
    { type: 'client', title: '客户端 (通用)', icon: SmartphoneIcon },
    { type: 'landing', title: '落地', icon: Globe },
    { type: 'user', title: '用户源', icon: UserCircle2 },
];


export const DraggablePanels: React.FC<DraggablePanelsProps> = ({
  apiConfigsList,
  onDragStartPanelItem,
}) => {
  return (
    <div className="w-60 flex-shrink-0 space-y-3 h-full overflow-y-hidden flex flex-col">
      <Card className="shadow-sm flex-shrink-0">
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-sm font-title flex items-center">
            <Cog className="mr-1.5 h-4 w-4 text-yellow-500" />已配置主控
          </CardTitle>
        </CardHeader>
        <CardContent className="p-1.5">
          <ScrollArea className="h-[120px]">
            <div className="space-y-1 p-1">
              {apiConfigsList.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-1 font-sans">无主控连接。</p>
              )}
              {apiConfigsList.map((config) => (
                <div
                  key={config.id}
                  draggable
                  onDragStart={(e) => onDragStartPanelItem(e, 'controller', config.name, config.id, config.name)}
                  className="flex items-center gap-1.5 p-1.5 border rounded cursor-grab hover:bg-muted/50 active:cursor-grabbing transition-colors text-xs"
                  title={`拖拽添加: "${config.name}" (首个为主控节点, 后续为客户端节点)`}
                >
                  <Cog className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                  <span className="font-medium truncate font-sans">{config.name}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="shadow-sm flex-shrink-0">
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-sm font-title flex items-center">
            <Network className="mr-1.5 h-4 w-4 text-primary" />组件面板
          </CardTitle>
        </CardHeader>
        <CardContent className="p-1.5">
          <ScrollArea className="h-[160px]">
            <div className="space-y-1 p-1">
              {nodePanelTypes.filter(nt => nt.type !== 'controller').map(({ type, title, icon: Icon }) => (
                <div
                  key={type}
                  draggable
                  onDragStart={(e) => onDragStartPanelItem(e, type, title)}
                  className="flex items-center gap-1.5 p-1.5 border rounded cursor-grab hover:bg-muted/50 active:cursor-grabbing transition-colors text-xs"
                  title={`拖拽添加 "${title}"`}
                >
                  <Icon className={`h-3.5 w-3.5 ${getNodeIconColorClass(type)} shrink-0`} />
                  <span className="font-medium font-sans">{title}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
