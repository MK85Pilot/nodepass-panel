
"use client";

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ConnectionsManager } from '@/components/nodepass/ConnectionsManager';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function ConnectionsPage() {
  return (
    <AppLayout>
      <h1 className="text-2xl font-bold font-title mb-8">主控连接管理</h1>
      <ConnectionsManager />
    </AppLayout>
  );
}

    