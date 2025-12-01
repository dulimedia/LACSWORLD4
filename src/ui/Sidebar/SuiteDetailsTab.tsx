import React, { useState, useRef, useEffect } from 'react';
import { useExploreState } from '../../store/exploreState';
import { useFloorplan } from '../../contexts/FloorplanContext';
import { 
  MapPin, 
  Square, 
  FileText,
  Share,
  CheckCircle,
  Maximize2,
  ArrowUp
} from 'lucide-react';
import { isTowerUnit, getTowerUnitIndividualFloorplan, getTowerUnitFloorFloorplan, getFloorplanUrl as getIntelligentFloorplanUrl } from '../../services/floorplanMappingService';
import { getFloorplanUrl as encodeFloorplanUrl } from '../../services/floorplanService';

export function SuiteDetailsTab() {
  const { selectedUnitKey, unitsData } = useExploreState();
  const { openFloorplan } = useFloorplan();
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [showIndividualFloorplan, setShowIndividualFloorplan] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const displayUnit = selectedUnitKey ? unitsData.get(selectedUnitKey) : null;

  const isTower = displayUnit ? isTowerUnit(displayUnit.unit_name || '') : false;
  const individualFloorplan = displayUnit ? getTowerUnitIndividualFloorplan(displayUnit.unit_name || '') : null;
  const hasIndividualFloorplan = isTower && individualFloorplan;
  
  const getFloorplanUrl = () => {
    if (!displayUnit || !displayUnit.unit_name) {
      return null;
    }
    
    if (isTower && showIndividualFloorplan && hasIndividualFloorplan) {
      const individualFloorplan = getTowerUnitIndividualFloorplan(displayUnit.unit_name);
      const rawUrl = individualFloorplan ? `floorplans/converted/${individualFloorplan}` : null;
      return rawUrl ? encodeFloorplanUrl(rawUrl) : null;
    } else {
      const rawUrl = getIntelligentFloorplanUrl(displayUnit.unit_name, displayUnit);
      return rawUrl ? encodeFloorplanUrl(rawUrl) : null;
    }
  };

  const currentFloorplanUrl = getFloorplanUrl();

  const toggleFloorplanView = () => {
    setShowIndividualFloorplan(prev => !prev);
  };

  const handleFloorPlanClick = () => {
    if (currentFloorplanUrl && displayUnit) {
      openFloorplan(currentFloorplanUrl, displayUnit.unit_name, displayUnit);
    }
  };

  const handleShareClick = async () => {
    if (!displayUnit) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?sel=${displayUnit.unit_key}`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareUrlCopied(true);
      setTimeout(() => setShareUrlCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy share URL:', err);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current) {
        setShowScrollTop(scrollContainerRef.current.scrollTop > 200);
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isAvailable = displayUnit?.status === true;

  if (!displayUnit) return null;

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto relative">
      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{displayUnit.unit_name}</h2>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-2 ${
              isAvailable 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {isAvailable ? 'Available' : 'Occupied'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {displayUnit.area_sqft && (
            <div className="flex items-start space-x-2">
              <Square size={16} className="text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs text-gray-500">Area</div>
                <div className="text-sm font-medium">{displayUnit.area_sqft.toLocaleString()} sq ft</div>
              </div>
            </div>
          )}

          {displayUnit.price_per_sqft && (
            <div className="flex items-start space-x-2">
              <FileText size={16} className="text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs text-gray-500">Price/sq ft</div>
                <div className="text-sm font-medium">${displayUnit.price_per_sqft}</div>
              </div>
            </div>
          )}

          {displayUnit.building && (
            <div className="flex items-start space-x-2">
              <MapPin size={16} className="text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs text-gray-500">Building</div>
                <div className="text-sm font-medium">{displayUnit.building}</div>
              </div>
            </div>
          )}

          <div className="flex items-start justify-between space-x-2">
            <div className="flex items-start space-x-2">
              <MapPin size={16} className="text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs text-gray-500">Floor</div>
                <div className="text-sm font-medium">{displayUnit.floor || 'N/A'}</div>
              </div>
            </div>
            <div className="flex items-center text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap">
              {displayUnit.private_offices === undefined || displayUnit.private_offices === null
                ? 'Private Offices: N/A'
                : displayUnit.private_offices === 0
                  ? 'Open Floor Plan'
                  : `${displayUnit.private_offices} ${displayUnit.private_offices === 1 ? 'Office' : 'Offices'}`}
            </div>
          </div>
        </div>

        {displayUnit.kitchen_size && displayUnit.kitchen_size.toLowerCase() !== 'none' && (
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="text-xs text-blue-600 font-medium mb-1">Kitchen</div>
            <div className="text-sm text-gray-700">{displayUnit.kitchen_size}</div>
          </div>
        )}

        {displayUnit.notes && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-600 font-medium mb-1">Notes</div>
            <div className="text-sm text-gray-700">{displayUnit.notes}</div>
          </div>
        )}

        {currentFloorplanUrl && (
          <div className="relative group cursor-pointer" onClick={handleFloorPlanClick}>
            <div className="relative rounded-lg overflow-hidden border border-black/10 bg-gray-50">
              <img 
                src={currentFloorplanUrl} 
                alt={`${displayUnit.unit_name} Floor Plan Preview`}
                className="w-full h-48 object-contain"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-3 shadow-lg">
                  <Maximize2 size={24} className="text-gray-700" />
                </div>
              </div>
            </div>
            <div className="text-xs text-center text-gray-500 mt-2">Click to expand floor plan</div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 pt-2">
          <button
            onClick={handleShareClick}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
          >
            {shareUrlCopied ? (
              <>
                <CheckCircle size={16} className="text-green-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Share size={16} />
                <span>Share Suite</span>
              </>
            )}
          </button>
        </div>

        {displayUnit.recipients && displayUnit.recipients.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => {
                const mailto = `mailto:${displayUnit.recipients.join(',')}?subject=Inquiry about ${displayUnit.unit_name}`;
                window.location.href = mailto;
              }}
              className="w-full px-4 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition text-sm font-medium"
            >
              Lease this space
            </button>
          </div>
        )}
      </div>

      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 bg-blue-500 text-white p-3 rounded-full shadow-lg hover:bg-blue-600 transition z-50"
          title="Scroll to top"
        >
          <ArrowUp size={20} />
        </button>
      )}
    </div>
  );
}
