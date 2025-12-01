import React, { useState, useMemo, useEffect } from 'react';
import { useExploreState } from '../../store/exploreState';
import { ChevronDown, ChevronRight, Building } from 'lucide-react';

export function RequestTab() {
  const { unitsData, unitsByBuilding } = useExploreState();
  const [selectedSuites, setSelectedSuites] = useState<Set<string>>(new Set());
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  });

  const buildings = useMemo(() => {
    const all = Object.keys(unitsByBuilding);
    const allowed = ['Fifth Street Building', 'Maryland Building', 'Tower Building'];
    return all.filter(b => allowed.includes(b));
  }, [unitsByBuilding]);

  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (buildings.length === 0 || initialized) return;
    
    setInitialized(true);
    
    setExpandedBuildings(new Set(buildings));
    const allFloors = new Set<string>();
    buildings.forEach(building => {
      const floors = unitsByBuilding[building];
      if (floors) {
        Object.keys(floors).forEach(floor => {
          allFloors.add(`${building}/${floor}`);
        });
      }
    });
    setExpandedFloors(allFloors);
  }, [buildings, unitsByBuilding, initialized]);

  const toggleBuilding = (building: string) => {
    const newExpanded = new Set(expandedBuildings);
    if (newExpanded.has(building)) {
      newExpanded.delete(building);
    } else {
      newExpanded.add(building);
    }
    setExpandedBuildings(newExpanded);
  };

  const toggleFloor = (floorKey: string) => {
    const newExpanded = new Set(expandedFloors);
    if (newExpanded.has(floorKey)) {
      newExpanded.delete(floorKey);
    } else {
      newExpanded.add(floorKey);
    }
    setExpandedFloors(newExpanded);
  };

  const toggleAllInFloor = (building: string, floor: string, unitKeys: string[]) => {
    const uniqueKeys = Array.from(new Set(unitKeys));
    const allSelected = uniqueKeys.every(key => selectedSuites.has(key));
    const newSelected = new Set(selectedSuites);
    
    if (allSelected) {
      uniqueKeys.forEach(key => newSelected.delete(key));
    } else {
      uniqueKeys.forEach(key => newSelected.add(key));
    }
    setSelectedSuites(newSelected);
  };

  const toggleSuite = (unitKey: string) => {
    const newSelected = new Set(selectedSuites);
    if (newSelected.has(unitKey)) {
      newSelected.delete(unitKey);
    } else {
      newSelected.add(unitKey);
    }
    setSelectedSuites(newSelected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const selectedUnits = Array.from(selectedSuites).map(key => {
      const unit = unitsData.get(key);
      return unit?.unit_name || key;
    });

    const recipients = Array.from(selectedSuites).flatMap(key => {
      const unit = unitsData.get(key);
      return unit?.recipients || [];
    });

    const uniqueRecipients = Array.from(new Set(recipients));

    const emailBody = `
New Suite Request from LACSWORLD

Contact Information:
Name: ${formData.name}
Email: ${formData.email}
Phone: ${formData.phone}

Selected Suites:
${selectedUnits.join('\n')}

Message:
${formData.message}
    `.trim();

    const mailto = `mailto:${uniqueRecipients.join(',')}?subject=Suite Request from ${formData.name}&body=${encodeURIComponent(emailBody)}`;
    
    window.location.href = mailto;

    setFormData({ name: '', email: '', phone: '', message: '' });
    setSelectedSuites(new Set());
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-2">
        <input
          name="name"
          required
          placeholder="Your Name *"
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
        />
        <input
          name="email"
          required
          type="email"
          placeholder="Your Email *"
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10"
          value={formData.email}
          onChange={(e) => setFormData({...formData, email: e.target.value})}
        />
        <input
          name="phone"
          placeholder="Phone Number"
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10"
          value={formData.phone}
          onChange={(e) => setFormData({...formData, phone: e.target.value})}
        />
      </div>

      <div className="mt-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-black/60 mb-2">
          Select Suites ({selectedSuites.size} suites selected)
        </label>
        <div className="max-h-64 overflow-y-auto border border-black/10 rounded-lg bg-white space-y-1">
          {buildings.map(building => {
            const floors = unitsByBuilding[building] || {};
            const isExpanded = expandedBuildings.has(building);
            
            const allUnitsInBuilding: string[] = [];
            Object.values(floors).forEach(unitKeys => {
              allUnitsInBuilding.push(...unitKeys);
            });
            
            return (
              <div key={building} className="border-b border-black/5 last:border-0">
                <button
                  type="button"
                  onClick={() => toggleBuilding(building)}
                  className="w-full flex items-center justify-between p-2 hover:bg-black/5 transition text-left"
                >
                  <div className="flex items-center space-x-2">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Building size={14} className="text-blue-600" />
                    <span className="text-sm font-medium">{building}</span>
                  </div>
                </button>
                
                {isExpanded && (
                  <div className="px-2 pb-2 space-y-2">
                    {building === 'Tower Building' ? (
                      // Tower Building: render units directly without floor grouping
                      <div className="px-2 py-1 space-y-1">
                        {Array.from(new Set(Object.values(floors).flat())).sort((a, b) => {
                          const getNumber = (key: string) => {
                            const unit = unitsData.get(key);
                            if (!unit) return 0;
                            const match = unit.unit_name.match(/T-?(\d+)/i);
                            return match ? parseInt(match[1], 10) : 0;
                          };
                          return getNumber(a) - getNumber(b);
                        }).map(unitKey => {
                          const unit = unitsData.get(unitKey);
                          if (!unit) return null;
                          
                          return (
                            <label
                              key={unitKey}
                              className="flex items-center space-x-2 px-2 py-1 hover:bg-black/5 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedSuites.has(unitKey)}
                                onChange={() => toggleSuite(unitKey)}
                                className="rounded border-gray-400 w-4 h-4 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer"
                              />
                              <span className="text-xs">{unit.unit_name}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      // Other buildings: show floor grouping
                      Object.entries(floors).map(([floorName, unitKeys]) => {
                        const floorKey = `${building}/${floorName}`;
                        const isFloorExpanded = expandedFloors.has(floorKey);
                        const uniqueUnits = Array.from(new Set(unitKeys));
                        const allFloorSelected = uniqueUnits.length > 0 && uniqueUnits.every(key => selectedSuites.has(key));
                        
                        return (
                          <div key={floorKey} className="border border-black/5 rounded">
                            <div className="flex items-center space-x-2 px-2 py-1 bg-black/[0.02]">
                              <button
                                type="button"
                                onClick={() => toggleFloor(floorKey)}
                                className="flex items-center space-x-1"
                              >
                                {isFloorExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              </button>
                              <div className="flex items-center space-x-2 flex-1">
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    key={`${floorKey}-${selectedSuites.size}-${allFloorSelected}`}
                                    checked={allFloorSelected}
                                    onChange={() => toggleAllInFloor(building, floorName, unitKeys)}
                                    className="rounded border-gray-400 w-4 h-4 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer"
                                  />
                                </label>
                                <span 
                                  className="text-xs font-medium cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFloor(floorKey);
                                  }}
                                >
                                  {floorName}
                                </span>
                                <span className="text-xs text-black/40">({uniqueUnits.length})</span>
                              </div>
                            </div>
                            
                            {isFloorExpanded && (
                              <div className="px-4 py-1 space-y-1">
                                {uniqueUnits.map(unitKey => {
                                  const unit = unitsData.get(unitKey);
                                  if (!unit) return null;
                                  
                                  return (
                                    <label
                                      key={unitKey}
                                      className="flex items-center space-x-2 px-2 py-1 hover:bg-black/5 rounded cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedSuites.has(unitKey)}
                                        onChange={() => toggleSuite(unitKey)}
                                        className="rounded border-gray-400 w-4 h-4 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer"
                                      />
                                      <span className="text-xs">{unit.unit_name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <textarea
        name="message"
        placeholder="Let us know when you need it, for how long, and any questions."
        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10"
        rows={3}
        value={formData.message}
        onChange={(e) => setFormData({...formData, message: e.target.value})}
      />

      <button
        type="submit"
        disabled={selectedSuites.size === 0}
        className="w-full rounded-xl bg-black text-white px-3 py-2 text-sm font-semibold shadow hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Lease Selected Suites
      </button>
    </form>
  );
}
