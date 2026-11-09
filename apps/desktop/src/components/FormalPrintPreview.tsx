import { useUiLocale } from '../lib/ui-locale'
import { historyText } from '../lib/history-locale'
import {
  documentSchema,
  verifyPrintProfileAsset,
  defaultPrintLanguage,
  permittedPrintLanguages,
  type PrintPrimaryLanguage,
  type FormalPrintDocument,
} from '../lib/formal-print-api'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FormalDocumentSheet } from './PrintEngine'
import './FormalPrintPreview.css'
let activePrintOwner: symbol | null = null
import { Alert, Button, Select } from 'antd'

export function FormalPrintPreview({ orderId }: { orderId: string }) {
  const { locale } = useUiLocale()
  const t = (message: Parameters<typeof historyText>[1]) =>
    historyText(locale, message)
  const [document, setDocument] = useState<FormalPrintDocument | null>(null)
  const [failed, setFailed] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const previewPending = useRef(false)
  const [primaryLanguage, setPrimaryLanguage] =
    useState<PrintPrimaryLanguage>('zh')
  const [printSnapshot, setPrintSnapshot] = useState<{
    document: FormalPrintDocument
    language: PrintPrimaryLanguage
  } | null>(null)
  const printOwner = useRef(Symbol('formal-print'))
  useEffect(() => {
    const owner = printOwner.current
    return () => {
      if (activePrintOwner === owner) {
        activePrintOwner = null
        window.document.body.classList.remove('honsen-printing-formal')
      }
    }
  }, [])
  function requestPrint() {
    if (!document || activePrintOwner !== null) return
    activePrintOwner = printOwner.current
    setPrintSnapshot({ document, language: primaryLanguage })
  }
  useEffect(() => {
    if (!printSnapshot) return
    const owner = printOwner.current
    let cancelled = false
    let frame = 0
    const finish = () => setPrintSnapshot(null)
    window.addEventListener('afterprint', finish)
    window.document.body.classList.add('honsen-printing-formal')
    window.scrollTo(0, 0)
    const images = Array.from(
      window.document.querySelectorAll<HTMLImageElement>(
        '.honsen-print-root img',
      ),
    )
    void Promise.all([
      window.document.fonts.ready,
      ...images.map((image) => image.decode()),
    ])
      .then(async () => {
        for (let i = 0; i < 120; i++) {
          if (cancelled) return
          const root = window.document.querySelector('.honsen-print-root')
          if (root?.querySelector('[data-layout-error]'))
            throw Error('Print layout overflow')
          if (root?.querySelector('[data-layout-ready]')) break
          await new Promise<void>((resolve) =>
            window.requestAnimationFrame(() => resolve()),
          )
          if (i === 119) throw Error('Print layout not ready')
        }
        if (cancelled) return
        frame = window.requestAnimationFrame(() => {
          try {
            window.print()
          } catch {
            setFailed(true)
            finish()
          }
        })
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
          finish()
        }
      })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.removeEventListener('afterprint', finish)
      if (activePrintOwner === owner) {
        window.document.body.classList.remove('honsen-printing-formal')
        activePrintOwner = null
      }
    }
  }, [printSnapshot])
  async function preview() {
    if (previewPending.current) return
    previewPending.current = true
    setPreviewing(true)
    setDocument(null)
    setFailed(false)
    try {
      const invoke = (
        window as Window & {
          __TAURI__?: {
            core?: { invoke?: <T>(command: string, args: object) => Promise<T> }
          }
        }
      ).__TAURI__?.core?.invoke
      if (!invoke) throw new Error('Desktop unavailable')
      const parsed = documentSchema.parse(
        await invoke<unknown>('get_formal_print_document', { orderId }),
      )
      if (parsed.printProfile)
        await verifyPrintProfileAsset(parsed.printProfile)
      setPrimaryLanguage(defaultPrintLanguage(parsed))
      setDocument(parsed)
    } catch {
      setFailed(true)
    } finally {
      previewPending.current = false
      setPreviewing(false)
    }
  }
  return (
    <>
      <section aria-label={t('正式单据打印预览')}>
        <Button
          loading={previewing}
          disabled={previewing}
          aria-busy={previewing}
          onClick={() => void preview()}
        >
          {t('正式单据预览 / Aperçu')}
        </Button>
        {previewing && (
          <p role="status" aria-live="polite">
            {locale === 'zh'
              ? '正在准备正式单据预览…'
              : locale === 'fr'
                ? 'Préparation de l’aperçu du document officiel…'
                : 'Preparing the formal document preview…'}
          </p>
        )}
        {failed && (
          <Alert
            type="error"
            title={t('无法预览：请检查授权、正式签发状态及冻结文档翻译。')}
          />
        )}
        {document && (
          <div>
            <Button className="formal-print-action" onClick={requestPrint}>
              {t('打印 / Imprimer · PDF')}
            </Button>
            <Select
              aria-label="打印主语言 / Langue principale / Primary language"
              value={primaryLanguage}
              onChange={setPrimaryLanguage}
              options={permittedPrintLanguages(document.languagePair).map(
                (value) => ({
                  value,
                  label:
                    value === 'fr'
                      ? 'Français · 中文'
                      : value === 'en'
                        ? 'English · 中文'
                        : '中文 · Français',
                }),
              )}
            />
            <FormalDocumentSheet
              document={document}
              primaryLanguage={primaryLanguage}
            />
          </div>
        )}
      </section>
      {printSnapshot &&
        createPortal(
          <div className="honsen-print-root">
            <FormalDocumentSheet
              document={printSnapshot.document}
              primaryLanguage={printSnapshot.language}
            />
          </div>,
          window.document.body,
        )}
    </>
  )
}
