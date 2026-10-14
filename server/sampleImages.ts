/**
 * Pre-configured SVG/raster whiteboard mock images encoded as data URIs
 * for instant one-click testing if the user doesn't have an immediate camera or photo.
 */

// A high-contrast SVG whiteboard with simulated marker handwriting
function createWhiteboardSvg(columns: Array<{ name: string; color: string; tasks: string[] }>): string {
  const colWidth = 240;
  const width = Math.max(800, columns.length * colWidth + 80);
  const height = 620;

  const colElements = columns
    .map((col, idx) => {
      const x = 50 + idx * colWidth;
      const tasksSvg = col.tasks
        .map((task, tIdx) => {
          const y = 140 + tIdx * 56;
          return `
            <g transform="translate(${x + 10}, ${y})">
              <rect x="0" y="-18" width="${colWidth - 30}" height="42" rx="4" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5" filter="url(#cardShadow)"/>
              <circle cx="14" cy="3" r="10" fill="${col.color}" opacity="0.15"/>
              <text x="14" y="7" font-family="'Comic Sans MS', 'Patrick Hand', 'Chalkboard SE', cursive, sans-serif" font-size="11" font-weight="bold" fill="${col.color}" text-anchor="middle">#${tIdx + 1}</text>
              <text x="32" y="7" font-family="'Comic Sans MS', 'Segoe Script', cursive, sans-serif" font-size="13" fill="#1e293b" font-weight="500">${task}</text>
            </g>
          `;
        })
        .join('');

      return `
        <!-- Column ${col.name} -->
        <g>
          <line x1="${x + colWidth - 10}" y1="50" x2="${x + colWidth - 10}" y2="570" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="6,4" />
          <rect x="${x}" y="65" width="${colWidth - 25}" height="44" rx="6" fill="#f8fafc" stroke="#94a3b8" stroke-width="1" />
          <text x="${x + 16}" y="94" font-family="'Comic Sans MS', 'Chalkboard SE', cursive, sans-serif" font-size="20" font-weight="bold" fill="${col.color}">
            ${col.name}
          </text>
          ${tasksSvg}
        </g>
      `;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
      <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.06"/>
      </filter>
      <pattern id="whiteboardTexture" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#fafafa"/>
        <circle cx="20" cy="20" r="0.8" fill="#e2e8f0"/>
      </pattern>
    </defs>
    
    <!-- Whiteboard Frame -->
    <rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="12" fill="#334155" stroke="#1e293b" stroke-width="6"/>
    <!-- Board Surface -->
    <rect x="22" y="22" width="${width - 44}" height="${height - 44}" rx="6" fill="url(#whiteboardTexture)"/>
    
    <!-- Top Tray Marker Details -->
    <rect x="40" y="32" width="180" height="8" rx="4" fill="#cbd5e1"/>
    <text x="50" y="44" font-family="sans-serif" font-size="9" fill="#94a3b8" letter-spacing="1">WEEKLY SPRINT WHITEBOARD</text>

    <!-- Marker tray on bottom -->
    <rect x="${width / 2 - 120}" y="${height - 24}" width="240" height="10" rx="3" fill="#64748b"/>
    <!-- Markers in tray -->
    <rect x="${width / 2 - 90}" y="${height - 29}" width="40" height="6" rx="2" fill="#2563eb"/>
    <rect x="${width / 2 - 40}" y="${height - 29}" width="40" height="6" rx="2" fill="#dc2626"/>
    <rect x="${width / 2 + 10}" y="${height - 29}" width="40" height="6" rx="2" fill="#0f172a"/>
    <rect x="${width / 2 + 60}" y="${height - 29}" width="30" height="8" rx="3" fill="#475569"/>

    ${colElements}
  </svg>`;
}

export interface SampleWhiteboard {
  id: string;
  title: string;
  description: string;
  dataUri: string;
  expectedData: Array<{ name: string; tasks: string[] }>;
}

const sample1Svg = createWhiteboardSvg([
  {
    name: 'Aisha',
    color: '#2563eb',
    tasks: ['Finalize client deck', 'Send weekly report', 'Review Q3 pipeline'],
  },
  {
    name: 'Rohan',
    color: '#059669',
    tasks: ['Fix landing page bug', 'Update Postgres migration', 'Benchmark API latency'],
  },
  {
    name: 'Marcus',
    color: '#d97706',
    tasks: ['Draft hiring spec for Eng', 'Team sprint retro', 'Security audit signoff'],
  },
]);

const sample2Svg = createWhiteboardSvg([
  {
    name: 'Dev Team',
    color: '#7c3aed',
    tasks: ['Deploy v2.4 hotfix', 'Configure Redis cache', 'Run automated E2E tests'],
  },
  {
    name: 'Design',
    color: '#db2777',
    tasks: ['Mobile navigation Figma', 'Export brand icon assets', 'Color contrast review'],
  },
  {
    name: 'Operations',
    color: '#0891b2',
    tasks: ['Office supplies reorder', 'New hire badge setup', 'Sign cloud renewal contract'],
  },
]);

export const SAMPLE_WHITEBOARDS: SampleWhiteboard[] = [
  {
    id: 'sprint-board-1',
    title: 'Sprint Board (Aisha, Rohan, Marcus)',
    description: '3 columns with engineering, client deck, and hiring tasks in priority order.',
    dataUri: `data:image/svg+xml;base64,${Buffer.from(sample1Svg).toString('base64')}`,
    expectedData: [
      { name: 'Aisha', tasks: ['Finalize client deck', 'Send weekly report', 'Review Q3 pipeline'] },
      { name: 'Rohan', tasks: ['Fix landing page bug', 'Update Postgres migration', 'Benchmark API latency'] },
      { name: 'Marcus', tasks: ['Draft hiring spec for Eng', 'Team sprint retro', 'Security audit signoff'] },
    ],
  },
  {
    id: 'team-board-2',
    title: 'Cross-functional Board (Dev, Design, Ops)',
    description: 'Cross-department whiteboard with priority tags and actionable tasks.',
    dataUri: `data:image/svg+xml;base64,${Buffer.from(sample2Svg).toString('base64')}`,
    expectedData: [
      { name: 'Dev Team', tasks: ['Deploy v2.4 hotfix', 'Configure Redis cache', 'Run automated E2E tests'] },
      { name: 'Design', tasks: ['Mobile navigation Figma', 'Export brand icon assets', 'Color contrast review'] },
      { name: 'Operations', tasks: ['Office supplies reorder', 'New hire badge setup', 'Sign cloud renewal contract'] },
    ],
  },
];
