/**
 * Configuration for the ghost/highlight material used for selected units
 * Adjust these values to fine-tune the appearance of selected units
 */

export const GHOST_MATERIAL_CONFIG = {
  // Visual appearance
  color: '#0066CC',      // Slightly darker, less saturated blue for selected units
  opacity: 0.18,         // Further reduced opacity for less brightness
  
  // Fresnel effect parameters (edge glow)
  fresnelBias: 0.1,      // Base fresnel value
  fresnelScale: 1.8,     // Reduced intensity for more subtle effect
  fresnelPower: 2.5,     // Reduced falloff for softer edges
  
  // Render settings
  depthTest: false,      // Draw on top of everything
  depthWrite: false,     // Don't write to depth buffer (prevents z-fighting)
  doubleSide: true,      // Render both sides of the mesh
  
  // Bloom/glow settings (for future use)
  bloomIntensity: 0.3,   // How much the edges glow
  edgeBrightness: 0.6,   // Edge highlight strength
};

// Selected unit solid blue material configuration
export const SELECTED_MATERIAL_CONFIG = {
  color: 0x3b82f6,           // Bright blue
  emissive: 0x3b82f6,        // Blue emissive glow
  emissiveIntensity: 0.5,    // Medium intensity
  metalness: 0.3,            // Slight metallic look
  roughness: 0.4,            // Smooth but not mirror-like
  transparent: false,
  opacity: 1.0,
};

// Hovered unit subtle glow configuration
export const HOVERED_MATERIAL_CONFIG = {
  emissive: 0x3b82f6,        // Blue emissive
  emissiveIntensity: 0.2,    // Subtle intensity
};

// Filter highlight configuration - for units matching active filters
export const FILTER_HIGHLIGHT_CONFIG = {
  color: 0x00d5ff,           // Cyan color
  emissive: 0x00d5ff,        // Cyan emissive glow
  emissiveIntensity: 0.4,    // Medium-high intensity
  metalness: 0.2,            // Slight metallic look
  roughness: 0.3,            // Smooth surface
  transparent: true,
  opacity: 0.8,              // Semi-transparent
  pulsing: true,             // Enable pulsing animation
};

// Alternative presets for different visual styles
export const GHOST_MATERIAL_PRESETS = {
  subtle: {
    opacity: 0.2,
    fresnelScale: 1.5,
    fresnelPower: 2.0,
  },
  standard: {
    opacity: 0.25,
    fresnelScale: 1.8,
    fresnelPower: 2.5,
  },
  prominent: {
    opacity: 0.35,
    fresnelScale: 2.0,
    fresnelPower: 3.0,
  },
};