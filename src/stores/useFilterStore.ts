import { create } from 'zustand';

export type FilterLevel = 'building' | 'floor' | 'unit';

export interface FilterSelection {
  level: FilterLevel;
  building?: string;
  floor?: string;
  unit?: string;
  path?: string; // Full path like "First Street Building/First Floor/F-115.glb"
  customUnits?: string[]; // Custom list of unit names for property-based filtering
}

interface FilterState {
  activeFilter: FilterSelection | null;
  activeUnits: Set<string>; // Set of unit IDs that should be active/pulsating
  
  // Actions
  setFilter: (filter: FilterSelection | null) => void;
  getActiveUnits: () => string[];
  isUnitActive: (unitId: string) => boolean;
  clearFilter: () => void;
}

// Helper function to normalize unit names like FilterDropdown
const filenameToUnitName = (filename: string): string => {
  let base = filename.replace(/\.glb$/i, '').trim();
  base = base.replace(/\s*-\s*/g, '-');
  base = base.replace(/\s+/g, '-');
  base = base.replace(/[^a-zA-Z0-9\-]/g, '');
  return base.toLowerCase();
};

// Helper function to get all units for a given selection
const getUnitsForSelection = (selection: FilterSelection, boxesIndex: any): Set<string> => {
  const units = new Set<string>();
  
  if (!boxesIndex || !boxesIndex.children) return units;
  
  const walkTree = (node: any, currentPath: string[] = []) => {
    if (typeof node === 'string') {
      // This is a GLB file
      const unitId = filenameToUnitName(node);
      
      // Check if this unit matches our selection criteria
      const nodePath = [...currentPath];
      const building = nodePath[0];
      const floor = nodePath[1];
      
      const matches = (
        selection.level === 'building' && building === selection.building
      ) || (
        selection.level === 'floor' && building === selection.building && floor === selection.floor
      ) || (
        selection.level === 'unit' && selection.unit === unitId
      );
      
      if (matches) {
        units.add(unitId);
      }
    } else if (node.children) {
      // This is a folder node
      const newPath = [...currentPath, node.name];
      node.children.forEach((child: any) => walkTree(child, newPath));
    }
  };
  
  boxesIndex.children.forEach((child: any) => walkTree(child));
  return units;
};

export const useFilterStore = create<FilterState>((set, get) => ({
  activeFilter: null,
  activeUnits: new Set(),
  
  setFilter: (filter: FilterSelection | null) => {
    if (!filter) {
      set({ activeFilter: null, activeUnits: new Set() });
      return;
    }
    
    // If custom units are provided, use them directly
    if (filter.customUnits) {
      const activeUnits = new Set(filter.customUnits);
      set({ activeFilter: filter, activeUnits });
      console.log(`📦 CUSTOM FILTER SET: ${Array.from(activeUnits).join(', ')}`);
      return;
    }
    
    // Load boxes index to determine which units should be active
    fetch(import.meta.env.BASE_URL + 'models/boxes_index.json')
      .then(res => res.json())
      .then((boxesIndex) => {
        const activeUnits = getUnitsForSelection(filter, boxesIndex);
        set({ activeFilter: filter, activeUnits });
        
        console.log(`📦 FILTER SET: ${Array.from(activeUnits).join(', ')}`);
      })
      .catch(err => {
        console.error('❌ boxes_index.json failed:', err);
        set({ activeFilter: filter, activeUnits: new Set() });
      });
  },
  
  getActiveUnits: () => {
    return Array.from(get().activeUnits);
  },
  
  isUnitActive: (unitId: string) => {
    return get().activeUnits.has(unitId);
  },
  
  clearFilter: () => {
    set({ activeFilter: null, activeUnits: new Set() });
  }
}));