
"use client";

import React from 'react';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle as ShadDialogTitleFromDialog, DialogDescription as ShadDialogDescriptionFromDialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, UploadCloud } from 'lucide-react';
import type { PendingOperations } from '../../lib/topology-types';

interface SubmitTopologyDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  pendingOperations: PendingOperations;
  isSubmitting: boolean;
  onConfirmSubmit: () => void;
}

export const SubmitTopologyDialog: React.FC<SubmitTopologyDialogProps> = ({
  isOpen,
  onOpenChange,
  pendingOperations,
  isSubmitting,
  onConfirmSubmit,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <ShadDialogTitleFromDialog className="font-title flex items-center">
            <UploadCloud className="mr-2 h-5 w-5 text-primary" />确认提交拓扑
          </ShadDialogTitleFromDialog>
          <ShadDialogDescriptionFromDialog className="font-sans">
            将根据以下分组在相应的主控上创建实例。请确认操作。
          </ShadDialogDescriptionFromDialog>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          {Object.keys(pendingOperations).length === 0 ? (
            <p className="text-muted-foreground text-sm font-sans py-4 text-center">无可创建的操作。</p>
          ) : (
            <Accordion type="multiple" defaultValue={Object.keys(pendingOperations)} className="w-full">
              {Object.entries(pendingOperations).map(([apiId, opGroup]) => (
                <AccordionItem value={apiId} key={apiId}>
                  <AccordionTrigger className="font-sans text-base hover:no-underline">
                    主控: {opGroup.apiConfig.name} ({opGroup.urlsToCreate.length} 个实例)
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="list-disc pl-5 space-y-1 text-xs font-mono">
                      {opGroup.urlsToCreate.map(op => (
                        <li key={op.originalNodeId} className="break-all" title={`源画布节点ID: ${op.originalNodeId}`}>
                          {op.url}
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </ScrollArea>
        <DialogFooter className="font-sans pt-4">
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>取消</Button>
          </DialogClose>
          <Button
            onClick={onConfirmSubmit}
            disabled={isSubmitting || Object.keys(pendingOperations).length === 0}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 提交中...</>
            ) : (
              "确认提交"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
