/** Matches the limits in firestore.rules on private/displayBranding. */
export const MAX_TITLE_LENGTH = 60;
export const MAX_LOGO_LENGTH = 250_000;

/** Larger than the warm room ever shows it, even on a 4K screen. */
export const LOGO_MAX_WIDTH = 800;
export const LOGO_MAX_HEIGHT = 200;

/** Files bigger than this are turned away before they are read. */
export const MAX_LOGO_FILE_BYTES = 10 * 1024 * 1024;

/** The size to draw an image at to fit the box, never enlarged. */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    image.src = url;
  });
}

/**
 * The logo as the warm room keeps it: drawn small enough for the title bar
 * and turned into a PNG data URL, or WebP if a PNG would be too large. Any
 * format the browser can show works, SVG included, since it is redrawn as a
 * plain image.
 */
export async function logoDataUrl(file: File): Promise<string> {
  if (file.size > MAX_LOGO_FILE_BYTES) {
    throw new Error('That image is over 10 MB. Choose a smaller one.');
  }
  const image = await loadImage(file);
  const natural = { width: image.naturalWidth || LOGO_MAX_WIDTH, height: image.naturalHeight || LOGO_MAX_HEIGHT };
  const size = fitWithin(natural.width, natural.height, LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d')!.drawImage(image, 0, 0, size.width, size.height);

  const candidates = [
    canvas.toDataURL('image/png'),
    canvas.toDataURL('image/webp', 0.92),
    canvas.toDataURL('image/webp', 0.8),
  ];
  // Browsers that cannot write WebP give back a PNG instead.
  const fits = candidates.find((url) => /^data:image\/(png|webp);/.test(url) && url.length <= MAX_LOGO_LENGTH);
  if (!fits) throw new Error('That image is too detailed to use as a logo. Try a simpler one.');
  return fits;
}
