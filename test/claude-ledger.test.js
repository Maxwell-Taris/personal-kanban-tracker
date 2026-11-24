const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Ledger = require('../ledger.js');

const root = path.join(__dirname, '..');
const subs = JSON.parse(fs.readFileSync(path.join(root, 'data/live.json'), 'utf8'));
const oneoffs = JSON.parse(fs.readFileSync(path.join(root, 'data/oneoffs.json'), 'utf8'));
const byId = Object.fromEntries(subs.map(s => [s.id, s]));
const day = iso => Ledger.parseDay(iso);

function parts(iso, key) {
  const today = day(iso);
  const out = {};
  for (const s of subs) {
    const v = Ledger.chargeInMonth(s, key, today);
    if (v) out[s.id] = v;
  }
  const oo = oneoffs.reduce((a, o) => {
    const d = Ledger.parseDay(o.date);
    return d && Ledger.monthKey(d) === key ? a + (+o.amount || 0) : a;
  }, 0);
  if (oo) out.oneoffs = oo;
  return out;
}

function seriesMap(iso) {
  return Object.fromEntries(Ledger.spendSeries(subs, oneoffs, day(iso)).map(m => [m.key, m]));
}

test('live data keeps the known Claude facts and does not invent dates', () => {
  const neu = byId['claude-pro'];
  const old = byId['claude-pro-old'];
  assert.equal(neu.recurring, 'monthly');
  assert.equal(neu.price, 320);
  assert.equal(neu.currency, 'CNY');
  assert.equal(neu.lastPaid, '2026-11-19');
  assert.equal(neu.startedOn, '2026-11-19');
  assert.equal(neu.renew, '2026-12-19');
  assert.equal(neu.renewEstimated, true);
  assert.equal(neu.remind, false);
  assert.equal(neu.endedOn, undefined);
  assert.equal(neu.status, undefined);
  assert.equal(neu.annualPrice, undefined);
  assert.deepEqual(neu.payments, [{ date: '2026-11-19', amount: 320 }]);

  assert.equal(old.recurring, 'monthly');
  assert.equal(old.price, 185);
  assert.equal(old.lastPaid, '2026-11-09');
  assert.equal(old.startedOn, '2026-11-09');
  assert.equal(old.status, 'banned');
  assert.equal(old.remind, false);
  assert.equal(old.renew, undefined);
  assert.equal(old.endedOn, undefined);
  assert.equal(old.plannedRenew, '2026-12-09');
  assert.equal(old.annualPrice, undefined);
  assert.equal(old.renewEstimated, undefined);
  assert.deepEqual(old.payments, [{ date: '2026-11-09', amount: 185 }]);
  assert.equal(Ledger.isEnded(old), true);
  assert.equal(Ledger.isEnded(neu), false);
});

test('other subscriptions and the KYC one-off are unchanged', () => {
  assert.deepEqual(subs.map(s => s.id), [
    'chatgpt-plus', 'grok-bot', 'claude-pro', 'claude-pro-old',
    'us-residential-ip', 'qq-music-green-diamond', 'icloud-plus-400gb',
    'microsoft-365-family', 'glados'
  ]);
  for (const s of subs) {
    if (s.id === 'claude-pro' || s.id === 'claude-pro-old') continue;
    assert.equal(s.payments, undefined, s.id);
    assert.equal(s.renewEstimated, undefined, s.id);
    assert.equal(s.status, undefined, s.id);
  }
  assert.equal(byId['chatgpt-plus'].price, 80);
  assert.equal(byId['chatgpt-plus'].renew, '2026-12-03');
  assert.equal(byId['chatgpt-plus'].recurring, 'monthly');
  assert.equal(byId['grok-bot'].price, 15);
  assert.equal(byId['grok-bot'].renew, '2026-12-05');
  assert.equal(byId['us-residential-ip'].price, 25);
  assert.equal(byId['us-residential-ip'].renew, '2026-12-08');
  assert.equal(byId['glados'].price, 30);
  assert.equal(byId['glados'].renew, '2026-12-05');
  assert.equal(byId['glados'].remind, false);
  assert.equal(byId['qq-music-green-diamond'].recurring, 'yearly');
  assert.equal(byId['qq-music-green-diamond'].annualPrice, 158);
  assert.equal(byId['qq-music-green-diamond'].renew, '2027-07-31');
  assert.equal(byId['icloud-plus-400gb'].recurring, 'yearly');
  assert.equal(byId['icloud-plus-400gb'].annualPrice, 147.8);
  assert.equal(byId['icloud-plus-400gb'].remind, false);
  assert.equal(byId['microsoft-365-family'].recurring, 'yearly');
  assert.equal(byId['microsoft-365-family'].annualPrice, 56.3);
  assert.equal(byId['microsoft-365-family'].lastPaid, '2026-02-08');
  assert.equal(byId['microsoft-365-family'].renew, '2027-02-08');
  assert.equal(oneoffs.length, 1);
  assert.equal(oneoffs[0].id, 'claude-kyc-2026-11-09');
  assert.equal(oneoffs[0].amount, 280);
  assert.equal(oneoffs[0].date, '2026-11-09');
});

test('2026-11-24 books only known November payments, including both Claude amounts', () => {
  const s = seriesMap('2026-11-24');
  assert.deepEqual(Object.keys(s), [
    '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
    '2026-08', '2026-09', '2026-10', '2026-11'
  ]);
  assert.equal(s['2026-12'], undefined);
  assert.equal(s['2026-02'].subTotal, 56.3);
  assert.deepEqual(parts('2026-11-24', '2026-02'), { 'microsoft-365-family': 56.3 });
  assert.deepEqual(parts('2026-11-24', '2026-11'), {
    'chatgpt-plus': 80,
    'grok-bot': 15,
    'claude-pro': 320,
    'claude-pro-old': 185,
    'us-residential-ip': 25,
    glados: 30,
    oneoffs: 280
  });
  assert.equal(s['2026-11'].total, 935);
  assert.equal(s['2026-11'].cumulative, 56.3 + 935);
});

test('December boundary does not book Claude 320 or banned 185 as paid', () => {
  for (const iso of ['2026-12-01', '2026-12-19', '2026-12-31']) {
    const s = seriesMap(iso);
    assert.ok(s['2026-12'], iso);
    assert.deepEqual(parts(iso, '2026-11'), {
      'claude-pro': 320,
      'claude-pro-old': 185,
      oneoffs: 280
    }, iso);
    assert.deepEqual(parts(iso, '2026-12'), {
      'chatgpt-plus': 80,
      'grok-bot': 15,
      'us-residential-ip': 25,
      glados: 30
    }, iso);
    assert.equal(s['2026-12'].subTotal, 150, iso);
    assert.equal(s['2026-11'].subTotal, 505, iso);
    assert.equal(s['2026-02'].subTotal, 56.3, iso);
    assert.equal(parts(iso, '2026-12')['claude-pro'] || 0, 0, iso);
    assert.equal(parts(iso, '2026-12')['claude-pro-old'] || 0, 0, iso);
  }
});

test('2027-01-01 still does not roll either Claude account forward', () => {
  assert.deepEqual(parts('2027-01-01', '2026-11'), {
    'claude-pro': 320,
    'claude-pro-old': 185,
    oneoffs: 280
  });
  assert.deepEqual(parts('2027-01-01', '2026-12'), {});
  assert.deepEqual(parts('2027-01-01', '2027-01'), {
    'chatgpt-plus': 80,
    'grok-bot': 15,
    'us-residential-ip': 25,
    glados: 30
  });
  assert.equal(parts('2027-02-08', '2027-02')['microsoft-365-family'], 56.3);
  assert.equal(parts('2027-02-08', '2027-02')['claude-pro'] || 0, 0);
  assert.equal(parts('2027-02-08', '2027-02')['claude-pro-old'] || 0, 0);
});

test('new Claude renew stays in the next 30 days and is labeled estimated', () => {
  const neu = byId['claude-pro'];
  const old = byId['claude-pro-old'];
  assert.equal(Ledger.daysUntil(neu.renew, day('2026-11-24')), 25);
  assert.equal(Ledger.inUpcoming(neu, day('2026-11-24')), true);
  assert.equal(Ledger.inUpcoming(neu, day('2026-12-01')), true);
  assert.equal(Ledger.inUpcoming(neu, day('2026-12-19')), true);
  assert.equal(Ledger.daysUntil(neu.renew, day('2026-12-19')), 0);
  assert.equal(Ledger.inUpcoming(neu, day('2026-12-20')), false);
  assert.equal(Ledger.renewWhen(neu, 25), '25 天后 · 2026-12-19（预计）');
  assert.equal(Ledger.renewWhen(neu, 0), '预计今天续费 · 2026-12-19');
  assert.equal(Ledger.renewWhen(neu, -1), '预计续费日已过 · 2026-12-19');
  assert.equal(Ledger.renewWhen(byId['chatgpt-plus'], 9), '9 天后 · 2026-12-03');
  assert.equal(Ledger.renewWhen(byId['chatgpt-plus'], 0), '今天到期');
  assert.equal(Ledger.renewWhen(byId['chatgpt-plus'], -2), '已过期 2 天');

  assert.equal(Ledger.inUpcoming(old, day('2026-11-24')), false);
  assert.equal(Ledger.inUpcoming(old, day('2026-12-01')), false);
  assert.equal(Ledger.inUpcoming(old, day('2026-12-09')), false);
  assert.equal(Ledger.inUpcoming(old, day('2026-12-19')), false);
  const window = subs.filter(s => Ledger.inUpcoming(s, day('2026-11-24'))).map(s => s.id);
  assert.deepEqual(window, [
    'chatgpt-plus', 'grok-bot', 'claude-pro', 'us-residential-ip', 'glados'
  ]);
  assert.ok(!window.includes('claude-pro-old'));
});

test('banned account and estimated renew do not enter attention or notifications', () => {
  const neu = byId['claude-pro'];
  const old = byId['claude-pro-old'];
  for (const iso of ['2026-11-24', '2026-12-01', '2026-12-16', '2026-12-18', '2026-12-19']) {
    assert.equal(Ledger.inAttention(neu, day(iso)), false, iso);
    assert.equal(Ledger.inAttention(old, day(iso)), false, iso);
    assert.equal(Ledger.renewalNotifyDays(neu, day(iso)), null, iso);
    assert.equal(Ledger.renewalNotifyDays(old, day(iso)), null, iso);
  }
  assert.equal(Ledger.daysUntil(neu.renew, day('2026-12-16')), 3);
  assert.equal(Ledger.daysUntil(neu.renew, day('2026-12-18')), 1);
  assert.equal(Ledger.renewalNotifyDays(byId['chatgpt-plus'], day('2026-11-30')), 3);
  assert.equal(Ledger.renewalNotifyDays(byId['chatgpt-plus'], day('2026-12-02')), 1);
  assert.equal(Ledger.renewalNotifyDays(byId['chatgpt-plus'], day('2026-12-01')), null);
  assert.equal(Ledger.inAttention(byId['chatgpt-plus'], day('2026-11-30')), true);
  assert.equal(Ledger.inAttention(byId['glados'], day('2026-11-30')), false);
  const attention = subs.filter(s => Ledger.inAttention(s, day('2026-12-16'))).map(s => s.id);
  assert.deepEqual(attention, ['chatgpt-plus', 'grok-bot', 'us-residential-ip']);
  assert.ok(!attention.includes('claude-pro'));
  assert.ok(!attention.includes('claude-pro-old'));
  assert.ok(!attention.includes('glados'));
});

test('default monthly and yearly rules stay in place unless a ledger or estimate flag is set', () => {
  const monthly = { id: 'm', price: 80, recurring: 'monthly', renew: '2026-12-03' };
  assert.equal(Ledger.chargeInMonth(monthly, '2026-11', day('2026-11-24')), 80);
  assert.equal(Ledger.chargeInMonth(monthly, '2026-10', day('2026-11-24')), 0);
  assert.equal(Ledger.chargeInMonth(monthly, '2026-11', day('2026-12-01')), 0);
  assert.equal(Ledger.chargeInMonth(monthly, '2026-12', day('2026-12-01')), 80);

  const started = { id: 's', price: 10, recurring: 'monthly', startedOn: '2026-01-15', endedOn: '2026-03-02' };
  assert.equal(Ledger.chargeInMonth(started, '2025-12', day('2026-11-24')), 0);
  assert.equal(Ledger.chargeInMonth(started, '2026-01', day('2026-11-24')), 10);
  assert.equal(Ledger.chargeInMonth(started, '2026-03', day('2026-11-24')), 10);
  assert.equal(Ledger.chargeInMonth(started, '2026-04', day('2026-11-24')), 0);

  const yearly = { id: 'y', recurring: 'yearly', annualPrice: 56.3, price: 4.6917, lastPaid: '2026-02-08', renew: '2027-02-08' };
  assert.equal(Ledger.chargeInMonth(yearly, '2026-02', day('2026-11-24')), 56.3);
  assert.equal(Ledger.chargeInMonth(yearly, '2026-11', day('2026-11-24')), 0);
  assert.equal(Ledger.chargeInMonth(yearly, '2027-02', day('2027-02-08')), 56.3);
  const yearlyEst = { ...yearly, renewEstimated: true };
  assert.equal(Ledger.chargeInMonth(yearlyEst, '2026-02', day('2027-02-08')), 56.3);
  assert.equal(Ledger.chargeInMonth(yearlyEst, '2027-02', day('2027-02-08')), 0);

  const bannedNoEnd = {
    id: 'b', price: 185, recurring: 'monthly', status: 'banned',
    startedOn: '2026-11-09', lastPaid: '2026-11-09'
  };
  assert.equal(Ledger.chargeInMonth(bannedNoEnd, '2026-11', day('2026-12-01')), 185);
  assert.equal(Ledger.chargeInMonth(bannedNoEnd, '2026-12', day('2026-12-01')), 0);
  assert.equal(Ledger.chargeInMonth(bannedNoEnd, '2027-01', day('2027-01-15')), 0);

  const bannedWithEnd = {
    id: 'be', price: 10, recurring: 'monthly', status: 'banned',
    startedOn: '2026-01-01', endedOn: '2026-03-02', lastPaid: '2026-01-01'
  };
  assert.equal(Ledger.chargeInMonth(bannedWithEnd, '2026-01', day('2026-11-24')), 10);
  assert.equal(Ledger.chargeInMonth(bannedWithEnd, '2026-03', day('2026-11-24')), 10);
  assert.equal(Ledger.chargeInMonth(bannedWithEnd, '2026-04', day('2026-11-24')), 0);

  const ledgered = { id: 'p', price: 999, recurring: 'monthly', renew: '2026-12-19', payments: [{ date: '2026-11-19', amount: 320 }] };
  assert.equal(Ledger.chargeInMonth(ledgered, '2026-11', day('2026-12-31')), 320);
  assert.equal(Ledger.chargeInMonth(ledgered, '2026-12', day('2026-12-31')), 0);
});

test('active monthly average still includes the new plan and excludes the banned one', () => {
  const active = subs.filter(s => !Ledger.isEnded(s));
  assert.equal(active.length, 8);
  assert.ok(active.some(s => s.id === 'claude-pro'));
  assert.ok(!active.some(s => s.id === 'claude-pro-old'));
  const monthly = active.reduce((a, s) => a + (+s.price || 0), 0);
  assert.equal(monthly.toFixed(0), '500');
});
