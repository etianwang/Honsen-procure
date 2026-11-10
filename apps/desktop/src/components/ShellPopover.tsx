import { Popover } from 'antd'
import { useCallback, useId, useRef, type ReactNode } from 'react'

export function ShellPopover({
  open,
  onOpenChange,
  label,
  className,
  trigger,
  children,
  severity,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  className: string
  trigger: ReactNode
  children: ReactNode
  severity?: 'warning' | 'error'
}) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const focusPanel = useCallback(
    (panel: HTMLElement | null) => {
      if (open) panel?.focus()
    },
    [open],
  )

  function close() {
    onOpenChange(false)
    button.current?.focus()
  }

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger="click"
      placement="bottomRight"
      destroyOnHidden
      content={
        <section
          ref={focusPanel}
          id={id}
          tabIndex={-1}
          role="dialog"
          aria-label={label}
          className="honsen-shell-popover"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              close()
            }
          }}
        >
          {children}
        </section>
      }
    >
      <button
        ref={button}
        type="button"
        className={className}
        data-severity={severity}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) close()
        }}
      >
        {trigger}
      </button>
    </Popover>
  )
}
