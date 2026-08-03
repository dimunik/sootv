let network = null;
let currentLineage = null;
let selectedNodeId = null;
let dragMovedNode = false;
let suppressNextNodeClick = false;
const bootstrap = window.__SOOTV_BOOTSTRAP__ || { stats: null, orders: [], searchIndex: [] };
const lineageCache = window.__SOOTV_LINEAGES__ || (window.__SOOTV_LINEAGES__ = {});
const getLineage = window.__SOOTV_GET_LINEAGE__ || (() => null);

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const content = document.getElementById('content');
const emptyState = document.getElementById('emptyState');
const selectedEntry = document.getElementById('selectedEntry');
const timeline = document.getElementById('timeline');
const statsEl = document.getElementById('stats');
const orderList = document.getElementById('orderList');

const TYPE_LABELS = { profession: 'Профессия', specialty: 'Специальность', group: 'Группа' };

const ORDER_COLORS = {
  1988: '#57534e',
  1994: '#78716c',
  1999: '#a8a29e',
  2001: '#94a3b8',
  2003: '#64748b',
  2009: '#3b82f6',
  2013: '#8b5cf6',
  2014: '#6366f1',
  2022: '#10b981',
};

const NODE_COLORS = {
  profession: { background: '#f59e0b', border: '#d97706', highlight: { background: '#ef4444', border: '#dc2626' } },
  specialty: { background: '#10b981', border: '#059669', highlight: { background: '#ef4444', border: '#dc2626' } },
  group: { background: '#6366f1', border: '#4f46e5', highlight: { background: '#ef4444', border: '#dc2626' } },
  unknown: { background: '#64748b', border: '#475569', highlight: { background: '#ef4444', border: '#dc2626' } },
};

function loadStats() {
  const { stats, orders } = bootstrap;
  if (!stats) {
    statsEl.innerHTML = '<span><strong>Нет данных</strong>Сначала выполните сборку</span>';
    orderList.innerHTML = '<li>Запустите `npm run build`, затем откройте `public/index.html`.</li>';
    return;
  }

  statsEl.innerHTML = `
    <span><strong>${stats.entries}</strong>записей</span>
    <span><strong>${stats.links}</strong>связей</span>
    <span><strong>${stats.professions}</strong>профессий</span>
    <span><strong>${stats.specialties}</strong>специальностей</span>
  `;

  orderList.innerHTML = orders
    .map((o) => `<li><strong>${o.year}</strong> — ${o.title}</li>`)
    .join('');
}

function getSearchResults(query, limit = 25) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const entries = bootstrap.searchIndex || [];
  const exactCode = entries.filter((entry) => String(entry.code).toLowerCase() === q).slice(0, limit);
  if (exactCode.length > 0) return exactCode;

  const prefixCode = entries
    .filter((entry) => String(entry.code).toLowerCase().startsWith(q))
    .sort((a, b) => {
      if (a.orderYear !== b.orderYear) return b.orderYear - a.orderYear;
      return a.code.localeCompare(b.code, 'ru');
    })
    .slice(0, limit);

  if (prefixCode.length > 0) return prefixCode;

  return entries
    .filter((entry) => String(entry.searchText || '').includes(q))
    .sort((a, b) => {
      if (a.orderYear !== b.orderYear) return b.orderYear - a.orderYear;
      return a.name.localeCompare(b.name, 'ru');
    })
    .slice(0, limit);
}

async function search(query) {
  if (!query.trim()) return;
  const results = getSearchResults(query);

  if (results.length === 0) {
    searchResults.innerHTML = '<div class="result-item"><span>Ничего не найдено</span></div>';
    searchResults.classList.add('visible');
    return;
  }

  searchResults.innerHTML = results
    .map(
      (r) => `
    <div class="result-item" data-id="${r.id}">
      <span class="result-code">${esc(r.code)}</span>
      <span class="result-name">${esc(r.name)}</span>
      <span class="result-meta">
        <span class="badge ${r.entryType}">${TYPE_LABELS[r.entryType] || r.entryType}</span><br>
        ${r.orderYear} г., № ${r.orderNumber}
      </span>
    </div>`
    )
    .join('');

  searchResults.classList.add('visible');

  searchResults.querySelectorAll('.result-item[data-id]').forEach((el) => {
    el.addEventListener('click', () => {
      loadLineage(parseInt(el.dataset.id, 10));
      searchResults.classList.remove('visible');
    });
  });

  if (results.length === 1) {
    loadLineage(results[0].id);
    searchResults.classList.remove('visible');
  }
}

async function loadLineage(entryId) {
  const data = lineageCache[String(entryId)] || getLineage(entryId);
  if (!data) return;

  currentLineage = data;
  selectedNodeId = entryId;

  emptyState.hidden = true;
  content.hidden = false;

  renderSelectedEntry(data.query);
  renderTimeline(data.nodes, entryId);
  renderGraph(data, entryId);
}

function renderSelectedEntry(query) {
  selectedEntry.innerHTML = `
    <h3>Выбранная запись</h3>
    <div class="code">${esc(query.code)}</div>
    <div class="name">${esc(query.name)}</div>
    <span class="badge ${query.entryType}">${TYPE_LABELS[query.entryType] || query.entryType}</span>
    <div class="order-info">${esc(query.orderTitle)} (${query.orderYear})</div>
  `;
}

function renderTimeline(nodes, activeId) {
  const groups = [];
  const byOrder = new Map();

  for (const node of nodes) {
    const key = node.orderId;
    if (!byOrder.has(key)) {
      const group = {
        key,
        orderYear: node.orderYear,
        orderNumber: node.orderNumber,
        nodes: [],
      };
      byOrder.set(key, group);
      groups.push(group);
    }
    byOrder.get(key).nodes.push(node);
  }

  timeline.innerHTML = `
    <h3>Хронология (${nodes.length} записей)</h3>
    ${groups
      .map(
        (group) => `
      <div class="timeline-item ${group.nodes.some((n) => n.id === activeId) ? 'active' : ''}">
        <div class="timeline-year">${group.orderYear} г. — № ${group.orderNumber}</div>
        <div class="timeline-group-entries">
          ${group.nodes
            .map(
              (n) => `
            <div class="timeline-entry ${n.id === activeId ? 'active' : ''}" data-id="${n.id}">
              <div class="timeline-code">${esc(n.code)}</div>
              <div class="timeline-name">${esc(n.name)}</div>
            </div>`
            )
            .join('')}
        </div>
      </div>`
      )
      .join('')}
  `;

  timeline.querySelectorAll('.timeline-entry').forEach((el) => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id, 10);
      highlightNode(id);
    });
  });
}

function renderGraph(data, highlightId) {
  const container = document.getElementById('graph');

  const visNodes = new vis.DataSet(
    data.nodes.map((n) => ({
      id: n.id,
      label: `${n.code}\n${wrapLabelText(n.name)}`,
      title: `<b>${esc(n.code)}</b><br>${esc(n.name)}<br><i>${esc(n.orderTitle)} (${n.orderYear})</i>`,
      color: n.id === highlightId
        ? NODE_COLORS[n.entryType]?.highlight || NODE_COLORS.unknown.highlight
        : NODE_COLORS[n.entryType] || NODE_COLORS.unknown,
      chosen: false,
      font: { color: '#ffffff', size: 12, multi: 'md' },
      borderWidth: n.id === highlightId ? 3 : 1,
      shape: 'box',
      margin: 8,
      widthConstraint: { maximum: 240 },
    }))
  );

  const visEdges = new vis.DataSet(
    data.edges.map((e, i) => ({
      id: i,
      from: e.from,
      to: e.to,
      label: e.mappingYear ? `${e.mappingYear}` : '',
      title: esc(e.mappingTitle),
      arrows: 'to',
      color: { color: ORDER_COLORS[e.mappingYear] || '#4b5563', highlight: '#3b82f6' },
      font: { color: '#5c6b7f', size: 10, strokeWidth: 0 },
      smooth: { type: 'cubicBezier', forceDirection: 'horizontal' },
    }))
  );

  const options = {
    layout: {
      hierarchical: {
        enabled: true,
        direction: 'LR',
        sortMethod: 'directed',
        levelSeparation: 250,
        nodeSpacing: 120,
      },
    },
    physics: { enabled: false },
    interaction: { hover: true, tooltipDelay: 100 },
    edges: { width: 2 },
  };

  if (network) network.destroy();
  network = new vis.Network(container, { nodes: visNodes, edges: visEdges }, options);

  network.on('dragStart', (params) => {
    dragMovedNode = params.nodes.length > 0;
  });

  network.on('dragEnd', () => {
    if (dragMovedNode) {
      // vis may emit click after dragging a node; ignore the first node click after drag.
      suppressNextNodeClick = true;
      dragMovedNode = false;
    }
  });

  network.on('click', (params) => {
    if (suppressNextNodeClick) {
      suppressNextNodeClick = false;
      return;
    }
    if (params.nodes.length > 0) {
      highlightNode(params.nodes[0]);
    }
  });
}

function highlightNode(nodeId) {
  selectedNodeId = nodeId;
  const node = currentLineage.nodes.find((n) => n.id === nodeId);
  if (!node) return;

  renderSelectedEntry({
    code: node.code,
    name: node.name,
    entryType: node.entryType,
    orderTitle: node.orderTitle,
    orderYear: node.orderYear,
  });

  timeline.querySelectorAll('.timeline-item').forEach((el) => {
    el.classList.toggle('active', el.querySelector(`.timeline-entry[data-id="${nodeId}"]`) !== null);
  });

  timeline.querySelectorAll('.timeline-entry').forEach((el) => {
    el.classList.toggle('active', parseInt(el.dataset.id, 10) === nodeId);
  });

  renderGraph(currentLineage, nodeId);

  if (network) {
    network.selectNodes([nodeId]);
    network.focus(nodeId, { scale: 1, animation: true });
  }
}

function esc(text) {
  const d = document.createElement('div');
  d.textContent = text || '';
  return d.innerHTML;
}

function wrapLabelText(text, maxLineLength = 28) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
      continue;
    }

    if (`${currentLine} ${word}`.length <= maxLineLength) {
      currentLine += ` ${word}`;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) lines.push(currentLine);
  return lines.join('\n');
}

searchBtn.addEventListener('click', () => search(searchInput.value));
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') search(searchInput.value);
});

let debounce;
searchInput.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (searchInput.value.length >= 2) search(searchInput.value);
    else searchResults.classList.remove('visible');
  }, 300);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-section')) {
    searchResults.classList.remove('visible');
  }
});

loadStats();
