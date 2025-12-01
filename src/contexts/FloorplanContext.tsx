import { createContext, useContext } from 'react';

export interface FloorplanContextType {
  openFloorplan: (floorplanUrl: string, unitName: string, unitData?: any) => void;
}

export const FloorplanContext = createContext<FloorplanContextType | null>(null);

export function useFloorplan() {
  const context = useContext(FloorplanContext);
  if (!context) {
    throw new Error('useFloorplan must be used within FloorplanContext.Provider');
  }
  return context;
}
