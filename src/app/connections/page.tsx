
"use client";

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ConnectionsManager } from '@/components/nodepass/ConnectionsManager'; // Re-using ConnectionsManager
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function ConnectionsPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader />
        <ConnectionsManager />
      </div>
    </AppLayout>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold font-title">主控连接管理</h1>
      <p className="text-muted-foreground font-sans">
        添加、编辑或删除您的 NodePass 主控连接配置。
      </p>
    </div>
  );
}
