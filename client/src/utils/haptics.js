// ====================================================================
// FIELD ERGONOMICS: TACTILE HAPTIC VIBRATION
// ====================================================================

let hapticsEnabled = true;

export function setHapticsEnabled(enabled) {
  hapticsEnabled = Boolean(enabled);
}

export function isHapticsEnabled() {
  return hapticsEnabled;
}

/**
 * Normal delivery key tap: 25ms single pulse
 */
export function triggerHaptic(duration = 25) {
  if (!hapticsEnabled) return false;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      return navigator.vibrate(duration);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Critical action (Wicket, Undo, Innings End): multi-pulse pattern [40, 30, 40]
 */
export function triggerHapticCritical() {
  if (!hapticsEnabled) return false;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      return navigator.vibrate([40, 30, 40]);
    } catch {
      return false;
    }
  }
  return false;
}
