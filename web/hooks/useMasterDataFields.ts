import { useState, useEffect, useCallback } from 'react';

export type MasterDataValue = {
  id: string;
  value_text: string;
  is_default: boolean;
  parent_value_id?: string | null;
};

export type MasterDataEntry = {
  id: string;
  key_name: string;
  tab_type: 'manual' | 'auto';
  parent_id: string | null;
  ai_description: string | null;
  is_auto_extractable: boolean;
  values: MasterDataValue[];
  children: MasterDataEntry[];
};

export function useMasterDataFields(tenantId: string | undefined, tabType: 'manual' | 'auto' = 'manual') {
  const [masterTree, setMasterTree] = useState<MasterDataEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTree = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/master-data?tenantId=${tenantId}&tabType=${tabType}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch master data');
      }
      setMasterTree(json.tree || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, tabType]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Helper to find a specific key in the tree (recursive)
  const findEntryByKey = (
    keyName: string,
    nodes: MasterDataEntry[] = masterTree
  ): MasterDataEntry | null => {
    for (const node of nodes) {
      if (node.key_name.toLowerCase() === keyName.toLowerCase()) return node;
      if (node.children && node.children.length > 0) {
        const childMatch = findEntryByKey(keyName, node.children);
        if (childMatch) return childMatch;
      }
    }
    return null;
  };

  const findAllEntriesByKey = (
    keyName: string,
    nodes: MasterDataEntry[] = masterTree
  ): MasterDataEntry[] => {
    let results: MasterDataEntry[] = [];
    for (const node of nodes) {
      if (node.key_name.toLowerCase() === keyName.toLowerCase()) {
        results.push(node);
      }
      if (node.children && node.children.length > 0) {
        results = results.concat(findAllEntriesByKey(keyName, node.children));
      }
    }
    return results;
  };

  const findEntryById = (
    id: string,
    nodes: MasterDataEntry[] = masterTree
  ): MasterDataEntry | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children && node.children.length > 0) {
        const childMatch = findEntryById(id, node.children);
        if (childMatch) return childMatch;
      }
    }
    return null;
  };

  return {
    masterTree,
    isLoading,
    error,
    refreshTree: fetchTree,
    findEntryByKey,
    findAllEntriesByKey,
    findEntryById
  };
}
