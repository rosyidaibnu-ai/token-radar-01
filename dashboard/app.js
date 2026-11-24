// Token Radar's dashboard, version radar-2. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail drawer with the model's own inputs and the protocol's farm plan,
// and a model sandbox that recomputes the board from the same arithmetic. No network:
// every byte it shows is in data.js. The sandbox never changes the submitted board.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var MODEL = DATA.model;
  var state = readHash();
  state.sandbox = { growth_weight: MODEL.growth_weight, maturity_range: MODEL.maturity_range };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // The model in one function: the page recomputes a row from the snapshot figures and
  // checks the number board.json carries, so the page's code and the board's data are
  // visibly the same arithmetic. The sandbox runs this with its own constants.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity));
  }
  function sandboxActive() {
    return state.sandbox.growth_weight !== MODEL.growth_weight || state.sandbox.maturity_range !== MODEL.maturity_range;
  }
  function sandboxModel() {
    return {
      growth_weight: state.sandbox.growth_weight, growth_floor: MODEL.growth_floor, growth_cap: MODEL.growth_cap,
      maturity_floor: MODEL.maturity_floor, maturity_range: state.sandbox.maturity_range,
      maturity_days: MODEL.maturity_days, unknown_age_days: MODEL.unknown_age_days
    };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains,
  // TVL and age decide the action, the capital, the hold and every cost and time.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasNote(chain) {
    if (chain === 'Ethereum') return 'about $8 of gas on Ethereum';
    return 'under $1 of gas on ' + chain;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one small market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the protocol\'s yield-bearing asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('liquid') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and keep the receipt token.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Make one qualifying action each week, such as a supply top-up, a borrow or a repayment.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Make one qualifying action each week, such as a swap, a liquidity top-up or a fee claim.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0) return 'Make one qualifying action each week, such as a small trade, a funding payment or a position adjustment.';
    if (c.indexOf('prediction') >= 0) return 'Make one qualifying action each week, such as one small market position.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Make one qualifying action each week, such as a vault deposit or a reallocation vote.';
    if (c.indexOf('bridge') >= 0) return 'Make one qualifying action each week, such as one bridge transfer or one swap on the destination chain.';
    return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
  }
  function stepText(text, cost, time) {
    var s = text + ' Cost: ' + cost + '. Time: ' + time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasNote(chain);
    return [
      stepText('Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'),
      stepText(actionFor(p, capital, chain), '$' + capital + ' of capital and ' + gas, '15 minutes to set up'),
      stepText(weeklyFor(p), 'about $2 of gas a week', '10 minutes a week'),
      stepText('Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + capital + ' stays in the position', hold + ' days'),
      stepText('Before you withdraw, open the protocol\'s own points or rewards page from the link it publishes, and claim only there.', 'no fee to check, and never pay anyone to claim', '10 minutes'),
      stepText('Write the wallet, the dates and every transaction hash in a farm log, then unwind in steps and keep enough gas to exit.', 'nothing but the log', '5 minutes')
    ];
  }

  function readHash() {
    var out = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return out;
    raw.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'q') out.q = v;
      else if (k === 'cat') out.category = v;
      else if (k === 'chain') out.chain = v;
      else if (k === 'tab' && (v === 'pre-token' || v === 'live')) out.tab = v;
      else if (k === 'sort') out.sort = v;
      else if (k === 'dir') out.dir = v === '1' ? 1 : -1;
      else if (k === 'sel') out.selected = v || null;
    });
    return out;
  }
  function writeHash() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('cat=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.tab !== 'pre-token') parts.push('tab=' + state.tab);
    if (state.sort !== 'implied' || state.dir !== -1) { parts.push('sort=' + state.sort); parts.push('dir=' + state.dir); }
    if (state.selected) parts.push('sel=' + encodeURIComponent(state.selected));
    var h = parts.length ? '#' + parts.join('&') : '#';
    if (window.location.hash !== h) window.history.replaceState(null, '', h);
  }

  function visibleRows() {
    var list = state.tab === 'live' ? DATA.live.slice() : DATA.rows.slice();
    var q = state.q.trim().toLowerCase();
    if (q) {
      list = list.filter(function (r) {
        return (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    if (state.category !== 'all') list = list.filter(function (r) { return (r.category || 'Other') === state.category; });
    if (state.chain !== 'all') list = list.filter(function (r) { return (r.chains || []).indexOf(state.chain) >= 0; });
    return list;
  }
  function sortedRows(list) {
    var model = sandboxActive() ? sandboxModel() : MODEL;
    var key = state.sort;
    function val(r) {
      if (key === 'implied') return state.tab === 'live' ? (r.mcap_usd || 0) : impliedOf(r, model);
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d === null || r.change_7d === undefined ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days === null || r.age_days === undefined ? -Infinity : r.age_days;
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'mcap') return r.mcap_usd || 0;
      return r.rank || 0;
    }
    return list.slice().sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va < vb) return -1 * state.dir;
      if (va > vb) return 1 * state.dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function maxImplied(list) {
    var m = 0;
    list.forEach(function (r) { var v = impliedOf(r, sandboxActive() ? sandboxModel() : MODEL); if (v > m) m = v; });
    return m || 1;
  }

  function header() {
    var topMeta = el('div', { class: 'top-meta' },
      el('span', {}, 'Snapshot ', el('b', {}, DATA.as_of)),
      el('span', {}, 'Source ', el('b', {}, 'DefiLlama')),
      el('span', {}, 'Board ', el('b', {}, String(DATA.board_size) + ' rows')),
      el('span', {}, 'Watchlist ', el('b', {}, String(DATA.watchlist_size) + ' covered'))
    );
    return el('div', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark', 'aria-hidden': 'true' }), el('span', { class: 'brand-name' }, 'Token Radar')),
      topMeta
    );
  }

  function lede() {
    var top = DATA.rows[0];
    var facts = el('div', { class: 'facts' },
      el('div', { class: 'fact' }, el('span', {}, 'Top implied value'), el('b', {}, top ? fmtUsd(top.implied_value_usd) : 'n/a')),
      el('div', { class: 'fact' }, el('span', {}, 'Top protocol'), el('b', {}, top ? top.name : 'n/a')),
      el('div', { class: 'fact' }, el('span', {}, 'Early finds below the floor'), el('b', {}, String(DATA.early_size))),
      el('div', { class: 'fact' }, el('span', {}, 'Live-token protocols set aside'), el('b', {}, String(DATA.live_size))),
      el('div', { class: 'fact' }, el('span', {}, 'Model'), el('b', {}, DATA.model_version))
    );
    return el('div', { class: 'lede' },
      el('div', {},
        el('h1', {}, 'Which pre-token protocol is worth farming?'),
        el('p', {}, 'A board of ', el('b', {}, String(DATA.board_size) + ' protocols'), ' that record no token yet, ranked by the value a token would carry if their record stayed as it is. Every implied value is computed from the snapshot itself: TVL, seven-day growth, time running with no token, and the category\u2019s own comparable multiple. ', el('b', {}, 'A protocol records no token'), ', never that it has none.')
      ),
      facts
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name, slug or category', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var sortSel = el('select', { 'aria-label': 'Sort by' },
      [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7-day change'], ['age', 'Age'], ['name', 'Name']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: o[0] === state.sort ? 'selected' : null });
      })
    );
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; state.sort = 'implied'; state.dir = -1; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; state.sort = 'mcap'; state.dir = -1; writeHash(); render(); } });
    var tabs = el('div', { class: 'tabs' }, pre, live);
    var count = el('span', { class: 'count', id: 'count' });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', {}, 'Search'), search),
      el('div', { class: 'field' }, el('label', {}, 'Category'), catSel),
      el('div', { class: 'field' }, el('label', {}, 'Chain'), chainSel),
      el('div', { class: 'field' }, el('label', {}, 'Sort'), sortSel),
      tabs, count
    );
  }

  function sortHeader(key, label) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' \u2193' : ' \u2191') : '';
    return el('th', {},
      el('button', {
        type: 'button', text: label + arrow, onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = -1; }
          writeHash(); render();
        }
      })
    );
  }

  function boardTable() {
    var list = sortedRows(visibleRows());
    var max = maxImplied(DATA.rows);
    var isLive = state.tab === 'live';
    var head = el('tr', {},
      el('th', {}, 'Rank'),
      el('th', {}, 'Protocol'),
      el('th', {}, 'Category'),
      sortHeader('tvl', 'TVL'),
      sortHeader('growth', '7d'),
      sortHeader('age', 'Age'),
      isLive ? sortHeader('mcap', 'Market cap') : el('th', {}, 'Multiple'),
      sortHeader(isLive ? 'mcap' : 'implied', isLive ? 'Market cap' : 'Implied value')
    );
    var body = el('tbody', {});
    list.forEach(function (r) {
      var onWatch = isWatchlisted(r.slug);
      var implied = isLive ? (r.mcap_usd || 0) : impliedOf(r, sandboxActive() ? sandboxModel() : MODEL);
      var chains = r.chains || [];
      var chainLabel = chains.length > 3 ? chains.slice(0, 3).join(', ') + ' +' + (chains.length - 3) + ' more' : chains.join(', ');
      var nameCell = el('td', {},
        el('span', { class: 'name' },
          el('span', {}, el('b', {}, r.name), onWatch ? el('span', { class: 'watch' }, 'WATCH') : null),
          el('span', { class: 'sub' }, chainLabel || 'no chain listed')
        )
      );
      var row = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : null,
        onclick: function () { state.selected = r.slug; writeHash(); render(); renderDetail(); }
      },
        el('td', { class: 'rank' }, String(isLive ? (list.indexOf(r) + 1) : (sandboxActive() ? (list.indexOf(r) + 1) : r.rank))),
        nameCell,
        el('td', {}, r.category || 'Other'),
        el('td', { class: 'num' }, fmtUsd(r.tvl_usd)),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg')) }, fmtPct(r.change_7d)),
        el('td', { class: 'num' }, fmtAge(r.age_days)),
        isLive ? el('td', { class: 'num' }, fmtUsd(r.mcap_usd)) : el('td', { class: 'num' }, fmtMult(r.multiple)),
        el('td', {},
          el('span', { class: 'implied' },
            el('b', { class: 'num' }, fmtUsd(implied)),
            isLive ? null : el('span', { class: 'bar' }, el('i', { style: 'width:' + Math.max(2, Math.round(100 * implied / max)) + '%' }))
          )
        )
      );
      body.appendChild(row);
    });
    var wrap = el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, head), body));
    var panel = el('section', { class: 'panel', 'aria-label': isLive ? 'Live-token protocols' : 'Ranked board' }, wrap);
    if (list.length === 0) {
      panel.appendChild(el('div', { class: 'empty' },
        el('h2', {}, 'No protocol matches'),
        el('p', {}, 'Loosen the search or clear a filter.'),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    return { panel: panel, count: list.length };
  }

  function isWatchlisted(slug) {
    return (DATA.watchlist_slugs || []).indexOf(slug) >= 0;
  }

  function modelPanel() {
    var multRows = DATA.multiples.map(function (m) {
      return el('tr', {}, el('td', {}, m.category), el('td', { class: 'num' }, String(m.peers)), el('td', { class: 'num' }, fmtMult(m.median)));
    });
    var gw = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(state.sandbox.growth_weight), 'aria-label': 'Growth weight' });
    var gwOut = el('output', {}, state.sandbox.growth_weight.toFixed(2));
    gw.addEventListener('input', function () { state.sandbox.growth_weight = parseFloat(gw.value); gwOut.textContent = state.sandbox.growth_weight.toFixed(2); render(); });
    var mr = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(state.sandbox.maturity_range), 'aria-label': 'Maturity range' });
    var mrOut = el('output', {}, state.sandbox.maturity_range.toFixed(2));
    mr.addEventListener('input', function () { state.sandbox.maturity_range = parseFloat(mr.value); mrOut.textContent = state.sandbox.maturity_range.toFixed(2); render(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to submitted model', onclick: function () { state.sandbox.growth_weight = MODEL.growth_weight; state.sandbox.maturity_range = MODEL.maturity_range; render(); } });
    var sandboxNote = sandboxActive()
      ? el('p', { class: 'sandbox-note' }, 'Sandbox values are live: the table re-ranks from the same arithmetic. The submitted board keeps the model as published.')
      : el('p', { class: 'sandbox-note' }, 'Move a slider to re-rank the board from the same arithmetic. The submitted board keeps the model as published.');
    return el('section', { class: 'panel model', 'aria-label': 'How the value is modelled' },
      el('h2', {}, 'How the value is modelled'),
      el('p', {}, 'Every implied value follows from the snapshot\u2019s own figures. The multiple is the category\u2019s own comparable: the median market-cap-to-TVL of the tokenized protocols in that category, or the global median where a category has fewer than four peers. No name is special-cased.'),
      el('div', { class: 'formula' },
        el('div', {}, el('b', {}, 'implied = TVL \u00d7 multiple \u00d7 (1 + clamp(7d, \u221260, 120)% \u00d7 ' + MODEL.growth_weight + ') \u00d7 (0.7 + min(age, 1095d) / 1095 \u00d7 0.5)')),
        el('div', {}, 'Global median multiple: ', el('b', {}, fmtMult(DATA.global_multiple)), ' \u00b7 Multiples are clamped to 0.05\u20131.00x.')
      ),
      el('table', { class: 'mult-table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Category'), el('th', {}, 'Peers'), el('th', {}, 'Median multiple'))),
        el('tbody', {}, multRows)
      ),
      el('div', { class: 'sandbox' },
        el('div', { class: 'field' }, el('label', {}, 'Growth weight'), gw, gwOut),
        el('div', { class: 'field' }, el('label', {}, 'Maturity range'), mr, mrOut),
        reset, sandboxNote
      )
    );
  }

  function detailPanel() {
    var slug = state.selected;
    var drawer = el('aside', { class: 'detail', id: 'detail', hidden: slug ? null : 'hidden', 'aria-label': 'Protocol detail' });
    if (!slug) return drawer;
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) {
      DATA.live.forEach(function (r) { if (r.slug === slug) row = r; });
      if (!row) return drawer;
      return liveDetail(drawer, row);
    }
    var base = row.tvl_usd * row.multiple;
    var growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var steps = farmSteps(row).map(function (s) {
      var m = s.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
      if (!m) return el('li', {}, s);
      return el('li', {}, el('b', {}, m[1]), el('span', { class: 'cost' }, 'Cost: ' + m[2] + ' \u00b7 Time: ' + m[3]));
    });
    drawer.appendChild(el('div', { class: 'detail-head' },
      el('div', {},
        el('span', { class: 'sub' }, 'Rank #' + row.rank + ' \u00b7 ' + (row.category || 'Other')),
        el('h2', {}, row.name),
        el('div', { class: 'sub' }, (row.chains || []).join(', ') || 'no chain listed', ' \u00b7 TVL ', fmtUsd(row.tvl_usd), ' \u00b7 ', fmtAge(row.age_days), ' old')
      ),
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: function () { state.selected = null; writeHash(); render(); } })
    ));
    drawer.appendChild(el('div', { class: 'detail-section' },
      el('h3', {}, 'Implied value: ' + fmtUsd(row.implied_value_usd)),
      el('div', { class: 'equation' },
        el('div', {}, el('span', {}, 'TVL \u00d7 ' + (row.category || 'Other') + ' multiple ' + fmtMult(row.multiple)), el('b', {}, fmtUsd(base))),
        el('div', {}, el('span', {}, 'Growth ' + fmtPct(growthPct) + ' \u00d7 ' + MODEL.growth_weight + ' weight'), el('b', {}, '\u00d7' + row.growth_multiplier.toFixed(2))),
        el('div', {}, el('span', {}, 'Maturity, ' + fmtAge(row.age_days) + ' with no token'), el('b', {}, '\u00d7' + row.maturity_multiplier.toFixed(2))),
        el('div', { class: 'total' }, el('span', {}, 'Implied token value'), el('b', {}, fmtUsd(row.implied_value_usd)))
      ),
      el('p', {}, 'This protocol records no token. The value is the board\u2019s own claim, computed from the snapshot, not a prediction that a token will be issued.')
    ));
    drawer.appendChild(el('div', { class: 'detail-section' },
      el('h3', {}, 'How to farm it'),
      el('ol', { class: 'steps' }, steps)
    ));
    return drawer;
  }

  function liveDetail(drawer, row) {
    var ratio = row.tvl_usd > 0 && row.mcap_usd ? (row.mcap_usd / row.tvl_usd) : null;
    drawer.appendChild(el('div', { class: 'detail-head' },
      el('div', {},
        el('span', { class: 'sub' }, 'Live token \u00b7 ' + (row.category || 'Other')),
        el('h2', {}, row.name),
        el('div', { class: 'sub' }, (row.chains || []).join(', ') || 'no chain listed', ' \u00b7 TVL ', fmtUsd(row.tvl_usd))
      ),
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: function () { state.selected = null; writeHash(); render(); } })
    ));
    drawer.appendChild(el('div', { class: 'detail-section' },
      el('h3', {}, 'Market value: ' + fmtUsd(row.mcap_usd)),
      el('div', { class: 'equation' },
        el('div', {}, el('span', {}, 'Market cap'), el('b', {}, fmtUsd(row.mcap_usd))),
        el('div', {}, el('span', {}, 'TVL'), el('b', {}, fmtUsd(row.tvl_usd))),
        el('div', { class: 'total' }, el('span', {}, 'Market cap / TVL'), el('b', {}, ratio === null ? 'n/a' : ratio.toFixed(2) + 'x'))
      ),
      el('p', {}, 'This protocol already trades, so the board shows the market\u2019s own value instead of an implied one. It is kept apart from the ranked board.')
    ));
    return drawer;
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('span', {}, 'Data: DefiLlama public API, snapshot as of ' + DATA.as_of + '. Floor: ' + fmtUsd(DATA.floor_usd) + ' TVL.'),
      el('span', {}, 'A protocol is listed as pre-token when its DefiLlama record carries no market cap, no CoinGecko id and no symbol. That record is not proof it has no token.'),
      el('span', {}, 'Implied values are the board\u2019s own claims from the snapshot\u2019s figures, never financial advice and never a prediction that a token will be issued.')
    );
  }

  function renderDetail() {
    var old = document.getElementById('detail');
    if (old) old.remove();
    app.appendChild(detailPanel());
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    while (app.firstChild) app.removeChild(app.firstChild);
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    var table = boardTable();
    shell.appendChild(table.panel);
    var count = document.getElementById('count');
    if (count) count.textContent = table.count + ' of ' + (state.tab === 'live' ? DATA.live_size : DATA.board_size) + ' shown' + (sandboxActive() ? ' \u00b7 sandbox' : '');
    shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    renderDetail();
    app.setAttribute('aria-busy', 'false');
  }

  // The watchlist slugs ride along in data.js so the board can mark them.
  DATA.watchlist_slugs = DATA.watchlist_slugs || [];
  window.addEventListener('hashchange', function () { var s = readHash(); state.q = s.q; state.category = s.category; state.chain = s.chain; state.tab = s.tab; state.sort = s.sort; state.dir = s.dir; state.selected = s.selected; render(); });
  render();
})();
