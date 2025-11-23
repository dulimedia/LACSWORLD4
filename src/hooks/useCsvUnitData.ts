import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { UnitData } from '../types';

// Singleton cache for CSV data to prevent duplicate fetches
class CsvDataCache {
  private static instance: CsvDataCache;
  private cache = new Map<string, { data: Record<string, UnitData>; timestamp: number }>();
  private ongoing = new Map<string, Promise<Record<string, UnitData>>>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  static getInstance(): CsvDataCache {
    if (!CsvDataCache.instance) {
      CsvDataCache.instance = new CsvDataCache();
    }
    return CsvDataCache.instance;
  }

  async fetchData(url: string): Promise<Record<string, UnitData>> {
    // Check if we already have a fresh cache entry
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    // Check if we're already fetching this URL
    if (this.ongoing.has(url)) {
      return this.ongoing.get(url)!;
    }

    // Start new fetch
    const fetchPromise = this.performFetch(url);
    this.ongoing.set(url, fetchPromise);

    try {
      const data = await fetchPromise;
      this.cache.set(url, { data, timestamp: Date.now() });
      return data;
    } finally {
      this.ongoing.delete(url);
    }
  }

  private async performFetch(url: string): Promise<Record<string, UnitData>> {
    const isGoogleSheets = url.includes('docs.google.com');
    let finalUrl = url;
    
    if (!isGoogleSheets) {
      const separator = url.includes('?') ? '&' : '?';
      const cacheBuster = `${separator}v=${Math.random()}&t=${Date.now()}`;
      finalUrl = url + cacheBuster;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      const response = await fetch(finalUrl, { 
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
      const csvText = await response.text();
      
      return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const unitData: Record<string, UnitData> = {};
          
          if (Array.isArray(results.data)) {
            results.data.forEach((row: any) => {
              // Updated for new CSV format: "Unit Name" instead of "Product"
              const unitName = (row['Unit Name'] || row.Product)?.trim();
              const unitNameLower = unitName?.toLowerCase();
              
              if (unitName) {
                const floorplanUrl = row['Floorplan'] || row['Column 1'];
                // Updated to handle new format: "Availability" as 0/1
                const isAvailable = row.Availability === '1' || row.Availability === 1 || 
                                  row.Available === '1' || row.Available === 1 || 
                                  (typeof row.Available === 'string' && row.Available.toLowerCase() === 'available');
                
                const unitDataEntry = {
                  name: unitName,
                  availability: isAvailable,
                  size: row['Square Feet'] || row.Size_RSF || row.Size,
                  floorPlanUrl: floorplanUrl,
                  floorplan_url: floorplanUrl,
                  unit_name: unitName,
                  unit_key: unitNameLower,
                  building: row.Building,
                  floor: row.Floor || '',
                  area_sqft: (() => {
                    // Handle new "Square Feet" column with "sf" suffix
                    const rawSize = row['Square Feet'] || row.Size_RSF || row.Size || '';
                    // Handle "850sf" or "850 sf" format by extracting just the number
                    const cleanSize = rawSize.replace(/[,\s]/g, '').replace(/RSF/gi, '').replace(/sf/gi, '').replace(/[A-Za-z]/g, '');
                    const parsed = parseInt(cleanSize);
                    return parsed > 0 ? parsed : undefined;
                  })(),
                  status: isAvailable,
                  unit_type: row.Type || row.Unit_Type || 'Commercial',
                  kitchen_size: row.Kitchen || row.Kitchen_Size || 'None',
                  height: row.Height || '',
                  amenities: row.Amenities || 'Central Air',
                  private_offices: (() => {
                    const officeCount = row['Private Offices'] ?? row['Private Office'] ?? row['Office Count'];
                    if (officeCount === undefined || officeCount === null || officeCount === '') {
                      return undefined;
                    }
                    const parsed = parseInt(String(officeCount).replace(/[^\d-]/g, ''), 10);
                    return !isNaN(parsed) && parsed >= 0 ? parsed : undefined;
                  })()
                };
                
                // Store with multiple key formats for flexible matching
                unitData[unitNameLower] = unitDataEntry;
                unitData[unitName] = unitDataEntry;
                unitData[`${unitNameLower}.glb`] = unitDataEntry;
                unitData[`${unitName}.glb`] = unitDataEntry;
                
                const unitNameNoSpace = unitName.replace(/\s+/g, '');
                unitData[unitNameNoSpace.toLowerCase()] = unitDataEntry;
                unitData[`${unitNameNoSpace.toLowerCase()}.glb`] = unitDataEntry;
              }
            });
          }
          
          console.log(`✅ CSV: Loaded ${Object.keys(unitData).length} unit records`);
          resolve(unitData);
        },
        error: (err: any) => {
          console.error('CSV Parse Error:', err);
          reject(new Error(err.message));
        },
      });
    });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('CSV fetch timeout after 15 seconds');
      }
      throw error;
    }
  }
}

// Debounce function to prevent rapid refetching
function debounce(func: (...args: any[]) => void, delay: number) {
  let timeoutId: NodeJS.Timeout;
  return function(this: any, ...args: any[]) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

export function useCsvUnitData(url: string = '/unit-data.csv') {
  const [data, setData] = useState<Record<string, UnitData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const cache = CsvDataCache.getInstance();
      const unitData = await cache.fetchData(url);
      setData(unitData);
    } catch (e: any) {
      console.error('🔍 [CSV Debug] Fetch error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debouncedFetch = debounce(fetchData, 300); // Reduced debounce time
    debouncedFetch();
  }, [url]);

  return { data, loading, error };
}
