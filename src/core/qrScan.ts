import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import jsQR from "jsqr";

/** Opens the camera, takes a photo and decodes a QR code from it. */
export async function scanQrFromCamera(): Promise<string | null> {
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    quality: 100,
  });
  if (!photo.dataUrl) return null;

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image load failed"));
    img.src = photo.dataUrl!;
  });

  const max = 1024;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(data.data, data.width, data.height);
  return result?.data ?? null;
}
