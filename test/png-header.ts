export const PNG_SIGNATURE = '89504e470d0a1a0a';
export const PNG_COLOR_TYPE_RGB = 2;
export const PNG_COLOR_TYPE_RGBA = 6;

/** Parse the fixed-position fields of a PNG's IHDR chunk. */
export function readPngHeader(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return {
    signature: Buffer.from(png.subarray(0, 8)).toString('hex'),
    width: view.getUint32(16),
    height: view.getUint32(20),
    colorType: png[25],
  };
}
