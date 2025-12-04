import React, { useEffect, useRef, useCallback } from 'react';
import { detectDevice } from '../../utils/deviceDetection';
import { ExploreTab } from './ExploreTab';
import { RequestTab } from './RequestTab';
import { SuiteDetailsTab } from './SuiteDetailsTab';
import { useSidebarState } from './useSidebarState';
import { useExploreState } from '../../store/exploreState';
import { useGLBState } from '../../store/glbState';
import { useUnitStore } from '../../stores/useUnitStore';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { MobileDiagnostics } from '../../debug/mobileDiagnostics';

export default function Sidebar() {
  const { tab, setTab, view, setView, floorPlanExpanded, setFloorPlanExpanded } = useSidebarState();
  const {
    drawerOpen,
    setDrawerOpen,
    setSelected: setExploreSelected,
    setHovered: setExploreHovered,
  } = useExploreState();
  const { clearSelection, cameraControlsRef, resetCameraAnimation } = useGLBState();
  const { setSelectedUnit: setGlobalSelectedUnit, setHoveredUnit: setGlobalHoveredUnit } = useUnitStore();
  const asideRef = useRef<HTMLElement | null>(null);
  const isMobile = detectDevice().isMobile;

  const collapsed = !drawerOpen;
  const setCollapsed = (value: boolean) => {
    setDrawerOpen(!value);

    if (value && floorPlanExpanded) {
      setFloorPlanExpanded(false);
    }
  };

  const handleBackToExplore = () => {
    // Clear GLB selection (dehighlight box)
    clearSelection();
    
    // Reset camera animation state to ensure clean state
    resetCameraAnimation();
    
    // Reset camera to home position with smooth animation
    if (cameraControlsRef?.current) {
      // Enable smooth animation on both mobile and desktop
      cameraControlsRef.current.reset(true); // true = smooth animation on all platforms
    }

    // Reset explore/hover state so selecting the same unit works again
    setExploreSelected(null);
    setExploreHovered(null);
    setGlobalSelectedUnit(null);
    setGlobalHoveredUnit(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('unit-hover-clear'));
    }
    
    // Navigate back to explore view
    setView('explore');
    setFloorPlanExpanded(false);
  };

  // Responsive sidebar width based on view and device
  const updateSidebarWidth = useCallback(() => {
    const root = document.documentElement;
    const mobile = window.innerWidth < 768;

    // CRITICAL: Don't change --sidebar-w on mobile to prevent canvas resize and WebGL context loss
    if (mobile) {
      return; // Keep mobile sidebar width constant to prevent canvas resize
    }

    const exploreWidth = '360px';
    const detailsWidth = '420px';

    root.style.setProperty('--sidebar-w', view === 'details' ? detailsWidth : exploreWidth);
  }, [view]);

  useEffect(() => {
    updateSidebarWidth();

    const onResize = () => updateSidebarWidth();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateSidebarWidth]);

  useEffect(() => {
    MobileDiagnostics.log('sidebar', 'state update', {
      tab,
      view,
      collapsed,
      floorPlanExpanded,
    });
    MobileDiagnostics.layout('sidebar', asideRef.current);
  }, [tab, view, collapsed, floorPlanExpanded]);

  return (
    <>
      <button
        className={cn('sidebar-toggle', collapsed && 'collapsed', floorPlanExpanded && 'floorplan-expanded')}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <>
            <ChevronRight size={16} />
            <span>Expand</span>
          </>
        ) : (
          <>
            <ChevronLeft size={16} />
            <span>Collapse</span>
          </>
        )}
      </button>

      <aside
        ref={asideRef}
        className={cn('sidebar', collapsed && 'is-collapsed', floorPlanExpanded && 'floorplan-expanded')}
        role="complementary"
        aria-label="Suite Controls"
        aria-expanded={!collapsed}
      >
        <div className="flex-shrink-0 pb-3 border-b border-black/5">
          {view === 'details' ? (
            <button
              onClick={handleBackToExplore}
              className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 transition"
            >
              <ChevronLeft size={16} />
              <span>Back to Explore</span>
            </button>
          ) : (
            <div className={cn(
              "rounded-xl bg-black/5 p-1 w-full",
              isMobile ? "flex flex-col space-y-1" : "inline-flex"
            )}>
              <button
                className={cn(
                  'flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition',
                  tab === 'explore' ? 'bg-white shadow' : 'opacity-70 hover:opacity-100'
                )}
                onClick={() => {
                  setTab('explore');
                  setView('explore');
                }}
              >
                Explore Suites
              </button>
              <button
                className={cn(
                  'flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition',
                  tab === 'request' ? 'bg-white shadow' : 'opacity-70 hover:opacity-100'
                )}
                onClick={() => {
                  setTab('request');
                  setView('request');
                }}
              >
                Request Suites
              </button>
            </div>
          )}
        </div>

        <div className="h-[calc(100%-80px)] overflow-hidden relative mt-3">
          <div
            className="absolute inset-0 transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{
              transform: view === 'details' ? 'translateX(-100%)' : 'translateX(0)',
            }}
          >
            <div className="h-full overflow-y-auto">
              {tab === 'explore' ? <ExploreTab /> : <RequestTab />}
            </div>
          </div>
          <div
            className="absolute inset-0 transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{
              transform: view === 'details' ? 'translateX(0)' : 'translateX(100%)',
            }}
          >
            <div className="h-full">
              <SuiteDetailsTab />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
