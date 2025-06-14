
'use client';

import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';

import { AppLayout } from '@/components/layout/AppLayout';
import { TopologyEditor } from './TopologyEditor'; // Import the main editor component

export default function TopologyPage() {
  return (
    <AppLayout>
      <ReactFlowProvider>
        <TopologyEditor />
      </ReactFlowProvider>
    </AppLayout>
  );
}
