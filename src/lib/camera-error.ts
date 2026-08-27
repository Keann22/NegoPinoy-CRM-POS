export type CameraError = {
  title: string;
  steps: string[];
};

/**
 * Turns a raw getUserMedia / MediaStream error into a friendly, actionable
 * message that a non-technical staff member can follow on their phone.
 */
export function describeCameraError(err: any): CameraError {
  const name = err?.name || '';

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      title: 'Camera access is blocked for this site',
      steps: [
        'Tap the ⚙ / lock icon just left of the web address at the top.',
        'Open Permissions → Camera and set it to Allow (tap "Reset permissions" if it shows Blocked).',
        'Reload the page, then tap "Tap to Scan Order" again.',
        'If you opened this link from inside another app (Messenger, Facebook, Gmail…), tap ⋮ → "Open in Chrome" and try there.',
      ],
    };
  }

  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return {
      title: 'No camera was found on this device',
      steps: [
        'Make sure this device has a working camera.',
        'Try again on a phone or tablet with a rear camera.',
      ],
    };
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      title: 'The camera is being used by another app',
      steps: [
        'Close any other app that might be using the camera (camera app, video call, etc.).',
        'Then reload the page and tap "Tap to Scan Order" again.',
      ],
    };
  }

  return {
    title: 'Could not start the camera',
    steps: [
      'Reload the page and try again.',
      'Make sure the site has camera permission in your browser settings.',
    ],
  };
}

/**
 * Probes for camera access before opening the QR scanner UI, so callers can
 * surface a friendly message instead of the scanner library's raw error text.
 * Resolves to null on success, or a CameraError describing the problem.
 */
export async function probeCameraAccess(): Promise<CameraError | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    // Release this probe stream; the scanner opens its own afterwards.
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } catch (err) {
    return describeCameraError(err);
  }
}
