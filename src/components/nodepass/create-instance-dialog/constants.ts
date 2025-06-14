
"use client";

import type { MasterTlsMode } from '@/hooks/use-api-key';

export const MASTER_TLS_MODE_DISPLAY_MAP: Record<MasterTlsMode | '2', string> = {
  'master': '主控配置',
  '0': '0: 无TLS',
  '1': '1: 自签名',
  '2': '2: 自定义',
};
