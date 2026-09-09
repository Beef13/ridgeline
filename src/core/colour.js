import * as THREE from 'three';

/**
 * Authored colours are sRGB hex. three's colour management is ON by default
 * since r152, so `new THREE.Color('#rrggbb')` ALREADY converts sRGB to linear.
 * Calling convertSRGBToLinear() on top of that double-converts: everything
 * comes out dark and warm tones swing red. This helper exists to make that
 * explicit and keep the conversion in exactly one place.
 */
export const SRGB = (hex) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
