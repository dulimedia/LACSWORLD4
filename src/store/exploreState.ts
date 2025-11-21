import { create } from 'zustand';
import { emitEvent, getTimestamp, type ScopeType } from '../lib/events';

// Excluded/unavailable suites that should be filtered out from all listings
const EXCLUDED_SUITES = new Set([
  // Exact matches from the requirement
  'F-10', 'F110CR', 'ET-Lab', 'MG-Stage 7', 'M-40', 'M-45', 'M-50', 
  'Studio O.M', 'T-110', 'T100', 'T-600', 'T-800', 'T900', 'T-950', 'T-1000',
  
  // Variations with different spacing/formatting to catch all possible formats
  'F 10', 'F10', 'f-10', 'f 10', 'f10',
  'F110 CR', 'F-110CR', 'F-110 CR', 'F 110 CR', 'f110cr', 'f-110cr', 'f-110 cr', 'f 110 cr',
  'ET Lab', 'ET-Lab', 'et lab', 'et-lab', 'et_lab',
  'MG Stage 7', 'MG-Stage7', 'MG Stage7', 'mg-stage 7', 'mg stage 7', 'mg-stage7', 'mg stage7',
  'M 40', 'M40', 'm-40', 'm 40', 'm40',
  'M 45', 'M45', 'm-45', 'm 45', 'm45', 
  'M 50', 'M50', 'm-50', 'm 50', 'm50',
  'Studio O M', 'Studio O.M.', 'Studio OM', 'studio o.m', 'studio o m', 'studio om', 'studio o.m.',
  'T 110', 'T110', 't-110', 't 110', 't110',
  'T 100', 't100', 't-100', 't 100',
  'T 600', 'T600', 't-600', 't 600', 't600',
  'T 800', 'T800', 't-800', 't 800', 't800', 
  'T 900', 't900', 't-900', 't 900',
  'T 950', 'T950', 't-950', 't 950', 't950',
  'T 1000', 't-1000', 't 1000', 't1000'
]);

// Function to check if a unit name should be excluded
export function isUnitExcluded(unitName: string): boolean {
  if (!unitName) return false;
  
  // Normalize the unit name for comparison
  const normalizedName = unitName.trim().toLowerCase()
    .replace(/[\s\-_.]+/g, ' ')  // Replace separators with single space
    .replace(/\s+/g, ' ')        // Replace multiple spaces with single space
    .trim();
  
  // Check against all excluded patterns
  for (const excluded of EXCLUDED_SUITES) {
    const normalizedExcluded = excluded.toLowerCase()
      .replace(/[\s\-_.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (normalizedName === normalizedExcluded || 
        normalizedName.includes(normalizedExcluded) || 
        normalizedExcluded.includes(normalizedName)) {
      return true;
    }
  }
  
  return false;
}

export type UnitStatus = boolean; // true = Available, false = Unavailable

export interface UnitRecord {
  unit_key: string;     // e.g. "F_02_280" or "A_01_101"
  building: string;     // e.g. "F"
  floor: string;        // e.g. "02"
  unit_name: string;    // e.g. "Suite 280"
  status: UnitStatus;
  area_sqft?: number;
  price_per_sqft?: number;
  lease_term?: string;
  floorplan_url?: string;
  thumbnail_url?: string;
  node_name?: string;   // optional fallback
  recipients: string[]; // parsed from recipients_csv or default
  notes?: string;
  kitchen_size?: string; // Kitchen size from CSV (Full, Compact, Kitchenette, None)
  unit_type?: string;   // Unit type from CSV (Suite, Event Space, Other, Parking, etc.)
  private_offices?: number;
}

export interface ExploreState {
  // Core state
  showAvailableOnly: boolean;
  hoveredUnitKey: string | null;
  selectedUnitKey: string | null;
  drawerOpen: boolean;
  unitDetailsOpen: boolean;
  show3DPopup: boolean;
  
  // Hierarchical structure: building → floor → unit_keys
  unitsByBuilding: Record<string, Record<string, string[]>>;
  
  // Unit data map for quick lookups
  unitsData: Map<string, UnitRecord>;
  
  // Loading states
  isLoadingUnits: boolean;
  
  // Actions
  setShowAvailableOnly: (show: boolean) => void;
  setHovered: (unitKey: string | null) => void;
  setSelected: (unitKey: string | null) => void;
  setDrawerOpen: (open: boolean) => void;
  setUnitDetailsOpen: (open: boolean) => void;
  setShow3DPopup: (open: boolean) => void;
  setUnitsIndex: (index: ExploreState['unitsByBuilding']) => void;
  setUnitsData: (data: Map<string, UnitRecord>) => void;
  setLoadingUnits: (loading: boolean) => void;
  
  // Derived getters
  getFilteredUnits: () => string[];
  getUnitsByFloor: (building: string, floor: string) => string[];
  getUnitData: (unitKey: string) => UnitRecord | undefined;
  getBuildingList: () => string[];
  getFloorList: (building: string) => string[];
}

export const useExploreState = create<ExploreState>((set, get) => ({
  // Initial state
  showAvailableOnly: true,
  hoveredUnitKey: null,
  selectedUnitKey: null,
  drawerOpen: true,
  unitDetailsOpen: false,
  show3DPopup: false,
  unitsByBuilding: {},
  unitsData: new Map(),
  isLoadingUnits: false,

  // Actions
  setShowAvailableOnly: (show: boolean) => {
    set({ showAvailableOnly: show });
    // Emit availability filter event
    emitEvent('evt.availability.toggled', {
      ts: getTimestamp(),
      on: show
    });
  },

  setHovered: (unitKey: string | null) => {
    const currentHovered = get().hoveredUnitKey;
    if (currentHovered !== unitKey) {
      set({ hoveredUnitKey: unitKey });
      
      if (unitKey) {
        // Emit highlight changed event
        emitEvent('evt.highlight.changed', {
          ts: getTimestamp(),
          scope: 'unit' as ScopeType,
          ids: [unitKey]
        });
      }
    }
  },

  setSelected: (unitKey: string | null) => {
    const currentSelected = get().selectedUnitKey;
    if (currentSelected !== unitKey) {
      set({ selectedUnitKey: unitKey });
      
      // Emit selection changed event
      const selected = unitKey ? [unitKey] : [];
      emitEvent('evt.selection.changed', {
        ts: getTimestamp(),
        selected
      });
      
      if (unitKey) {
        // Emit scope framed event for camera to focus on the unit
        emitEvent('evt.scope.framed', {
          ts: getTimestamp(),
          scope: 'unit' as ScopeType,
          id: unitKey
        });
      }
    }
  },

  setDrawerOpen: (open: boolean) => {
    const wasOpen = get().drawerOpen;
    if (wasOpen !== open) {
      set({ drawerOpen: open });
      
      // Emit drawer events
      if (open) {
        emitEvent('evt.ui.drawer.opened', {
          ts: getTimestamp(),
          source: 'button'
        });
      } else {
        emitEvent('evt.ui.drawer.closed', {
          ts: getTimestamp()
        });
      }
    }
  },

  setUnitDetailsOpen: (open: boolean) => {
    set({ unitDetailsOpen: open });
  },

  setShow3DPopup: (open: boolean) => {
    set({ show3DPopup: open });
  },

  setUnitsIndex: (index: ExploreState['unitsByBuilding']) => {
    set({ unitsByBuilding: index });
  },

  setUnitsData: (data: Map<string, UnitRecord>) => {
    set({ unitsData: data });
    
    // Emit inventory updated event
    emitEvent('evt.inventory.updated', {
      ts: getTimestamp(),
      updatedAt: getTimestamp(),
      rows: data.size
    });
  },

  setLoadingUnits: (loading: boolean) => {
    set({ isLoadingUnits: loading });
  },

  // Derived getters
  getFilteredUnits: () => {
    const { showAvailableOnly, unitsData, unitsByBuilding } = get();
    const allUnitKeys: string[] = [];
    
    // Flatten all unit keys from the building structure
    Object.values(unitsByBuilding).forEach(floors => {
      Object.values(floors).forEach(unitKeys => {
        allUnitKeys.push(...unitKeys);
      });
    });

    if (!showAvailableOnly) {
      return allUnitKeys;
    }

    // Filter by availability
    return allUnitKeys.filter(unitKey => {
      const unit = unitsData.get(unitKey);
      return unit?.status === true;
    });
  },

  getUnitsByFloor: (building: string, floor: string) => {
    const { unitsByBuilding } = get();
    return unitsByBuilding[building]?.[floor] || [];
  },

  getUnitData: (unitKey: string) => {
    return get().unitsData.get(unitKey);
  },

  getBuildingList: () => {
    const buildings = Object.keys(get().unitsByBuilding).sort();
    return buildings;
  },

  getFloorList: (building: string) => {
    const { unitsByBuilding } = get();
    const floors = Object.keys(unitsByBuilding[building] || {});
    
    // FORCE CORRECT ORDER: Ground → First → Second → Third
    const floorOrder = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'];
    
    const sortedFloors = floors.sort((a, b) => {
      // First try exact match
      let aIndex = floorOrder.indexOf(a);
      let bIndex = floorOrder.indexOf(b);
      
      // If no exact match, try partial matching
      if (aIndex === -1) {
        aIndex = floorOrder.findIndex(orderFloor => 
          a.toLowerCase().includes(orderFloor.toLowerCase()) || 
          orderFloor.toLowerCase().includes(a.toLowerCase())
        );
      }
      if (bIndex === -1) {
        bIndex = floorOrder.findIndex(orderFloor => 
          b.toLowerCase().includes(orderFloor.toLowerCase()) || 
          orderFloor.toLowerCase().includes(b.toLowerCase())
        );
      }
      
      // If not found in our order list, put at end (high index)
      if (aIndex === -1) aIndex = 999;
      if (bIndex === -1) bIndex = 999;
      
      // Sort by index in our desired order
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      
      // If same index, sort alphabetically
      return a.localeCompare(b);
    });
    return sortedFloors;
  }
}));

// Helper function to build the hierarchical structure from unit data
export const buildUnitsIndex = (units: Map<string, UnitRecord>): Record<string, Record<string, string[]>> => {
  const index: Record<string, Record<string, string[]>> = {};
  const seenUnits = new Set<string>();
  
  units.forEach((unit, unitKey) => {
    if (seenUnits.has(unit.unit_key)) return;
    seenUnits.add(unit.unit_key);
    
    // Skip excluded/unavailable suites
    if (isUnitExcluded(unit.unit_name)) {
      return;
    }
    
    const { building, floor } = unit;
    
    if (!index[building]) {
      index[building] = {};
    }
    
    if (!index[building][floor]) {
      index[building][floor] = [];
    }
    
    index[building][floor].push(unitKey);
  });
  
  // Sort units within each floor - numeric sorting for proper order
  Object.keys(index).forEach(building => {
    Object.keys(index[building]).forEach(floor => {
      index[building][floor].sort((a, b) => {
        // Extract unit names from keys for comparison
        const getUnitName = (key: string) => {
          // Handle various key formats - get the actual unit name
          if (key.includes('/')) {
            return key.split('/').pop() || key;
          }
          return key;
        };
        
        const unitA = getUnitName(a);
        const unitB = getUnitName(b);
        
        // Special handling for Tower Building units (T-100, T-110, T-200, etc.)
        if (building === 'Tower Building') {
          const getTowerNumber = (unitName: string) => {
            const match = unitName.match(/^T-?(\d+)$/i);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          const numberA = getTowerNumber(unitA);
          const numberB = getTowerNumber(unitB);
          
          // Sort numerically: 100, 110, 200, 210, 220, 230, etc.
          return numberA - numberB;
        }
        
        // Extract numbers from unit names for numeric sorting (other buildings)
        const extractNumber = (unitName: string) => {
          const match = unitName.match(/([A-Za-z]+)-?(\d+)/);
          return match ? parseInt(match[2], 10) : 0;
        };
        
        const extractPrefix = (unitName: string) => {
          const match = unitName.match(/([A-Za-z]+)-?(\d+)/);
          return match ? match[1].toLowerCase() : unitName.toLowerCase();
        };
        
        const prefixA = extractPrefix(unitA);
        const prefixB = extractPrefix(unitB);
        const numberA = extractNumber(unitA);
        const numberB = extractNumber(unitB);
        
        // First sort by prefix (F, M, etc.)
        if (prefixA !== prefixB) {
          return prefixA.localeCompare(prefixB);
        }
        
        // Then sort by number (100, 110, 200, 210, not 100, 1000, 110)
        if (numberA !== numberB) {
          return numberA - numberB;
        }
        
        // Fall back to string comparison for edge cases
        return unitA.localeCompare(unitB);
      });
    });
  });
  
  return index;
};
