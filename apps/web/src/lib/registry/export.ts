import type { Register, RegisterRecord } from '@/types/registry'

/**
 * CSV export.
 *
 * The register has to remain exportable, because the team's reporting
 * obligations are met in spreadsheets and documents. An index people cannot
 * get their data back out of is a worse place to keep it than the workbook,
 * however good the editing is.
 */

function escapeCell(value: string): string {
  // A leading =, +, - or @ is executed as a formula by Excel when the file is
  // opened. Prefixing a tab neutralises it without changing what is read.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `\t${value}` : value
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

export function recordsToCsv(register: Register, records: RegisterRecord[]): string {
  const fields = register.fields
  const header = ['Record id', ...fields.map((f) => f.label), 'Archived', 'Last changed']
  const lines = [header.map(escapeCell).join(',')]

  for (const record of records) {
    lines.push(
      [
        record.id,
        ...fields.map((field) => String(record.values[field.id] ?? '')),
        record.archivedAt ? 'yes' : 'no',
        record.updatedAt,
      ]
        .map(escapeCell)
        .join(','),
    )
  }

  // A BOM, so Excel on Windows reads the file as UTF-8 and the names in it
  // are not mangled.
  return `﻿${lines.join('\r\n')}\r\n`
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function csvFilename(register: Register): string {
  const date = new Date().toISOString().slice(0, 10)
  return `${register.slug}-${date}.csv`
}
