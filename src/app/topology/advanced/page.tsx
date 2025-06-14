
'use client';

import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';

import { AppLayout } from '@/components/layout/AppLayout';
import { AdvancedTopologyEditor } from '../AdvancedTopologyEditor'; // Import the new advanced editor

export default function AdvancedTopologyPage() {
  return (
    <AppLayout>
      <ReactFlowProvider>
        <AdvancedTopologyEditor />
      </ReactFlowProvider>
    </AppLayout>
  );
}
