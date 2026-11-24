/**
 * Loads the real dashboard in headless Chrome with the clock fixed,
 * and checks the Claude rows, banned filter, and monthly trend text.
 * Usage: node test/browser-boundaries.mjs [baseUrl]
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const base = process.argv[2] || 'http://127.0.0.1:8765';
const chromeBin = process.env.CHROME || 'google-chrome';

function mockDateSource() {
  return `(() => {
    const m = location.search.match(/asof=(\\d{4}-\\d{2}-\\d{2})/);
    if (!m) return;
    const fixed = new Date(m[1] + 'T12:00:00').getTime();
    const Original = Date;
    class MockDate extends Original {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    }
    window.Date = MockDate;
  })();`;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function evalJson(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text + ' ' + JSON.stringify(result.exceptionDetails.exception));
  }
  return result.result.value;
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function snapshot(cdp, iso) {
  await cdp.send('Page.navigate', { url: `${base}/?asof=${iso}` });
  let snap = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    snap = await evalJson(cdp, `(() => {
      const text = id => { const el = document.querySelector(id); return el ? el.innerText : ''; };
      const card = id => text('.card[data-id="'+id+'"]');
      const up = document.querySelector('#upcoming .up-item[data-id="claude-pro"]');
      const oldUp = document.querySelector('#upcoming .up-item[data-id="claude-pro-old"]');
      const ai = [...document.querySelectorAll('#list h3')].map(h => h.innerText).find(t => t.includes('AI')) || '';
      return {
        total: text('#total'),
        count: text('#count'),
        soon: text('#soon'),
        upcomingHead: (document.querySelector('#upcoming .uh') || {}).innerText || '',
        upcoming: text('#upcoming'),
        trendHead: (document.querySelector('#trend .th') || {}).innerText || '',
        trendList: (document.querySelector('#trend .month-list') || {}).innerText || '',
        claude: card('claude-pro'),
        old: card('claude-pro-old'),
        claudeUp: up ? up.innerText : '',
        claudeBadge: !!(up && up.querySelector('.b-est')),
        oldUp: !!oldUp,
        ai,
        loadErr: text('#loadStatus')
      };
    })()`);
    if (snap && snap.trendHead.includes('花费趋势') && snap.claude) break;
  }
  if (!snap || !snap.claude) throw new Error(iso + ' page did not render: ' + JSON.stringify(snap));
  if (snap.loadErr) throw new Error(iso + ' load error: ' + snap.loadErr);
  return snap;
}

async function openCalendar(cdp) {
  return evalJson(cdp, `(() => {
    const el = document.querySelector('#upcoming [data-day="2026-12-19"]');
    if (!el) return { missing: true };
    el.click();
    const pop = document.querySelector('#calPop');
    return { text: pop ? pop.innerText : '', html: pop ? pop.innerHTML : '' };
  })()`);
}

async function openAttention(cdp) {
  return evalJson(cdp, `(() => {
    document.querySelector('.stat.warn').click();
    const pop = document.querySelector('#soonPop');
    return pop ? pop.innerText : '';
  })()`);
}

async function filterAI(cdp) {
  return evalJson(cdp, `(() => {
    const btn = [...document.querySelectorAll('#filters button')].find(b => b.dataset.c === 'AI');
    btn.click();
    const ids = [...document.querySelectorAll('#list .card')].map(c => c.dataset.id);
    return ids;
  })()`);
}

const checks = [];
function check(name, cond) {
  checks.push(name);
  assert(cond, name);
  console.log('ok', name);
}

const userData = '/tmp/chrome-ledger-' + process.pid;
const chrome = spawn(chromeBin, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=9333', '--user-data-dir=' + userData,
  '--no-first-run', '--disable-extensions', 'about:blank'
], { stdio: 'ignore' });

try {
  let version;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9333/json/version');
      if (res.ok) { version = await res.json(); break; }
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  if (!version) throw new Error('Chrome DevTools did not come up');
  const browser = new WebSocket(version.webSocketDebuggerUrl);
  await once(browser, 'open');
  const bcdp = new CDP(browser);
  const { targetId } = await bcdp.send('Target.createTarget', { url: 'about:blank' });
  const { webSocketDebuggerUrl } = (await (await fetch('http://127.0.0.1:9333/json/list')).json())
    .find(t => t.id === targetId);
  const pageWs = new WebSocket(webSocketDebuggerUrl);
  await once(pageWs, 'open');
  const cdp = new CDP(pageWs);
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: mockDateSource() });

  const nov = await snapshot(cdp, '2026-11-24');
  check('11-24 月均仍是 ¥500，封禁旧号不计入', nov.total === '¥500');
  check('11-24 订阅数不含封禁旧号', nov.count === '8');
  check('11-24 需关注为 0', nov.soon === '0');
  check('11-24 当月实付仍是 ¥935', nov.trendHead.includes('当月实付 ¥935'));
  check('11-24 今年累计仍是 ¥991', nov.trendHead.includes('今年累计实付 ¥991'));
  check('11-24 趋势还没有 12 月行', !nov.trendList.includes('2026年12月'));
  check('11-24 未来 30 天含预计 ¥320', nov.upcomingHead.includes('含预计 ¥320'));
  check('11-24 新号在未来续费里并标预计', nov.claudeUp.includes('2026-12-19（预计）') && nov.claudeBadge);
  check('11-24 旧号不在未来续费', nov.oldUp === false && !nov.upcoming.includes('旧账号'));
  check('11-24 旧号卡片是已封禁', nov.old.includes('已封禁') && !nov.old.includes('2026-12-09'));
  check('11-24 新号卡片标预计，不是即将到期', nov.claude.includes('（预计）') && nov.claude.includes('预计') && !nov.claude.includes('即将到期'));
  check('11-24 AI 月费不含旧号 185', nov.ai.includes('¥415/月'));
  const pop = await openCalendar(cdp);
  check('11-24 日历 12-19 弹出预计', pop.text.includes('Claude Pro') && pop.text.includes('（预计）') && !pop.text.includes('旧账号'));

  const dec1 = await snapshot(cdp, '2026-12-01');
  check('12-01 当月实付是 ¥150 而不是把两笔 Claude 再算进去', dec1.trendHead.includes('当月实付 ¥150') && !dec1.trendList.includes('¥655'));
  check('12-01 11 月仍是实付 ¥785（320+185+KYC）', dec1.trendList.includes('2026年11月') && dec1.trendList.includes('¥785'));
  check('12-01 12 月行是 ¥150', dec1.trendList.includes('2026年12月') && dec1.trendList.includes('¥150'));
  check('12-01 新号仍在未来 30 天并标预计', dec1.claudeUp.includes('（预计）') && dec1.claudeBadge);
  check('12-01 旧号仍不在未来续费', dec1.oldUp === false);
  check('12-01 月均与订阅数不变', dec1.total === '¥500' && dec1.count === '8');

  const dec19 = await snapshot(cdp, '2026-12-19');
  check('12-19 新号仍在未来 30 天，写成预计今天续费', dec19.claudeUp.includes('预计今天续费') && dec19.claudeBadge);
  check('12-19 旧号不在未来续费', dec19.oldUp === false && dec19.old.includes('已封禁'));
  check('12-19 12 月实付仍不含 320 和 185', dec19.trendHead.includes('当月实付 ¥150') && !dec19.trendList.includes('¥655'));
  check('12-19 新号不进需关注', !dec19.claude.includes('即将到期'));
  const soon = await openAttention(cdp);
  check('12-19 需关注不含两个 Claude', !soon.includes('Claude') && soon.includes('ChatGPT Plus'));

  const dec20 = await snapshot(cdp, '2026-12-20');
  check('12-20 新号离开未来 30 天', dec20.claudeUp === '' && dec20.upcoming.includes('未来 30 天没有续费'));
  check('12-20 新号不显示成已过期', dec20.claude.includes('预计续费日已过') && !dec20.claude.includes('已过期'));
  check('12-20 旧号仍是已封禁且不出现 12-09', dec20.old.includes('已封禁') && !dec20.old.includes('2026-12-09'));
  check('12-20 12 月实付仍是 ¥150', dec20.trendHead.includes('当月实付 ¥150'));
  const aiIds = await filterAI(cdp);
  check('AI 筛选仍保留新旧号', aiIds.includes('claude-pro') && aiIds.includes('claude-pro-old') && aiIds.length === 4);

  console.log('browser checks', checks.length);
  browser.close();
  pageWs.close();
} finally {
  chrome.kill('SIGKILL');
}
