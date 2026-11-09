import { Input, type InputRef } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { FormField } from './FormField'
import { useUiLocale } from '../lib/ui-locale'

export function ReferenceNameField({
  id,
  label,
  ariaLabel,
  value,
  disabled,
  onSave,
}: {
  id: string
  label: string
  ariaLabel: string
  value: string
  disabled: boolean
  onSave: (value: string) => Promise<boolean>
}) {
  const { locale } = useUiLocale()
  const text = {
    zh: {
      required: '名称必填',
      long: '名称过长，请缩短后重试',
      failed: '保存失败，输入已保留；请检查后重试',
      saving: '正在保存，请稍候',
      saved: '已保存',
    },
    en: {
      required: 'Name is required',
      long: 'Name is too long. Shorten it and retry.',
      failed: 'Save failed. Input retained; check and retry.',
      saving: 'Saving, please wait',
      saved: 'Saved',
    },
    fr: {
      required: 'Le nom est obligatoire',
      long: 'Le nom est trop long. Raccourcissez-le et réessayez.',
      failed: 'Échec. Saisie conservée ; vérifiez et réessayez.',
      saving: 'Enregistrement en cours',
      saved: 'Enregistré',
    },
  }[locale]
  const [draft, setDraft] = useState(value)
  const [state, setState] = useState<
    'idle' | 'required' | 'long' | 'failed' | 'saving' | 'saved'
  >('idle')
  const pending = useRef(false)
  const input = useRef<InputRef>(null)
  const restoreFocus = useRef(false)
  useEffect(() => {
    setDraft(value)
  }, [value])
  useEffect(() => {
    if (state === 'saving' || !restoreFocus.current) return
    restoreFocus.current = false
    if (document.activeElement === document.body) input.current?.focus()
  }, [state])
  async function commit() {
    if (disabled || pending.current) return
    if (!draft.trim()) {
      setState('required')
      return
    }
    if (new TextEncoder().encode(draft).length > 255) {
      setState('long')
      return
    }
    if (draft === value) {
      setState('idle')
      return
    }
    pending.current = true
    restoreFocus.current = document.activeElement === input.current?.input
    setState('saving')
    try {
      setState((await onSave(draft)) ? 'saved' : 'failed')
    } catch {
      setState('failed')
    } finally {
      pending.current = false
    }
  }
  return (
    <FormField
      id={id}
      label={label}
      required
      hintLive
      error={
        state === 'required' || state === 'long' || state === 'failed'
          ? text[state]
          : undefined
      }
      hint={state === 'saving' || state === 'saved' ? text[state] : undefined}
    >
      <Input
        ref={input}
        aria-label={ariaLabel}
        value={draft}
        disabled={disabled || state === 'saving'}
        aria-busy={state === 'saving'}
        onChange={(event) => {
          setDraft(event.target.value)
          setState('idle')
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.nativeEvent.isComposing &&
            event.nativeEvent.keyCode !== 229
          ) {
            event.preventDefault()
            void commit()
          }
        }}
      />
    </FormField>
  )
}
