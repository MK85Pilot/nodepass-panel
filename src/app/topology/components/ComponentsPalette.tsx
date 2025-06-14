
"use client";

import React from 'react';
import { Server, Smartphone as ClientIcon, Globe, UserCircle2 as UserIcon } from 'lucide-react'; // Renamed Smartphone to ClientIcon

export type DraggableNodeType = 'S' | 'C' | 'T' | 'U';

interface ComponentItem {
  type: DraggableNodeType;
  label: string;
  icon: React.ElementType;
  colorClass: string;
  description: string;
}

const componentItems: ComponentItem[] = [
  { type: 'U', label: '用户入口', icon: UserIcon, colorClass: 'text-purple-600', description: '用户或流量发起方' },
  { type: 'C', label: '客户端', icon: ClientIcon, colorClass: 'text-green-600', description: 'NodePass 客户端实例' },
  { type: 'S', label: '服务端', icon: Server, colorClass: 'text-primary', description: 'NodePass 服务端实例' },
  { type: 'T', label: '目标服务', icon: Globe, colorClass: 'text-orange-500', description: '最终流量目标设备/服务' },
];

export function ComponentsPalette() {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, type: DraggableNodeType) => {
    event.dataTransfer.setData('application/nodepass-component-type', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="h-full space-y-2">
      {componentItems.map((item) => (
        <div
          key={item.type}
          draggable={true}
          onDragStart={(event) => handleDragStart(event, item.type)}
          className="flex items-center p-2 border rounded-md bg-card text-card-foreground hover:bg-muted/50 cursor-grab active:cursor-grabbing transition-colors text-xs font-sans shadow-sm"
          title={`拖拽 ${item.label} 到画布`}
        >
          <item.icon className={`mr-2 h-4 w-4 ${item.colorClass} flex-shrink-0`} />
          <div className="truncate">
            <span className="font-semibold">{item.label}</span>
            {/* <p className="text-xs text-muted-foreground">{item.description}</p> */}
          </div>
        </div>
      ))}
    </div>
  );
}
    

    