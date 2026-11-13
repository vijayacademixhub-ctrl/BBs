import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyState, ErrorState, LoadingRows } from '../states'

describe('shared view states', () => {
  it('exposes the loading state to assistive technology', () => {
    render(<LoadingRows rows={2} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders an empty state with its action', () => {
    render(<EmptyState title="No meetings" description="Nothing scheduled" action={<button>Add</button>} />)
    expect(screen.getByText('No meetings')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('announces errors and offers a retry', async () => {
    const onRetry = vi.fn()
    render(<ErrorState description="Network unavailable" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable')
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
