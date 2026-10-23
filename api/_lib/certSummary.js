// Which dashboard rows count as certifications in the monthly assessment.
//
// Only rows from the Certification page (category_activity 'Certification') count. Scaffolded
// learning and training activities also write a certification_evaluation_score, so that
// column must never be used on its own to decide that a learner attempted or passed a
// certification. A certification is passed when its page marks the row 'completed'.

export function isCertificationRow(row) {
  return row?.category_activity === 'Certification';
}

export function summariseCertRows(rows) {
  const certRows = (rows || []).filter(isCertificationRow);
  const names = [];
  const passed = [];
  let scoreSum = 0;
  let scoreCount = 0;
  for (const row of certRows) {
    const title = row.title || row.activity || 'Unknown';
    names.push(title);
    if (row.progress === 'completed') passed.push(title);
    for (const [key, value] of Object.entries(row)) {
      if (/^certification_.*_score$/.test(key) && typeof value === 'number') {
        scoreSum += value;
        scoreCount++;
      }
    }
  }
  return {
    certRows,
    names: [...new Set(names)],
    passed: [...new Set(passed)],
    avgScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null,
  };
}
