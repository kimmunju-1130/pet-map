import React, { useState, useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';
import './Dashboard.css';

// ── Data ──────────────────────────────────────────────
const neighborhoods = ['송죽동','연무동','영화동','파장동','조원1동','정자1동','조원2동','정자2동','조원3동'];

const dataSets = {
  '의료건강':  [11, 12, 11, 11,  8, 10,  8,  8, 15],
  '위생':      [10,  9,  8,  6,  7,  6,  6,  5,  6],
  '일반용품':  [ 5,  2,  2,  4,  1,  2,  4,  1,  5],
  '미용돌봄':  [ 2,  2,  2,  2,  2,  1,  1,  6,  1],
  '반려동물수':[1250, 900, 1750, 1650, 800, 1276, 620, 520, 1400],
};

const COLORS = {
  '의료건강':  '#E24B4A',
  '위생':      '#378ADD',
  '일반용품':  '#EF9F27',
  '미용돌봄':  '#D4537E',
  '반려동물수':'#FAC775',
};

const LABELS_KO = {
  '의료건강': '병원',
  '위생':     '위생',
  '일반용품': '용품',
  '미용돌봄': '돌봄',
  '반려동물수':'반려동물수',
};

const BAR_KEYS = ['의료건강','위생','일반용품','미용돌봄'];

// ── Data labels plugin ─────────────────────────────────
const dataLabelPlugin = {
  id: 'dataLabels',
  afterDatasetsDraw(chart, _, opts) {
    if (!opts.show) return;
    const ctx = chart.ctx;
    chart.data.datasets.forEach((ds, i) => {
      if (ds.hidden || ds.type === 'line') return;
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach((bar, j) => {
        const val = ds.data[j];
        if (!val) return;
        ctx.save();
        ctx.fillStyle = '#1A1A1A';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(val, bar.x, bar.y - 2);
        ctx.restore();
      });
    });
  },
};

export default function Dashboard() {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  const [showLabels,   setShowLabels]   = useState(true);
  const [showLegend,   setShowLegend]   = useState(true);
  const [activeFilters, setActiveFilters] = useState(new Set(BAR_KEYS));
  const [selectedIdx,  setSelectedIdx]  = useState(null);
  const [starPos,      setStarPos]      = useState(null);

  // score state
  const [scoreInfo, setScoreInfo] = useState({
    status: 'Not Recommended',
    risk:   'High',
    score:  60,
    animals:'1,276마리',
    isGood: false,
  });

  // ── Build datasets ───────────────────────────────────
  function buildDatasets(filters) {
    return [
      { type:'bar',  label:'의료건강',  data:dataSets['의료건강'],  backgroundColor:COLORS['의료건강'],  yAxisID:'y', order:4, borderRadius:2, hidden:!filters.has('의료건강') },
      { type:'bar',  label:'위생',      data:dataSets['위생'],      backgroundColor:COLORS['위생'],      yAxisID:'y', order:3, borderRadius:2, hidden:!filters.has('위생') },
      { type:'bar',  label:'일반용품',  data:dataSets['일반용품'],  backgroundColor:COLORS['일반용품'],  yAxisID:'y', order:2, borderRadius:2, hidden:!filters.has('일반용품') },
      { type:'bar',  label:'미용돌봄',  data:dataSets['미용돌봄'],  backgroundColor:COLORS['미용돌봄'],  yAxisID:'y', order:1, borderRadius:2, hidden:!filters.has('미용돌봄') },
      {
        type:'line', label:'반려동물수', data:dataSets['반려동물수'],
        borderColor:COLORS['반려동물수'], backgroundColor:COLORS['반려동물수'],
        pointBackgroundColor:COLORS['반려동물수'], pointBorderColor:'#fff',
        pointBorderWidth:2, pointRadius:7, pointStyle:'rectRot',
        tension:0.35, yAxisID:'y1', order:0, borderWidth:2.5,
      },
    ];
  }

  // ── Score calc ───────────────────────────────────────
  function calcScore(idx, filters) {
    if (idx === null) return;
    const keys = [...filters];
    const animals = dataSets['반려동물수'][idx];
    const score = keys.reduce((s, k) => s + (dataSets[k]?.[idx] || 0), 0);
    const maxPossible = keys.reduce((s, k) => {
      return s + (dataSets[k] ? Math.max(...dataSets[k]) : 0);
    }, 0);
    const normalized = maxPossible > 0 ? Math.round((score / maxPossible) * 100) : 0;
    const isGood = normalized >= 60;
    setScoreInfo({
      status:  isGood ? 'Recommended' : 'Not Recommended',
      risk:    isGood ? 'Low' : 'High',
      score:   normalized,
      animals: animals.toLocaleString() + '마리',
      isGood,
    });
  }

  // ── Init chart ───────────────────────────────────────
  useEffect(() => {
    Chart.register(dataLabelPlugin);
    const chart = new Chart(canvasRef.current, {
      data: { labels: neighborhoods, datasets: buildDatasets(activeFilters) },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          dataLabels: { show: showLabels },
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => items[0].label,
              label: (item) => {
                const lbl = item.dataset.label;
                const unit = lbl === '반려동물수' ? '마리' : '개';
                return ` ${LABELS_KO[lbl] || lbl}: ${item.raw.toLocaleString()}${unit}`;
              },
            },
            displayColors: true, boxWidth: 10, boxHeight: 10, padding: 10,
            backgroundColor: 'rgba(40,40,40,0.92)',
            titleFont: { weight: 'bold', size: 13 }, bodyFont: { size: 13 },
            titleColor: '#fff', bodyColor: '#fff',
          },
        },
        scales: {
          y: {
            type:'linear', position:'left',
            title: { display:true, text:'단위 : 개', align:'start', font:{size:11}, color:'#888' },
            min:0, max:20,
            ticks: { stepSize:5, font:{size:11}, color:'#666' },
            grid:  { color:'rgba(0,0,0,0.06)' },
          },
          y1: {
            type:'linear', position:'right',
            title: { display:true, text:'단위 : 마리', align:'start', font:{size:11}, color:'#888' },
            min:0, max:2000,
            ticks: { stepSize:500, font:{size:11}, color:'#666', callback: v => v.toLocaleString() },
            grid:  { drawOnChartArea:false },
          },
          x: {
            ticks: { autoSkip:false, font:{size:12}, color:'#333' },
            grid:  { display:false },
          },
        },
        animation: { duration: 350 },
        onClick: (e, elements) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          setSelectedIdx(idx);
          const meta = chart.getDatasetMeta(0);
          const bar  = meta.data[idx];
          setStarPos({ left: bar.x - 50, top: 20 });
          calcScore(idx, activeFilters);
        },
      },
    });
    chartRef.current = chart;
    return () => chart.destroy();
    // eslint-disable-next-line
  }, []);

  // ── Sync showLabels ──────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.options.plugins.dataLabels.show = showLabels;
    chartRef.current.update();
  }, [showLabels]);

  // ── Sync activeFilters → chart + score ───────────────
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.data.datasets.forEach(ds => {
      if (ds.label !== '반려동물수') ds.hidden = !activeFilters.has(ds.label);
    });
    chartRef.current.update();
    calcScore(selectedIdx, activeFilters);
    // eslint-disable-next-line
  }, [activeFilters, selectedIdx]);

  // ── Toggle chip ──────────────────────────────────────
  function toggleChip(lbl) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      next.has(lbl) ? next.delete(lbl) : next.add(lbl);
      return next;
    });
  }

  // ── Download ─────────────────────────────────────────
  function handleDownload() {
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = 'paw-data-chart.png';
    a.click();
  }

  const chips = [
    { label:'의료건강', color:'#E24B4A', textColor:'#C43C3B', icon:'🏥' },
    { label:'위생',     color:'#378ADD', textColor:'#1A5FA5', icon:'💧' },
    { label:'일반용품', color:'#EF9F27', textColor:'#A06010', icon:'🦴' },
    { label:'미용돌봄', color:'#D4537E', textColor:'#9B3560', icon:'🐾' },
  ];

  return (
    <>
      <div className="db-main">

        {/* Left panel */}
        <div className="db-left">

          {/* Controls */}
          <div className="db-card">
            <label className="db-toggle-row">
              <ToggleSwitch checked={showLabels} onChange={setShowLabels} />
              Show chart labels
            </label>
            <label className="db-toggle-row">
              <ToggleSwitch checked={showLegend} onChange={setShowLegend} />
              Legend Filters
            </label>

            {showLegend && (
              <div className="db-legend-section">
                <div className="db-legend-label">Apply Legend Filters (Toggle):</div>
                <div className="db-chips">
                  {chips.map(({ label, color, textColor, icon }) => (
                    <div
                      key={label}
                      className={`db-chip ${activeFilters.has(label) ? 'active' : 'inactive'}`}
                      style={{ color: textColor }}
                      onClick={() => toggleChip(label)}
                    >
                      <span className="db-chip-dot" style={{ background: color }} />
                      {icon} {label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Score card */}
          <div className="db-card">
            <div className="db-score-title">Business Location Score</div>
            <div className="db-score-sub">Overall: recommended/not recommended</div>
            <div className="db-dog-area">
              <img
                src={scoreInfo.isGood ? '/face-good.png' : '/face-bad.png'}
                alt="score"
                style={{ width: 140, height: 140, objectFit: 'contain' }}
              />
            </div>
            <div
              className="db-score-result"
              style={{
                background:    scoreInfo.isGood ? '#F0FFF4' : '#FFF5F5',
                borderLeftColor: scoreInfo.isGood ? '#2E7D32' : '#E24B4A',
              }}
            >
              <div className="db-res-row">
                <span className="db-res-label">Location: </span>
                <span className={scoreInfo.isGood ? 'db-res-good' : 'db-res-bad'}>
                  {scoreInfo.status}
                </span>
              </div>
              <div className="db-res-row">
                <span className="db-res-label">Risk Level: </span>
                <span className={scoreInfo.isGood ? 'db-res-good' : 'db-res-bad'}>
                  {scoreInfo.risk}
                </span>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="db-summary-cards">
            <div className="db-s-card">
              <div className="db-s-lbl">Summary</div>
              <div className="db-s-val">공원</div>
            </div>
            <div className="db-s-card">
              <div className="db-s-lbl">Risk Level</div>
              <div className="db-s-val">{scoreInfo.score}</div>
            </div>
            <div className="db-s-card">
              <div className="db-s-lbl">반려동물</div>
              <div className="db-s-val">{scoreInfo.animals}</div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="db-right">
          <div className="db-chart-controls">
            <button className="db-icon-btn" title="차트 저장" onClick={handleDownload}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v8M5 7l3 3 3-3M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <button className="db-icon-btn" title="도움말"
              onClick={() => alert('각 행정동별 반려동물 관련 시설 수(개)와 반려동물 수(마리)를 나타냅니다.')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M6.5 6c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5c0 1-1.5 1.5-1.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <circle cx="8" cy="11" r=".7" fill="currentColor"/>
              </svg>
            </button>
          </div>

          <div className="db-chart-scroll">
            <div className="db-chart-inner">
              <canvas ref={canvasRef}
                role="img"
                aria-label="행정동별 반려동물 관련 시설 수와 반려동물 수 복합 차트"
              />
              {starPos && (
                <div className="db-star" style={{ left: starPos.left, top: starPos.top }}>
                  <svg width="22" height="22" viewBox="0 0 22 22">
                    <polygon points="11,2 13.5,8.5 20.5,8.5 14.8,13 17,20 11,16 5,20 7.2,13 1.5,8.5 8.5,8.5" fill="#1A1A1A"/>
                  </svg>
                  <div className="db-star-label">Recommendation:<br/>강남구 (예시)</div>
                </div>
              )}
            </div>
          </div>

          <div className="db-chart-legend">
            {[
              { label:'미용돌봄',   color:'#D4537E', type:'circle' },
              { label:'위생',       color:'#378ADD', type:'circle' },
              { label:'의료건강',   color:'#E24B4A', type:'circle' },
              { label:'일반용품',   color:'#EF9F27', type:'circle' },
              { label:'반려동물수', color:'#FAC775', type:'diamond' },
            ].map(({ label, color, type }) => (
              <div key={label} className="db-cl-item">
                <span
                  className={type === 'diamond' ? 'db-cl-diamond' : 'db-cl-circle'}
                  style={{ background: color }}
                />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────
function ToggleSwitch({ checked, onChange }) {
  return (
    <span className="db-toggle-switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="db-toggle-track" />
    </span>
  );
}

function DogSVG() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
      <ellipse cx="16" cy="14" rx="7" ry="11" fill="#D4A574" transform="rotate(-20 16 14)"/>
      <ellipse cx="36" cy="14" rx="7" ry="11" fill="#D4A574" transform="rotate(20 36 14)"/>
      <circle cx="26" cy="28" r="18" fill="#F5E6D3"/>
      <circle cx="19" cy="27" r="5" fill="white" stroke="#888" strokeWidth="1.5"/>
      <circle cx="33" cy="27" r="5" fill="white" stroke="#888" strokeWidth="1.5"/>
      <circle cx="19" cy="27" r="2.5" fill="#2A2A2A"/>
      <circle cx="33" cy="27" r="2.5" fill="#2A2A2A"/>
      <line x1="24" y1="27" x2="28" y2="27" stroke="#888" strokeWidth="1.5"/>
      <ellipse cx="26" cy="33" rx="4" ry="2.5" fill="#E87AB0"/>
      <ellipse cx="26" cy="45" rx="9" ry="5" fill="#F5E6D3"/>
    </svg>
  );
}

function PawSVG({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <ellipse cx="18" cy="22" rx="8" ry="7" fill="#1A1A1A"/>
      <ellipse cx="9" cy="14" rx="4" ry="5.5" fill="#1A1A1A" transform="rotate(-15 9 14)"/>
      <ellipse cx="27" cy="14" rx="4" ry="5.5" fill="#1A1A1A" transform="rotate(15 27 14)"/>
      <ellipse cx="14" cy="11" rx="3.5" ry="5" fill="#1A1A1A" transform="rotate(-8 14 11)"/>
      <ellipse cx="22" cy="11" rx="3.5" ry="5" fill="#1A1A1A" transform="rotate(8 22 11)"/>
    </svg>
  );
}

function ScoreDogSVG() {
  return (
    <svg width="160" height="155" viewBox="0 0 160 155" fill="none">
      <circle cx="120" cy="30" r="22" fill="#F0EEEB" stroke="#CCC" strokeWidth="1"/>
      <circle cx="105" cy="50" r="7" fill="#F0EEEB" stroke="#CCC" strokeWidth="1"/>
      <circle cx="97" cy="62" r="4" fill="#F0EEEB" stroke="#CCC" strokeWidth="1"/>
      <circle cx="116" cy="27" r="7" fill="none" stroke="#D4537E" strokeWidth="2"/>
      <line x1="121" y1="32" x2="127" y2="38" stroke="#D4537E" strokeWidth="2" strokeLinecap="round"/>
      <line x1="118" y1="22" x2="126" y2="22" stroke="#EF9F27" strokeWidth="2"/>
      <circle cx="117" cy="21" r="2.5" fill="#EF9F27"/>
      <circle cx="117" cy="23" r="2.5" fill="#EF9F27"/>
      <circle cx="127" cy="21" r="2.5" fill="#EF9F27"/>
      <circle cx="127" cy="23" r="2.5" fill="#EF9F27"/>
      <ellipse cx="52" cy="46" rx="9" ry="16" fill="#D4A574" stroke="#C08050" strokeWidth="1" transform="rotate(-20 52 46)"/>
      <ellipse cx="83" cy="46" rx="9" ry="16" fill="#D4A574" stroke="#C08050" strokeWidth="1" transform="rotate(20 83 46)"/>
      <circle cx="67" cy="65" r="26" fill="#F5E6D3" stroke="#D4A070" strokeWidth="1.2"/>
      <circle cx="57" cy="64" r="9" fill="white" stroke="#555" strokeWidth="2"/>
      <circle cx="77" cy="64" r="9" fill="white" stroke="#555" strokeWidth="2"/>
      <line x1="66" y1="64" x2="68" y2="64" stroke="#555" strokeWidth="1.8"/>
      <line x1="40" y1="62" x2="48" y2="63" stroke="#555" strokeWidth="1.8"/>
      <line x1="86" y1="63" x2="94" y2="61" stroke="#555" strokeWidth="1.8"/>
      <circle cx="57" cy="64" r="3.5" fill="#2A2A2A"/>
      <circle cx="77" cy="64" r="3.5" fill="#2A2A2A"/>
      <circle cx="55.5" cy="62.5" r="1" fill="white"/>
      <circle cx="75.5" cy="62.5" r="1" fill="white"/>
      <ellipse cx="67" cy="73" rx="4.5" ry="3" fill="#E87AB0"/>
      <path d="M 61 77 Q 67 82 73 77" fill="none" stroke="#D4A070" strokeWidth="1.5" strokeLinecap="round"/>
      <ellipse cx="67" cy="115" rx="22" ry="16" fill="#F5E6D3" stroke="#D4A070" strokeWidth="1.2"/>
      <rect x="52" y="124" width="8" height="18" rx="4" fill="#F5E6D3" stroke="#D4A070" strokeWidth="1"/>
      <rect x="75" y="124" width="8" height="18" rx="4" fill="#F5E6D3" stroke="#D4A070" strokeWidth="1"/>
      <path d="M 89 108 Q 105 95 100 110" fill="none" stroke="#D4A574" strokeWidth="4" strokeLinecap="round"/>
      <rect x="30" y="102" width="4" height="48" rx="2" fill="#A07830"/>
      <rect x="8" y="82" width="40" height="30" rx="6" fill="white" stroke="#E24B4A" strokeWidth="2.5"/>
      <line x1="17" y1="90" x2="38" y2="104" stroke="#E24B4A" strokeWidth="3" strokeLinecap="round"/>
      <line x1="38" y1="90" x2="17" y2="104" stroke="#E24B4A" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}
