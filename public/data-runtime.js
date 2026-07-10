window.__RAW_PARSED_DATA__ = window.__RAW_PARSED_DATA__ || {};
window.__SOOTV_LINEAGES__ = window.__SOOTV_LINEAGES__ || {};

(function bootstrapSootvData() {
  const RAW = window.__RAW_PARSED_DATA__;
  const LEGACY_LINKS = window.__SOOTV_LEGACY_LINKS__ || {};

  const ORDERS = {
    ok_009_2003: {
      id: 'ok_009_2003',
      year: 2003,
      number: '276-СТ',
      title: 'ОК 009-2003 (классификатор специальностей)',
      side: 'target',
    },
    npo_1362: {
      id: 'npo_1362',
      year: 1999,
      number: '1362',
      title: 'Постановление Правительства РФ № 1362 (профессии НПО)',
      side: 'target',
    },
    order_354_2009: {
      id: 'order_354_2009',
      year: 2009,
      number: '354',
      title: 'Приказ МОиН № 354 (профессии НПО)',
      side: 'source',
    },
    order_355_2009: {
      id: 'order_355_2009',
      year: 2009,
      number: '355',
      title: 'Приказ МОиН № 355 (специальности СПО)',
      side: 'source',
    },
    order_1199_2013: {
      id: 'order_1199_2013',
      year: 2013,
      number: '1199',
      title: 'Приказ МОиН № 1199 (профессии и специальности СПО)',
      side: 'middle',
    },
    order_336_2022: {
      id: 'order_336_2022',
      year: 2022,
      number: '336',
      title: 'Приказ Минпросвещения № 336 (профессии и специальности СПО)',
      side: 'current',
    },
  };

  const MAPPINGS = {
    order_740_2009: {
      id: 'order_740_2009',
      year: 2009,
      number: '740',
      title: 'Приказ МОиН № 740',
      fromOrder: 'order_354_2009',
      toOrder: 'npo_1362',
      entryType: 'profession',
    },
    order_835_2009: {
      id: 'order_835_2009',
      year: 2009,
      number: '835',
      title: 'Приказ МОиН № 835',
      fromOrder: 'order_355_2009',
      toOrder: 'ok_009_2003',
      entryType: 'specialty',
    },
    order_632_2014_prof: {
      id: 'order_632_2014_prof',
      year: 2014,
      number: '632',
      title: 'Приказ МОиН № 632 (прил. 1 - профессии)',
      fromOrder: 'order_1199_2013',
      toOrder: 'order_354_2009',
      entryType: 'profession',
    },
    order_632_2014_spec: {
      id: 'order_632_2014_spec',
      year: 2014,
      number: '632',
      title: 'Приказ МОиН № 632 (прил. 2 - специальности)',
      fromOrder: 'order_1199_2013',
      toOrder: 'order_355_2009',
      entryType: 'specialty',
    },
    order_336_2022_prof: {
      id: 'order_336_2022_prof',
      year: 2022,
      number: '336',
      title: 'Приказ Минпросвещения № 336 (профессии)',
      fromOrder: 'order_336_2022',
      toOrder: 'order_1199_2013',
      entryType: 'profession',
    },
    order_336_2022_spec: {
      id: 'order_336_2022_spec',
      year: 2022,
      number: '336',
      title: 'Приказ Минпросвещения № 336 (специальности)',
      fromOrder: 'order_336_2022',
      toOrder: 'order_1199_2013',
      entryType: 'specialty',
    },
  };

  const linkOrder = [
    'order_740_2009',
    'order_835_2009',
    'order_632_2014_prof',
    'order_632_2014_spec',
    'order_336_2022_prof',
    'order_336_2022_spec',
  ];

  function normalizeName(name) {
    return String(name || '')
      .replace(/\s+/g, ' ')
      .replace(/\(в ред\..*?\)/gi, '')
      .replace(/Утратило силу\..*/gi, '')
      .replace(/Приказа?$/gi, '')
      .trim();
  }

  function isCode(text) {
    if (!text) return false;
    const t = String(text).trim();
    return (
      /^\d{2}\.\d{2}\.\d{2}$/.test(t) ||
      /^\d{2}\.\d{2}\.00$/.test(t) ||
      /^\d{6}(\.\d{2})?$/.test(t) ||
      /^\d{1,2}\.\d{1,2}(\.\d+)?$/.test(t)
    );
  }

  function isGroupCode(code) {
    if (!code) return false;
    return code.endsWith('.00') || (code.length === 6 && code.endsWith('00') && !code.includes('.'));
  }

  function parseNpo1362Cell(text) {
    const t = String(text || '').trim();
    const match = t.match(/^(\d{1,2}\.\d{1,2}(?:\.\d+)?)\.?\s*(.*)$/);
    if (match) {
      return { code: match[1], name: match[2].trim() };
    }
    return { code: '', name: t };
  }

  function isRevisionRow(row) {
    if (!row || row.length === 0) return true;
    if (row.length === 1) return true;
    return /\(в ред\.|Утратило силу/i.test(row.join(' '));
  }

  function isSectionHeader(leftName, rightName, leftCode, rightCode) {
    if (leftCode || rightCode) return false;
    if (!leftName) return true;
    if (!rightName && leftName === leftName.toUpperCase() && leftName.length > 3) return true;
    return false;
  }

  function parseNameMappingTable(rows, mappingId, mappingMeta, options) {
    const parseRightCode = options && options.parseRightCode;
    const links = [];

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (isRevisionRow(row)) continue;
      if (!row || row.length !== 4) continue;

      let leftCode = String(row[0] || '').trim();
      let leftName = normalizeName(row[1]);
      let rightCode = String(row[2] || '').trim();
      let rightName = normalizeName(row[3]);

      if (parseRightCode && !rightCode && rightName) {
        const parsed = parseRightCode(rightName);
        if (parsed.code) {
          rightCode = parsed.code;
          rightName = parsed.name || rightName;
        }
      }

      if (isSectionHeader(leftName, rightName, leftCode, rightCode)) continue;
      if (!leftName || !rightName) continue;
      if (isGroupCode(leftCode)) continue;

      links.push({
        mappingId,
        from: {
          orderId: mappingMeta.fromOrder,
          code: leftCode,
          name: leftName,
          type: mappingMeta.entryType,
        },
        to: {
          orderId: mappingMeta.toOrder,
          code: rightCode,
          name: rightName,
          type: mappingMeta.entryType,
        },
        matchByName: !isCode(leftCode) && !isCode(rightCode),
      });
    }

    return links;
  }

  function parseTableMapping(rows, mappingId, mappingMeta, skipHeader) {
    const links = [];
    const startIdx = skipHeader === false ? 0 : 1;

    for (let i = startIdx; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      if (row.length === 1) continue;
      if (row[0] && row[0].includes('в ред.')) continue;
      if (row[1] && row[1].includes('Утратило силу')) continue;

      const newCode = String(row[0] || '').trim();
      const newName = normalizeName(row[1]);
      const oldCode = String(row[2] || '').trim();
      const oldName = normalizeName(row[3] || row[2]);

      if (!newCode && !newName) continue;
      if (isGroupCode(newCode) || (newCode.endsWith('.00') && !oldCode)) continue;
      if (!isCode(newCode) && newName && newName === newName.toUpperCase() && newName.length > 10) continue;
      if (!isCode(newCode)) continue;

      if (oldCode && isCode(oldCode)) {
        links.push({
          mappingId,
          from: { orderId: mappingMeta.fromOrder, code: newCode, name: newName, type: mappingMeta.entryType },
          to: { orderId: mappingMeta.toOrder, code: oldCode, name: oldName, type: mappingMeta.entryType },
        });
      } else if (oldName) {
        links.push({
          mappingId,
          from: { orderId: mappingMeta.fromOrder, code: newCode, name: newName, type: mappingMeta.entryType },
          to: { orderId: mappingMeta.toOrder, code: oldCode || oldName, name: oldName, type: mappingMeta.entryType },
          matchByName: !oldCode,
        });
      } else if (newName && mappingMeta.toOrder === mappingMeta.fromOrder) {
        links.push({
          mappingId,
          from: { orderId: mappingMeta.fromOrder, code: newCode, name: newName, type: mappingMeta.entryType },
          to: { orderId: mappingMeta.toOrder, code: newCode, name: newName, type: mappingMeta.entryType },
          identity: true,
        });
      }
    }

    return links;
  }

  function parseAll() {
    const data632 = RAW['2014 632'] || { tables: [] };
    const data336 = RAW['2022 336'] || { tables: [] };

    return {
      orders: ORDERS,
      mappings: MAPPINGS,
      links: [
        ...(LEGACY_LINKS.order_740_2009 || []),
        ...(LEGACY_LINKS.order_835_2009 || []),
        ...parseTableMapping(data632.tables[2] || [], 'order_632_2014_prof', MAPPINGS.order_632_2014_prof),
        ...parseTableMapping(data632.tables[3] || [], 'order_632_2014_spec', MAPPINGS.order_632_2014_spec),
        ...parseTableMapping(data336.tables[2] || [], 'order_336_2022_prof', MAPPINGS.order_336_2022_prof),
        ...parseTableMapping(data336.tables[4] || [], 'order_336_2022_spec', MAPPINGS.order_336_2022_spec),
      ],
    };
  }

  function buildInMemoryDataset() {
    const parsed = parseAll();
    const orders = parsed.orders;
    const links = parsed.links
      .slice()
      .sort((a, b) => linkOrder.indexOf(a.mappingId) - linkOrder.indexOf(b.mappingId));

    let nextEntryId = 1;
    const entryMap = new Map();
    const nameIndex = new Map();
    const entriesById = new Map();
    const graphLinks = [];
    const adjacency = new Map();

    function entryKey(orderId, code, name) {
      return `${orderId}::${code || ''}::${normalizeName(name)}`;
    }

    function getOrderMeta(orderId) {
      return orders[orderId];
    }

    function getOrCreateEntry(orderId, code, name, entryType) {
      const normName = normalizeName(name);
      const key = entryKey(orderId, code, normName);
      if (entryMap.has(key)) return entryMap.get(key);

      const existing = nameIndex.get(orderId)?.get(normName);
      if (existing) {
        const existingEntry = entriesById.get(existing.id);
        const incomingHasCode = isValidCode(code);
        const existingHasCode = isValidCode(existingEntry.code);

        // Merge only when one side is missing a real code; keep distinct rows when both codes are real.
        if (!incomingHasCode || !existingHasCode) {
          if (incomingHasCode && !existingHasCode) {
            existingEntry.code = code;
            existingEntry.searchText = `${code} ${existingEntry.name}`.toLowerCase();
          }

          entryMap.set(key, existing.id);
          entryMap.set(entryKey(orderId, existingEntry.code, normName), existing.id);
          return existing.id;
        }
      }

      const order = getOrderMeta(orderId);
      const entry = {
        id: nextEntryId,
        orderId,
        code: code || normName,
        name: normName,
        entryType,
        searchText: `${code || normName} ${normName}`.toLowerCase(),
        orderYear: order.year,
        orderNumber: order.number,
        orderTitle: order.title,
      };

      entryMap.set(key, nextEntryId);
      entriesById.set(nextEntryId, entry);
      nextEntryId += 1;
      return entry.id;
    }

    function isValidCode(code) {
      return !!(code && /^\d/.test(code) && code.length <= 15);
    }

    function resolveEntry(side, link) {
      let code = side.code;
      let name = side.name;

      if (link.matchByName && !isValidCode(code)) {
        const orderNames = nameIndex.get(side.orderId);
        if (orderNames) {
          const norm = normalizeName(name).toLowerCase();
          const found = orderNames.get(norm);
          if (found) {
            code = found.code;
            name = found.name;
          }
        }
      }

      const id = getOrCreateEntry(side.orderId, code, name, side.type);

      if (!nameIndex.has(side.orderId)) nameIndex.set(side.orderId, new Map());
      const norm = normalizeName(name).toLowerCase();
      const existing = nameIndex.get(side.orderId).get(norm);
      if (!existing || (isValidCode(code) && !isValidCode(existing.code))) {
        nameIndex.get(side.orderId).set(norm, { code, name, id });
      }

      return id;
    }

    function addAdjacency(from, to, edgeIndex) {
      if (!adjacency.has(from)) adjacency.set(from, []);
      if (!adjacency.has(to)) adjacency.set(to, []);
      adjacency.get(from).push(edgeIndex);
      adjacency.get(to).push(edgeIndex);
    }

    for (const link of links) {
      if (link.identity) continue;
      const fromId = resolveEntry(link.from, link);
      const toId = resolveEntry(link.to, link);
      if (fromId === toId) continue;

      const edge = {
        from: fromId,
        to: toId,
        mappingId: link.mappingId,
        mappingTitle: MAPPINGS[link.mappingId].title,
        mappingYear: MAPPINGS[link.mappingId].year,
      };

      graphLinks.push(edge);
      addAdjacency(fromId, toId, graphLinks.length - 1);
    }

    const orderList = Object.values(orders).sort((a, b) => a.year - b.year);
    const allEntries = Array.from(entriesById.values());
    const searchIndex = allEntries
      .filter((entry) => entry.entryType !== 'group')
      .sort((a, b) => {
        if (a.orderYear !== b.orderYear) return b.orderYear - a.orderYear;
        return a.name.localeCompare(b.name, 'ru');
      });

    return {
      orders: orderList,
      entriesById,
      graphLinks,
      adjacency,
      searchIndex,
      stats: {
        orders: orderList.length,
        entries: allEntries.length,
        links: graphLinks.length,
        professions: allEntries.filter((entry) => entry.entryType === 'profession').length,
        specialties: allEntries.filter((entry) => entry.entryType === 'specialty').length,
      },
    };
  }

  function buildLineage(dataset, entryId) {
    const visited = new Set();
    const nodes = new Map();
    const edges = [];
    const edgeSeen = new Set();
    const queue = [entryId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const entry = dataset.entriesById.get(currentId);
      if (!entry) continue;

      nodes.set(currentId, {
        id: entry.id,
        orderId: entry.orderId,
        orderYear: entry.orderYear,
        orderNumber: entry.orderNumber,
        orderTitle: entry.orderTitle,
        code: entry.code,
        name: entry.name,
        entryType: entry.entryType,
        label: `${entry.code}\n${entry.name}`,
      });

      const edgeIndexes = dataset.adjacency.get(currentId) || [];
      for (const edgeIndex of edgeIndexes) {
        const edge = dataset.graphLinks[edgeIndex];
        const otherId = edge.from === currentId ? edge.to : edge.from;
        const edgeKey = [Math.min(edge.from, edge.to), Math.max(edge.from, edge.to), edge.mappingId].join('-');
        if (!edgeSeen.has(edgeKey)) {
          edgeSeen.add(edgeKey);
          edges.push({
            from: edge.from,
            to: edge.to,
            mappingId: edge.mappingId,
            mappingTitle: edge.mappingTitle,
            mappingYear: edge.mappingYear,
            label: `Приказ № ${edge.mappingYear}`,
          });
        }
        if (!visited.has(otherId)) queue.push(otherId);
      }
    }

    const nodeList = Array.from(nodes.values()).sort((a, b) => {
      if (a.orderYear !== b.orderYear) return a.orderYear - b.orderYear;
      return a.code.localeCompare(b.code, 'ru');
    });

    const query = dataset.entriesById.get(entryId);
    if (!query) return null;

    return {
      query: {
        id: query.id,
        code: query.code,
        name: query.name,
        entryType: query.entryType,
        orderYear: query.orderYear,
        orderTitle: query.orderTitle,
      },
      nodes: nodeList,
      edges,
    };
  }

  const dataset = buildInMemoryDataset();
  window.__SOOTV_BOOTSTRAP__ = {
    stats: dataset.stats,
    orders: dataset.orders,
    searchIndex: dataset.searchIndex,
  };
  window.__SOOTV_DATASET__ = dataset;
  window.__SOOTV_GET_LINEAGE__ = function getLineage(entryId) {
    const key = String(entryId);
    if (!window.__SOOTV_LINEAGES__[key]) {
      window.__SOOTV_LINEAGES__[key] = buildLineage(dataset, Number(entryId));
    }
    return window.__SOOTV_LINEAGES__[key];
  };
})();
