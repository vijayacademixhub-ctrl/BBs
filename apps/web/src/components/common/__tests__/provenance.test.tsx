import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProvenanceBadge, SampleDataNotice } from '../provenance'

/**
 * These assertions protect a requirement rather than an implementation
 * detail: sample content and unverified AI output must never be presented as
 * established record. A change that removes the marking should fail here.
 */
describe('provenance marking', () => {
  it('marks sample data explicitly', () => {
    render(<ProvenanceBadge provenance="sample" />)
    expect(screen.getByText(/sample data/i)).toBeInTheDocument()
  })

  it('marks AI output as unverified', () => {
    render(<ProvenanceBadge provenance="ai_unverified" />)
    expect(screen.getByText(/unverified/i)).toBeInTheDocument()
  })

  it('states that no AI processing has taken place in the page notice', () => {
    render(<SampleDataNotice />)
    expect(screen.getByRole('note')).toHaveTextContent(/no ai processing has taken place/i)
  })
})
