import { useEffect, useRef } from 'react'

import { RUSSIAN_ALPHABET } from '../domain'

interface RussianKeyboardProps {
  open: boolean
  onChoose: (letter: string) => void
  onClose: () => void
}

export function RussianKeyboard({
  open,
  onChoose,
  onClose,
}: RussianKeyboardProps) {
  const firstLetterRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      firstLetterRef.current?.focus()
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <div
      className="keyboard-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className="letter-keyboard"
        role="dialog"
        aria-modal="true"
        aria-label="Выбор буквы"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
      >
        <div className="letter-grid" aria-label="Русский алфавит">
          {RUSSIAN_ALPHABET.map((letter) => (
            <button
              className="letter-key"
              type="button"
              key={letter}
              ref={letter === RUSSIAN_ALPHABET[0] ? firstLetterRef : undefined}
              aria-label={`Буква ${letter}`}
              onClick={() => onChoose(letter)}
            >
              {letter}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
