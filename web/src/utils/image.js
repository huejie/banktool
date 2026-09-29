/**
 * 前端图片压缩：拍照原图往往 3-8MB，压到最长边 2000px / JPEG 0.85，
 * 兼顾识别清晰度与上传速度、接口 token 消耗。
 */
export function compressImage(file, maxEdge = 2000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith('image/')) {
      reject(new Error('只支持图片文件'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (blob && blob.size < file.size * 1.05) {
              resolve(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
            } else {
              URL.revokeObjectURL(url);
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}
