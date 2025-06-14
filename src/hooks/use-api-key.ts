"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

const API_CONFIGS_LIST_STORAGE_KEY = 'nodepass_api_configs_list';
const ACTIVE_API_CONFIG_ID_STORAGE_KEY = 'nodepass_active_api_config_id';

export type MasterLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'event' | 'master';
export type MasterTlsMode = '0' | '1' | '2' | 'master';

// 1. 从 ApiConfig 接口中彻底移除 prefixPath
export interface ApiConfig {
  apiUrl: string; // apiUrl 现在是用户提供的完整 API 根路径
  token: string;
}

export interface NamedApiConfig extends ApiConfig {
  id: string;
  name: string;
  masterDefaultLogLevel?: MasterLogLevel;
  masterDefaultTlsMode?: MasterTlsMode;
}

export function useApiConfig() {
  const [apiConfigsList, setApiConfigsList] = useState<NamedApiConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 3. 辅助函数，用于清理配置对象中的旧字段
  const getCleanConfig = (config: NamedApiConfig | null): NamedApiConfig | null => {
    if (!config) return null;
    const { ignoreSslErrors, prefixPath, ...restConfig } = config as any; // 显式移除旧字段
    return {
      ...restConfig,
      masterDefaultLogLevel: config.masterDefaultLogLevel || 'master',
      masterDefaultTlsMode: config.masterDefaultTlsMode || 'master',
    };
  };

  useEffect(() => {
    try {
      const storedConfigsList = localStorage.getItem(API_CONFIGS_LIST_STORAGE_KEY);
      if (storedConfigsList) {
        const parsedConfigs = JSON.parse(storedConfigsList) as NamedApiConfig[];
        // 数据迁移：确保从旧存储中加载的配置是干净的
        const migratedConfigs = parsedConfigs.map(config => getCleanConfig(config)).filter(Boolean) as NamedApiConfig[];
        setApiConfigsList(migratedConfigs);
      }
      const storedActiveConfigId = localStorage.getItem(ACTIVE_API_CONFIG_ID_STORAGE_KEY);
      if (storedActiveConfigId) {
        setActiveConfigId(storedActiveConfigId);
      }
    } catch (error) {
      console.warn("无法从 localStorage 加载主控配置列表:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveApiConfigsList = useCallback((configs: NamedApiConfig[]) => {
    try {
      // 确保保存到 localStorage 的数据也是干净的
      const cleanConfigs = configs.map(config => getCleanConfig(config)).filter(Boolean) as NamedApiConfig[];
      localStorage.setItem(API_CONFIGS_LIST_STORAGE_KEY, JSON.stringify(cleanConfigs));
      setApiConfigsList(cleanConfigs);
    } catch (error) {
      console.error("无法将主控配置列表保存到 localStorage:", error);
    }
  }, []);

  const saveActiveConfigId = useCallback((id: string | null) => {
    try {
      if (id) {
        localStorage.setItem(ACTIVE_API_CONFIG_ID_STORAGE_KEY, id);
      } else {
        localStorage.removeItem(ACTIVE_API_CONFIG_ID_STORAGE_KEY);
      }
      setActiveConfigId(id);
    } catch (error) {
      console.error("无法将活动主控 ID 保存到 localStorage:", error);
    }
  }, []);

  const addOrUpdateApiConfig = useCallback((config: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const newId = config.id || uuidv4();
    // 确保传入的配置对象被清理
    const cleanConfig = getCleanConfig({ ...config, id: newId } as NamedApiConfig);
    if (!cleanConfig) return config as NamedApiConfig; // 安全检查，理论上不会发生

    setApiConfigsList(prevList => {
      const existingIndex = prevList.findIndex(c => c.id === newId);
      let newList;
      if (existingIndex > -1) {
        newList = [...prevList];
        newList[existingIndex] = cleanConfig;
      } else {
        newList = [...prevList, cleanConfig];
      }
      saveApiConfigsList(newList);
      return newList;
    });
    return cleanConfig;
  }, [saveApiConfigsList]);

  const deleteApiConfig = useCallback((id: string) => {
    setApiConfigsList(prevList => {
      const newList = prevList.filter(c => c.id !== id);
      saveApiConfigsList(newList);
      if (activeConfigId === id) {
        saveActiveConfigId(newList.length > 0 ? newList[0].id : null);
      }
      return newList;
    });
  }, [activeConfigId, saveApiConfigsList, saveActiveConfigId]);

  const clearActiveApiConfig = useCallback(() => {
    saveActiveConfigId(null);
  }, [saveActiveConfigId]);

  const activeApiConfig = useMemo(() => {
    if (!activeConfigId) return null;
    const config = apiConfigsList.find(c => c.id === activeConfigId) || null;
    return getCleanConfig(config);
  }, [apiConfigsList, activeConfigId]);

  const getApiConfigById = useCallback((id: string): NamedApiConfig | null => {
    const config = apiConfigsList.find(c => c.id === id) || null;
    return getCleanConfig(config);
  }, [apiConfigsList]);

  // 2. 简化 getApiRootUrl，直接返回用户提供的 apiUrl
  const getApiRootUrl = useCallback((id: string): string | null => {
    const config = getApiConfigById(id);
    if (!config?.apiUrl) return null;
    
    // 直接返回 apiUrl，并移除末尾的斜杠以保持统一
    return config.apiUrl.replace(/\/+$/, '');
  }, [getApiConfigById]);

  const getToken = useCallback((id: string): string | null => {
    const config = getApiConfigById(id);
    return config?.token || null;
  }, [getApiConfigById]);

  return { 
    apiConfigsList,
    activeApiConfig,
    isLoading, 
    addOrUpdateApiConfig,
    deleteApiConfig,
    setActiveApiConfigId: saveActiveConfigId,
    clearActiveApiConfig,
    getApiRootUrl,
    getToken,
    getApiConfigById,
  };
}