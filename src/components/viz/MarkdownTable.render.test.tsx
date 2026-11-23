import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { parseMarkdownTable } from './markdownTableSpec';
import { MarkdownTable } from './MarkdownTable';

describe('MarkdownTable render', () => {
  it('renders a real table element with the right headers and cells', () => {
    // The exact shape a learner reported seeing as raw pipe text instead of a table.
    const lines = [
      '| Data type | Example value (your case) | Why it helps the AI |',
      '|-----------|--------------------------|---------------------|',
      '| Racket weight & balance | 300 g, 32 mm head-heavy | Shows preferred feel and swing inertia |',
      '| Swing speed (mph) | 45 mph on forehand | Relates to power needs for paddle |',
    ];
    const table = parseMarkdownTable(lines)!;
    render(<MarkdownTable header={table.header} rows={table.rows} />);

    const grid = screen.getByRole('table');
    expect(screen.getByRole('columnheader', { name: 'Data type' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Why it helps the AI' })).toBeInTheDocument();
    expect(screen.getByText('300 g, 32 mm head-heavy')).toBeInTheDocument();
    expect(screen.getByText('45 mph on forehand')).toBeInTheDocument();
    expect(grid.querySelectorAll('tbody tr')).toHaveLength(2);
  });
});
