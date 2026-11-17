/**
 * Leichtes Text-Markup für Beiträge (keine Library):
 * - Leerzeile = neuer Absatz
 * - Zeilen, die mit "- " beginnen = Aufzählung (bis zur Leerzeile)
 * - **Text** = fett
 */
import React from 'react'

type Block = { kind: 'p' | 'ul'; lines: string[] }

function parseBlocks(body: string): Block[] {
  const blocks: Block[] = []
  for (const chunk of body.split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) continue
    if (lines.every((l) => l.startsWith('- '))) {
      blocks.push({ kind: 'ul', lines: lines.map((l) => l.slice(2)) })
    } else {
      blocks.push({ kind: 'p', lines: [lines.join(' ').replace(/\s+/g, ' ')] })
    }
  }
  return blocks
}

/** **fett** in einen Absatz umsetzen (kein HTML-Escaping nötig — React escaped von selbst). */
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <React.Fragment key={i}>{part}</React.Fragment>))
}

/** Rendert den Body eines Beitrags mit obigen Markup-Regeln. */
export function RichText({ body, className = '', pClass = '', listClass = '' }: { body: string; className?: string; pClass?: string; listClass?: string }) {
  const blocks = parseBlocks(body)
  if (!blocks.length) return null
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.kind === 'p' ? (
          <p key={i} className={pClass}>{renderInline(b.lines[0])}</p>
        ) : (
          <ul key={i} className={listClass}>
            {b.lines.map((l, j) => <li key={j}>{renderInline(l)}</li>)}
          </ul>
        ),
      )}
    </div>
  )
}
