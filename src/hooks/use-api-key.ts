
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

const API_CONFIGS_LIST_STORAGE_KEY = 'nodepass_api_configs_list';
const ACTIVE_API_CONFIG_ID_STORAGE_KEY = 'nodepass_active_api_config_id';

export type MasterLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'event' | 'master';
export type MasterTlsMode = '0' | '1' | '2' | 'master';

export interface ApiConfig {
  apiUrl: string;
  token: string;
  prefixPath: string | null;
}

export interface NamedApiConfig extends ApiConfig {
  id: string;
  name: string;
  masterDefaultLogLevel?: MasterLogLevel;
  masterDefaultTlsMode?: MasterTlsMode;
  // ignoreSslErrors removed
}

export function useApiConfig() {
  const [apiConfigsList, setApiConfigsList] = useState<NamedApiConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedConfigsList = localStorage.getItem(API_CONFIGS_LIST_STORAGE_KEY);
      if (storedConfigsList) {
        const parsedConfigs = JSON.parse(storedConfigsList) as NamedApiConfig[];
        // Ensure new optional fields have default values if missing from old storage
        const migratedConfigs = parsedConfigs.map(config => {
          const { ignoreSslErrors, ...restConfig } = config as any; // explicitly remove ignoreSslErrors
          return {
            ...restConfig,
            masterDefaultLogLevel: config.masterDefaultLogLevel || 'master',
            masterDefaultTlsMode: config.masterDefaultTlsMode || 'master',
          };
        });
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
      localStorage.setItem(API_CONFIGS_LIST_STORAGE_KEY, JSON.stringify(configs));
      setApiConfigsList(configs);
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
    const { ignoreSslErrors, ...restConfig } = config as any; // remove ignoreSslErrors if present
    const newConfigWithIdAndDefaults: NamedApiConfig = {
      ...restConfig,
      id: newId,
      masterDefaultLogLevel: config.masterDefaultLogLevel || 'master',
      masterDefaultTlsMode: config.masterDefaultTlsMode || 'master',
    };
    
    setApiConfigsList(prevList => {
      const existingIndex = prevList.findIndex(c => c.id === newId);
      let newList;
      if (existingIndex > -1) {
        newList = [...prevList];
        newList[existingIndex] = newConfigWithIdAndDefaults;
      } else {
        newList = [...prevList, newConfigWithIdAndDefaults];
      }
      saveApiConfigsList(newList);
      return newList;
    });
    return newConfigWithIdAndDefaults;
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
    if (config) {
      const { ignoreSslErrors, ...restConfig } = config as any;
      return {
        ...restConfig,
        masterDefaultLogLevel: config.masterDefaultLogLevel || 'master',
        masterDefaultTlsMode: config.masterDefaultTlsMode || 'master',
      };
    }
    return null;
  }, [apiConfigsList, activeConfigId]);

  const getApiConfigById = useCallback((id: string): NamedApiConfig | null => {
    const config = apiConfigsList.find(c => c.id === id) || null;
    if (config) {
      const { ignoreSslErrors, ...restConfig } = config as any;
      return {
        ...restConfig,
        masterDefaultLogLevel: config.masterDefaultLogLevel || 'master',
        masterDefaultTlsMode: config.masterDefaultTlsMode || 'master',
      };
    }
    return null;
  }, [apiConfigsList]);

  const getApiRootUrl = useCallback((id: string): string | null => {
    const config = getApiConfigById(id);
    if (!config?.apiUrl) return null;
    const { apiUrl, prefixPath } = config;
    let base = apiUrl.replace(/\/+$/, ''); 
    if (prefixPath && prefixPath.trim() !== '') {
      base += `/${prefixPath.replace(/^\/+|\/+$/g, '').trim()}`; 
    } else {
      base += '/api'; // Default to /api if prefixPath is empty or null
    }
    return base;
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
