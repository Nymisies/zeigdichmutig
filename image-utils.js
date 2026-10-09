// Foto-Verkleinerung im Browser, bevor hochgeladen wird. Eigenes Modul, damit die
// Logik isoliert testbar ist und Fehler einen klaren Code tragen (err.code):
//   'decode'  - Bild lässt sich nicht lesen (z.B. HEIC, kaputte Datei, extrem groß)
//   'canvas'  - Zeichenfläche konnte nicht angelegt werden (zu wenig Speicher)
//   'encode'  - JPEG konnte nicht erzeugt werden

export const COMPRESS_MAX_DIMENSION = 2200; // px, längere Seite — für Web-Ansicht/Abstimmung, nicht für Druck
export const COMPRESS_TARGET_BYTES = 2 * 1024 * 1024;

function fail(code, cause) {
  const err = new Error(code);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}

// Erst createImageBitmap (schnell), bei Fehlschlag Rückfall über ein <img>-Element.
// Manche Handys/Browser schaffen den einen Weg nicht, den anderen aber schon.
async function decodeImage(file) {
  try {
    return await createImageBitmap(file);
  } catch (firstError) {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(fail('decode', firstError)); };
      img.src = url;
    });
  }
}

function sizeOf(drawable) {
  return {
    width: drawable.naturalWidth || drawable.width,
    height: drawable.naturalHeight || drawable.height
  };
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function compressImage(file) {
  const drawable = await decodeImage(file);
  let { width, height } = sizeOf(drawable);
  if (!width || !height) throw fail('decode');

  if (width > COMPRESS_MAX_DIMENSION || height > COMPRESS_MAX_DIMENSION) {
    const scale = COMPRESS_MAX_DIMENSION / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw fail('canvas');

  // Weißer Untergrund: Bilder mit Transparenz (z.B. PNG-Screenshots) würden sonst schwarz.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  try {
    ctx.drawImage(drawable, 0, 0, width, height);
  } catch (e) {
    throw fail('canvas', e);
  }
  if (typeof drawable.close === 'function') drawable.close();

  let quality = 0.85;
  let blob = await canvasToJpeg(canvas, quality);
  while (blob && blob.size > COMPRESS_TARGET_BYTES && quality > 0.65) {
    quality -= 0.08;
    blob = await canvasToJpeg(canvas, quality);
  }
  if (!blob) throw fail('encode');
  return blob;
}
