import { Alert, Input } from 'antd'
import { useEffect, useRef, useState } from 'react'

export type MaterialImageDraft = {
  sourceFileName: string
  sourceBase64: string
  squareCropBase64: string
  cropJson: string
}

type MaterialImageCropperProps = {
  onChange: (draft: MaterialImageDraft | null) => void
}

const PREVIEW_SIZE = 240
const MAX_IMAGE_BYTES = 100 * 1024 * 1024

export function MaterialImageCropper({ onChange }: MaterialImageCropperProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [sourceBase64, setSourceBase64] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [x, setX] = useState(50)
  const [y, setY] = useState(50)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!image || !sourceFileName || !sourceBase64 || !canvas.current) return
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom
    const sourceX = ((image.naturalWidth - side) * x) / 100
    const sourceY = ((image.naturalHeight - side) * y) / 100
    const context = canvas.current.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
    context.drawImage(
      image,
      sourceX,
      sourceY,
      side,
      side,
      0,
      0,
      PREVIEW_SIZE,
      PREVIEW_SIZE,
    )
    const squareCropBase64 = canvas.current.toDataURL('image/png').split(',')[1]
    if (!squareCropBase64) return
    onChange({
      sourceFileName,
      sourceBase64,
      squareCropBase64,
      cropJson: JSON.stringify({ x: sourceX, y: sourceY, size: side }),
    })
  }, [image, onChange, sourceBase64, sourceFileName, x, y, zoom])

  async function selectFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > MAX_IMAGE_BYTES) {
      setError('请选择不超过 100MB 的图片文件')
      onChange(null)
      return
    }
    const [dataUrl, loadedImage] = await Promise.all([
      readAsDataUrl(file),
      loadImage(file),
    ]).catch(() => [null, null])
    if (!dataUrl || !loadedImage) {
      setError('无法读取图片文件')
      onChange(null)
      return
    }
    const sourceBase64 = dataUrl.split(',')[1]
    if (!sourceBase64) {
      setError('无法读取图片数据')
      onChange(null)
      return
    }
    setError(null)
    setZoom(1)
    setX(50)
    setY(50)
    setSourceFileName(file.name)
    setSourceBase64(sourceBase64)
    setImage(loadedImage)
  }

  return (
    <section aria-label="材料图片裁剪">
      <Input
        aria-label="选择材料图片"
        type="file"
        // shortcut: use browser-decodable formats; add a native HEIC decoder if material-photo HEIC crop becomes required.
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => void selectFile(event.target.files?.[0])}
      />
      {error && <Alert type="error" title={error} showIcon />}
      {image && (
        <div className="image-cropper">
          <canvas
            aria-label="方形裁剪预览"
            className="material-crop-preview"
            height={PREVIEW_SIZE}
            ref={canvas}
            width={PREVIEW_SIZE}
          />
          <label>
            裁剪缩放
            <input
              aria-label="裁剪缩放"
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
          <label>
            裁剪水平位置
            <input
              aria-label="裁剪水平位置"
              type="range"
              min="0"
              max="100"
              value={x}
              onChange={(event) => setX(Number(event.target.value))}
            />
          </label>
          <label>
            裁剪垂直位置
            <input
              aria-label="裁剪垂直位置"
              type="range"
              min="0"
              max="100"
              value={y}
              onChange={(event) => setY(Number(event.target.value))}
            />
          </label>
        </div>
      )}
    </section>
  )
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return readAsDataUrl(file).then(
    (source) =>
      new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('invalid image'))
        image.src = source
      }),
  )
}
