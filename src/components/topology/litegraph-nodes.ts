
import { LGraphNode, LiteGraph, Vector2, LLink, IContextMenuOptions, INodeInputSlot, INodeOutputSlot, WidgetCallback, SlotShape } from 'litegraph.js';
import { ServerIcon, SmartphoneIcon, Globe, UserCircle2, Settings2, Cog } from 'lucide-react';

// Base class for NodePass specific nodes
export class NodePassBaseNode extends LGraphNode {
  static title_color = "#1E90FF"; 
  static fgcolor = "#FFFFFF";     
  static bgcolor = "#3A3A3A";     
  static node_type_color = "#4CAF50"; 
  
  protected currentTitleColor: string = NodePassBaseNode.title_color;
  protected currentFgColor: string = NodePassBaseNode.fgcolor;
  protected currentBgColor: string = NodePassBaseNode.bgcolor;
  protected currentTypeColor: string = NodePassBaseNode.node_type_color;
  protected currentBorderColor: string = "transparent";
  public chainHighlightColor: string = "rgba(0, 188, 212, 0.7)"; 
  
  public _isChainHighlighted: boolean = false;
  public data: Record<string, any> = {}; 

  static constructor_properties?: Record<string, { type: string, label?: string, default?: any, options?: (string | {value: string, label: string})[], placeholder?: string, description?: string }>;
  
  constructor(title?: string) {
    super(title);
    this.shape = LiteGraph.ROUNDED_SHAPE; 
    this.flags = { ...this.flags, collapsable: true };

    this.properties = {
        type: (this.constructor as any).category?.split("/")[1]?.toLowerCase() || 'unknown',
        statusInfo: '', // Initialize statusInfo
        ...(this.properties || {}) 
    };
    
    // Ensure all constructor_properties have a default in this.properties if not already set
    const ctorProps = (this.constructor as typeof NodePassBaseNode).constructor_properties || {};
    for (const key in ctorProps) {
        if (this.properties[key] === undefined && ctorProps[key].default !== undefined) {
            this.properties[key] = ctorProps[key].default;
        }
    }
  }

  updateThemeColors(theme: string) {
    const isDark = theme === 'dark';
    this.currentTitleColor = isDark ? "hsl(211 100% 75%)" : "hsl(211 100% 45%)"; 
    this.currentFgColor = isDark ? "hsl(0 0% 98%)" : "hsl(0 0% 8%)"; 
    this.currentBgColor = isDark ? "hsl(0 0% 15%)" : "hsl(0 0% 100%)";  
    this.currentTypeColor = isDark ? "hsl(187 100% 65%)" : "hsl(187 100% 38%)"; 
    this.chainHighlightColor = isDark ? "rgba(0, 220, 255, 0.5)" : "rgba(0, 150, 180, 0.6)"; 

    this.color = this.currentBgColor;
    this.bgcolor = this.currentBgColor; 
  }


  onDrawBackground(ctx: CanvasRenderingContext2D, graphcanvas: any, canvas: HTMLCanvasElement, pos: Vector2) {
    super.onDrawBackground?.(ctx, graphcanvas, canvas, pos); 

    if (this.flags.collapsed) return;
    
    let borderColor = this.currentBorderColor;
    if (this.properties.statusInfo?.includes('失败')) {
        borderColor = "hsl(0 100% 60%)"; // Destructive color
    } else if (this.properties.statusInfo?.includes('已提交')) {
        borderColor = "hsl(120 70% 50%)"; // Success color
    }


    if (!this.selected && borderColor !== "transparent") {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.5; 
        const cornerRadius = 6; 
        ctx.beginPath();
        ctx.roundRect(0.75, 0.75, this.size[0]-1.5, this.size[1]-1.5, cornerRadius);
        ctx.stroke();
    }
    
    if (this._isChainHighlighted && !this.selected) {
        ctx.strokeStyle = this.chainHighlightColor;
        ctx.lineWidth = 2.5; 
        const cornerRadius = 6;
        ctx.beginPath();
        ctx.roundRect(-1.25, -1.25, this.size[0] + 2.5, this.size[1] + 2.5, cornerRadius + 1); 
        ctx.stroke();
    }
  }
  
  onDrawForeground(ctx: CanvasRenderingContext2D, graphcanvas: any) {
    super.onDrawForeground?.(ctx, graphcanvas); 

    if (this.flags.collapsed) return;

    const typeText = (this.constructor as any).nodeCategoryText || this.type.split('/').pop()?.toUpperCase() || 'NODE';
    const hasApiName = !!this.data?.apiName;
    const hasStatusInfo = !!this.properties.statusInfo;

    let availableHeightForText = this.size[1] - 4; // Initial bottom padding
    
    if (hasStatusInfo) {
        const statusText = this.properties.statusInfo as string;
        ctx.fillStyle = statusText.includes("失败") ? "hsl(0 100% 70%)" : "hsl(120 60% 60%)";
        ctx.font = "italic bold 8px Arial";
        ctx.textAlign = "center";
        ctx.fillText(statusText, this.size[0] / 2, availableHeightForText - 2);
        availableHeightForText -= 10; // Height of status text + small margin
    }
    
    ctx.fillStyle = this.currentTypeColor;
    ctx.font = "bold 9px Arial";
    ctx.textAlign = "left";
    const typeTextY = hasStatusInfo ? availableHeightForText - 2 : this.size[1] - 6;
    ctx.fillText(typeText, 6, typeTextY);


    if (hasApiName) {
        const apiNameText = `API: ${this.data.apiName}`;
        ctx.fillStyle = this.currentFgColor; 
        ctx.font = "italic 8px Arial";
        ctx.textAlign = "right";
        const typeTextWidth = ctx.measureText(typeText).width;
        if (this.size[0] - 6 - typeTextWidth > ctx.measureText(apiNameText).width + 5) {
             ctx.fillText(apiNameText, this.size[0] - 6, typeTextY); // Align with typeText Y
        }
    }
  }

  onDrawTitle(ctx: CanvasRenderingContext2D) {
    if (this.title && this.flags.show_title !== false) {
        ctx.fillStyle = this.currentTitleColor;
        const currentFont = NodePassBaseNode.title_text_font || ((this.constructor as any).title_text_font) || "bold 14px Arial";
        ctx.font = currentFont; 
        const title_width = ctx.measureText(this.title).width;
        
        const title_y_offset = LiteGraph.NODE_TITLE_HEIGHT * 0.7; 
        const x = Math.max(5, (this.size[0] - title_width) * 0.5); 
        ctx.fillText(this.title, x, title_y_offset);
    }
  }
}


export class ControllerNode extends NodePassBaseNode {
  static type = "nodepass/controller";
  static title = "主控";
  static category = "NodePass/Control";
  static nodeCategoryText = "CTRL"; 

  static constructor_properties = {
    apiConfigName: { type: "string", label: "API配置名称", default: "", description: "此主控关联的API配置名 (只读)。" },
    apiConfigId: { type: "string", label: "API配置ID", default: "", description: "关联的API配置ID (只读)。" },
    ...NodePassBaseNode.constructor_properties,
  };
  
  constructor(title?: string) {
    super(title || ControllerNode.title);
    this.addOutput("服务出口", ServerNode.type, { color_on: "#AFA", color_off: "#4A4", shape: LiteGraph.BOX_SHAPE });
    this.addOutput("客户出口", ClientNode.type, { color_on: "#AAF", color_off: "#44A", shape: LiteGraph.BOX_SHAPE });
    this.properties = { 
        ...this.properties, 
        type: 'controller',
        apiConfigName: '', 
        apiConfigId: '',
    };
    this.size = [160, 60]; 
  }

  setApiConfig(id: string, name: string) {
    this.properties.apiConfigId = id;
    this.properties.apiConfigName = name;
    this.title = name; 
    this.data = { ...(this.data || {}), apiId: id, apiName: name };
  }

  updateThemeColors(theme: string) {
    super.updateThemeColors(theme);
    this.currentBorderColor = theme === 'dark' ? "hsl(48 90% 55%)" : "hsl(48 100% 45%)"; 
  }
}


export class ServerNode extends NodePassBaseNode {
  static type = "nodepass/server";
  static title = "服务端";
  static category = "NodePass/Endpoints";
  static nodeCategoryText = "SVR";

  static constructor_properties = {
    tunnelAddress: { type: "string", label: "隧道监听", default: "0.0.0.0:10001", placeholder: "0.0.0.0:PORT", description: "控制通道监听 (host:port)。" },
    targetAddress: { type: "string", label: "流量转发", default: "0.0.0.0:8080", placeholder: "0.0.0.0:PORT", description: "隧道流量监听 (host:port)。" },
    logLevel: { type: "enum", label: "日志级别", default: "master", options: ["master", "debug", "info", "warn", "error", "fatal"], description: "'master': 主控默认。" },
    tlsMode: { type: "enum", label: "TLS模式", default: "master", options: [{value: "master", label:"主控默认"}, {value:"0", label:"0: 无"}, {value:"1", label:"1: 自签"}, {value:"2", label:"2: 自定义"}], description: "服务端TLS配置。" },
    crt: { type: "string", label: "证书CRT (TLS 2)", default: "", placeholder: "/path/cert.pem", description: "自定义证书路径。" },
    key: { type: "string", label: "密钥KEY (TLS 2)", default: "", placeholder: "/path/key.pem", description: "自定义密钥路径。" },
    ...NodePassBaseNode.constructor_properties,
  };
  
  constructor(title?: string) {
    super(title || ServerNode.title);
    this.addInput("主控输入", ControllerNode.type, { color_on: "#AFA", color_off: "#4A4", shape: LiteGraph.BOX_SHAPE });
    this.addInput("客户隧道输入", ClientNode.type, {color_on: "#AAF", color_off: "#44A", shape: LiteGraph.CIRCLE_SHAPE }); 
    this.addOutput("客户隧道输出", ClientNode.type, { color_on: "#AAF", color_off: "#44A", shape: LiteGraph.CIRCLE_SHAPE });
    this.addOutput("落地连接", LandingNode.type, { color_on: "#FAA", color_off: "#A44", shape: LiteGraph.ARROW_SHAPE });
    this.properties = { ...this.properties, type: 'server' };
    this.size = [160, 90];
  }
  updateThemeColors(theme: string) {
    super.updateThemeColors(theme);
    this.currentBorderColor = theme === 'dark' ? "hsl(211 90% 65%)" : "hsl(211 100% 50%)"; 
  }
}

export class ClientNode extends NodePassBaseNode {
  static type = "nodepass/client";
  static title = "客户端";
  static category = "NodePass/Endpoints";
  static nodeCategoryText = "CLI";

  static constructor_properties = {
    tunnelAddress: { type: "string", label: "服务端隧道", default: "server.host:10001", placeholder: "server.host:PORT", description: "连接的SVR控制通道。" },
    targetAddress: { type: "string", label: "本地转发", default: "127.0.0.1:8000", placeholder: "127.0.0.1:PORT", description: "本地应用监听地址。" },
    logLevel: { type: "enum", label: "日志级别", default: "master", options: ["master", "debug", "info", "warn", "error", "fatal"], description: "'master': 主控默认。" },
    ...NodePassBaseNode.constructor_properties,
  };

  constructor(title?: string) {
    super(title || ClientNode.title);
    this.addInput("主控输入", ControllerNode.type, { color_on: "#AAF", color_off: "#44A", shape: LiteGraph.BOX_SHAPE });
    this.addInput("连接到服务端", ServerNode.type, { color_on: "#AFA", color_off: "#4A4", shape: LiteGraph.CIRCLE_SHAPE });
    this.addOutput("落地连接", LandingNode.type, { color_on: "#FAA", color_off: "#A44", shape: LiteGraph.ARROW_SHAPE });
    this.properties = { ...this.properties, type: 'client' };
    this.size = [160, 80];
  }
   updateThemeColors(theme: string) {
    super.updateThemeColors(theme);
    this.currentBorderColor = theme === 'dark' ? "hsl(187 90% 55%)" : "hsl(187 100% 42%)"; 
  }
}

export class LandingNode extends NodePassBaseNode {
  static type = "nodepass/landing";
  static title = "落地";
  static category = "NodePass/Targets";
  static nodeCategoryText = "END";
  
  static constructor_properties = {
      targetAddress: { type: "string", label: "目标服务", default: "final.service.com:80", placeholder: "最终目标服务 (可选)" },
      ...NodePassBaseNode.constructor_properties,
  };

  constructor(title?: string) {
    super(title || LandingNode.title);
    this.addInput("来自服务端", ServerNode.type, { color_on: "#FAA", color_off: "#A44", shape: LiteGraph.ARROW_SHAPE });
    this.addInput("来自客户端", ClientNode.type, { color_on: "#FAA", color_off: "#A44", shape: LiteGraph.ARROW_SHAPE });
    this.properties = { ...this.properties, type: 'landing' };
    this.size = [160, 60];
  }
  updateThemeColors(theme: string) {
    super.updateThemeColors(theme);
    this.currentBorderColor = theme === 'dark' ? "hsl(262 75% 75%)" : "hsl(262 80% 65%)"; 
  }
}

export class UserNode extends NodePassBaseNode {
  static type = "nodepass/user";
  static title = "用户源";
  static category = "NodePass/Sources";
  static nodeCategoryText = "USER";

  static constructor_properties = {
      description: { type: "string", label: "描述", default: "用户或流量起点" },
      ...NodePassBaseNode.constructor_properties,
  };

  constructor(title?: string) {
    super(title || UserNode.title);
    this.addOutput("连接到客户端", ClientNode.type, { color_on: "#AAF", color_off: "#44A", shape: LiteGraph.ARROW_SHAPE });
    this.properties = { ...this.properties, type: 'user' };
    this.size = [160, 60];
  }
  updateThemeColors(theme: string) {
    super.updateThemeColors(theme);
    this.currentBorderColor = theme === 'dark' ? "hsl(120 55% 65%)" : "hsl(120 60% 55%)"; 
  }
}


export const NODE_TYPES = [
  { type: ControllerNode.type, title: ControllerNode.title, nodeClass: ControllerNode, icon: Settings2, iconColorClass: "text-yellow-500" },
  { type: ServerNode.type, title: ServerNode.title, nodeClass: ServerNode, icon: ServerIcon, iconColorClass: "text-primary" },
  { type: ClientNode.type, title: ClientNode.title, nodeClass: ClientNode, icon: SmartphoneIcon, iconColorClass: "text-accent" },
  { type: LandingNode.type, title: LandingNode.title, nodeClass: LandingNode, icon: Globe, iconColorClass: "text-purple-500" },
  { type: UserNode.type, title: UserNode.title, nodeClass: UserNode, icon: UserCircle2, iconColorClass: "text-green-500" },
];

NodePassBaseNode.constructor_properties = {
    type: { type: "string", label: "节点类型", default: "unknown", description: "节点内部类型 (只读)。" },
    statusInfo: {type: "string", label: "状态信息", default: "", description: "用于显示提交状态等 (内部使用)。"}
};
