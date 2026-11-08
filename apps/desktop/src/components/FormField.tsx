import { cloneElement, type ReactElement } from 'react'
import './FormField.css'

type ControlProps = {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
}
export function FormField({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactElement<ControlProps>
}) {
  const description =
    [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') ||
    undefined
  return (
    <div className="honsen-form-field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {cloneElement(children, {
        id,
        'aria-describedby': description,
        'aria-invalid': !!error,
        'aria-required': required,
      })}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <span id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
