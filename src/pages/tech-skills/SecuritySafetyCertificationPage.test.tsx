import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  row: null as unknown,
  pdf: vi.fn(),
}));

const chain = (result: unknown) => {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
};
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: () => chain({ data: mocks.row ? [mocks.row] : [], error: null }) },
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/useBranding', () => ({ useBranding: () => ({ institutionName: 'Test Institute', isReady: true, variant: 'vai' }) }));
vi.mock('../../lib/certificatePdf', () => ({ generateCertificatePdf: (...a: unknown[]) => mocks.pdf(...a) }));
vi.mock('../../components/layout/Navbar', () => ({ default: () => null }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="editor" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

import SecuritySafetyCertificationPage from './SecuritySafetyCertificationPage';
import { CERT_CRITERIA } from './securityCert/certRepo';

const result = (scoreFor: (i: number) => number, extra: Record<string, unknown> = {}) => {
  const scores = CERT_CRITERIA.map((c, i) => ({ assessment_name: c.name, score: scoreFor(i), evidence: `${scoreFor(i)} evidence` }));
  return { scores, passed: scores.every(s => s.score >= 2), certified: scores.every(s => s.score >= 2), overallAvg: 2, saved: true, ...extra };
};

const mockApi = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })));

const renderPage = () => render(<MemoryRouter><SecuritySafetyCertificationPage /></MemoryRouter>);

const openRepoAndEdit = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /open the repo/i }));
  fireEvent.change(await screen.findByLabelText('editor'), { target: { value: '# changed\n' } });
};

beforeEach(() => { localStorage.clear(); mocks.row = null; mocks.pdf.mockReset(); });

describe('SecuritySafetyCertificationPage', () => {
  it('describes what is scored without revealing a checklist or any hints', async () => {
    renderPage();
    expect(await screen.findByText(/no hints/i)).toBeTruthy();
    for (const c of CERT_CRITERIA) expect(screen.getAllByText(c.name).length).toBeGreaterThan(0);
    expect(screen.queryByText(/sms_secret_/)).toBeNull();
  });

  it('will not submit an untouched repo', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /open the repo/i }));
    const submit = screen.getAllByRole('button', { name: /submit for grading/i });
    for (const b of submit) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('submits the files and the written review, then shows per-area results and keeps the certificate locked on a fail', async () => {
    mockApi(200, result(i => (i === 0 ? 3 : 1)));
    renderPage();
    await openRepoAndEdit();
    fireEvent.change(screen.getByLabelText(/your security review/i), { target: { value: 'I rotated the leaked key first.' } });
    fireEvent.click(screen.getAllByRole('button', { name: /submit for grading/i })[0]);

    expect(await screen.findByText(/areas at Proficient or above/i)).toBeTruthy();
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('/api/security-certification');
    const sent = JSON.parse((call[1] as RequestInit).body as string);
    expect(sent.reflection).toBe('I rotated the leaked key first.');
    expect(sent.files.some((f: { content: string }) => f.content === '# changed\n')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /🏆 Cert/ }));
    expect(await screen.findByText(/certificate not yet available/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /download certificate/i })).toBeNull();
  });

  it('unlocks the certificate only from a passing server result, and builds the PDF with the learner’s name', async () => {
    mockApi(200, result(() => 3));
    renderPage();
    await openRepoAndEdit();
    fireEvent.click(screen.getAllByRole('button', { name: /submit for grading/i })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /get certificate/i }));

    fireEvent.change(await screen.findByLabelText(/full name/i), { target: { value: 'Amara Okoye' } });
    fireEvent.click(screen.getByRole('button', { name: /download certificate/i }));
    await waitFor(() => expect(mocks.pdf).toHaveBeenCalled());
    expect(mocks.pdf.mock.calls[0][0]).toMatchObject({ recipientName: 'Amara Okoye', idPrefix: 'SEC' });
  });

  it('shows the server’s message when grading is refused or unavailable, and stays on the repo', async () => {
    mockApi(429, { error: 'You have submitted several times in the last hour.' });
    renderPage();
    await openRepoAndEdit();
    fireEvent.click(screen.getAllByRole('button', { name: /submit for grading/i })[0]);
    expect((await screen.findByRole('alert')).textContent).toMatch(/several times in the last hour/);
    expect(screen.getByLabelText('editor')).toBeTruthy();
  });

  it('restores an earlier result and certified status from the saved row', async () => {
    mocks.row = {
      sec_cert_pages: null,
      sec_cert_evaluation: {
        passedAt: '2026-10-01T00:00:00.000Z',
        scores: Object.fromEntries(CERT_CRITERIA.map(c => [c.name, { score: 3, evidence: 'ok' }])),
      },
    };
    renderPage();
    expect(await screen.findByText(/Certified/)).toBeTruthy();
  });
});
