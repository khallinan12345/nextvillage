// src/components/viz/MarkdownTable.tsx
//
// Renders the table parsed by markdownTableSpec.ts. For pages with their own hand-rolled
// paragraph renderer (not react-markdown/RichMarkdown) — so a table the model writes in plain
// prose still looks like a table instead of raw pipe characters and dashes.

import React from 'react';

export const MarkdownTable: React.FC<{ header: string[]; rows: string[][] }> = ({ header, rows }) => (
  <div className="overflow-x-auto my-2">
    <table className="w-full text-sm border-collapse">
      <thead className="bg-surface">
        <tr>{header.map((h, i) => <th key={i} className="text-left px-3 py-1.5 font-semibold text-ink border-b border-hair">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {header.map((_, ci) => <td key={ci} className="px-3 py-1.5 border-b border-hair text-body align-top">{r[ci] ?? ''}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
