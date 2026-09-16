#!/usr/bin/env node
/**
 * LCC R32B — DigitalOcean Gate-C resources, and the ledger that tracks them.
 *
 *   precheck   account, region, sizes, quota, foreign resources, projected cost
 *   provision  SSH key -> VPC -> two Droplets -> cloud firewalls, each recorded
 *              in RESOURCE_LEDGER.json the moment the API returns its id
 *   status     live state + private/public IPs of every ledgered resource
 *   cost       accrued and projected compute cost from ledger createdAt
 *   ssh-ip     re-point both firewalls' SSH rule at a new admin IP
 *   teardown   delete every ledgered resource (and ONLY ledgered resources);
 *              requires --confirm
 *
 * The token is read from DIGITALOCEAN_TOKEN or ~/.lawmind-gatec/do_token and is
 * never printed. Anything not in the ledger is never modified or deleted; the
 * pre-existing `ubuntu-s-vikas` Droplet is refused by name as a second guard.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const LEDGER = resolve('docs/ai/lcc-r32b-do/RESOURCE_LEDGER.json');
const KEYDIR = join(homedir(), '.lawmind-gatec');
const FOREIGN = ['ubuntu-s-vikas'];
const REGION = 'sgp1';
const IMAGE = 'ubuntu-24-04-x64';
const LIFETIME_H = 72;
const HARD_STOP_USD = 75;
const MACHINES = [
  { name: 'lawmind-gatec-corpus', size: 'so1_5-4vcpu-32gb', role: 'corpus' },
  { name: 'lawmind-gatec-api-user', size: 's-2vcpu-4gb', role: 'api-user' },
];

const token =
  process.env['DIGITALOCEAN_TOKEN'] ?? readFileSync(join(KEYDIR, 'do_token'), 'utf8').trim();
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};

async function api(method, path, body) {
  const res = await fetch(`https://api.digitalocean.com/v2/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

const loadLedger = () =>
  existsSync(LEDGER)
    ? JSON.parse(readFileSync(LEDGER, 'utf8'))
    : { kind: 'lcc-r32b-do-resource-ledger', region: REGION, resources: [] };
const saveLedger = (l) => {
  mkdirSync(dirname(LEDGER), { recursive: true });
  l.updatedAt = new Date().toISOString();
  writeFileSync(LEDGER, `${JSON.stringify(l, null, 2)}\n`);
};
const record = (l, r) => {
  const createdAt = r.createdAt ?? new Date().toISOString();
  l.resources.push({
    ...r,
    region: REGION,
    createdAt,
    hardDestroyDeadline: new Date(Date.parse(createdAt) + LIFETIME_H * 3600_000).toISOString(),
    destroyRequired: true,
    destroyedAt: null,
  });
  saveLedger(l);
};
const live = (l, type) => l.resources.filter((r) => r.type === type && !r.destroyedAt);

async function sizes() {
  const { sizes } = await api('GET', 'sizes?per_page=200');
  return Object.fromEntries(sizes.map((s) => [s.slug, s]));
}

async function precheck() {
  const { account } = await api('GET', 'account');
  const { droplets } = await api('GET', 'droplets?per_page=200');
  const { regions } = await api('GET', 'regions?per_page=200');
  const sz = await sizes();
  const region = regions.find((r) => r.slug === REGION);
  const out = {
    at: new Date().toISOString(),
    account: { status: account.status, dropletLimit: account.droplet_limit, emailVerified: account.email_verified },
    existingDroplets: droplets.map((d) => ({
      id: d.id,
      name: d.name,
      region: d.region.slug,
      size: d.size_slug,
      classification: FOREIGN.includes(d.name)
        ? 'FOREIGN_EXISTING_RESOURCE_DO_NOT_TOUCH'
        : d.name.startsWith('lawmind-gatec-')
          ? 'GATE_C'
          : 'FOREIGN_UNCLASSIFIED_DO_NOT_TOUCH',
    })),
    quotaHeadroom: account.droplet_limit - droplets.length,
    region: { slug: REGION, available: !!region?.available },
    machines: MACHINES.map((m) => {
      const s = sz[m.size];
      return {
        ...m,
        available: !!s?.available && !!s?.regions.includes(REGION) && !!region?.sizes.includes(m.size),
        vcpus: s?.vcpus,
        memoryMiB: s?.memory,
        diskGiB: s?.disk,
        priceHourly: s?.price_hourly,
      };
    }),
  };
  const hourly = out.machines.reduce((a, m) => a + (m.priceHourly ?? Infinity), 0);
  out.projected72hComputeUsd = Math.round(hourly * LIFETIME_H * 100) / 100;
  out.pass =
    account.status === 'active' &&
    out.region.available &&
    out.quotaHeadroom >= 2 &&
    out.machines.every((m) => m.available) &&
    out.projected72hComputeUsd <= HARD_STOP_USD;
  return out;
}

function userData(pub, role) {
  // Hardening that must hold before any data arrives: key-only SSH, no root
  // login, patched packages, host firewall as a second layer behind the cloud one.
  const ufw =
    role === 'corpus'
      ? ['ufw default deny incoming', 'ufw allow OpenSSH']
      : ['ufw default deny incoming', 'ufw allow OpenSSH', 'ufw allow 80/tcp', 'ufw allow 443/tcp'];
  return `#cloud-config
users:
  - name: deploy
    groups: [sudo]
    shell: /bin/bash
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    lock_passwd: true
    ssh_authorized_keys:
      - ${pub}
ssh_pwauth: false
disable_root: true
package_update: true
package_upgrade: true
write_files:
  - path: /etc/ssh/sshd_config.d/00-lawmind-gatec.conf
    content: |
      PasswordAuthentication no
      KbdInteractiveAuthentication no
      PermitRootLogin no
      PubkeyAuthentication yes
runcmd:
  - rm -f /etc/ssh/sshd_config.d/50-cloud-init.conf
  - systemctl restart ssh
${ufw.map((c) => `  - ${c}`).join('\n')}
  - ufw --force enable
  - touch /var/lib/lawmind-gatec-ready
`;
}

async function waitActive(id) {
  for (let i = 0; i < 90; i++) {
    const { droplet } = await api('GET', `droplets/${id}`);
    if (droplet.status === 'active') return droplet;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`droplet ${id} not active after 450s`);
}

async function provision() {
  const pre = await precheck();
  if (!pre.pass) throw new Error(`precheck failed: ${JSON.stringify(pre)}`);
  const adminIp = flag('admin-ip');
  if (!adminIp || !/^\d+\.\d+\.\d+\.\d+$/.test(adminIp)) throw new Error('--admin-ip a.b.c.d is required');
  const l = loadLedger();
  if (live(l, 'droplet').length) throw new Error('ledger already holds live droplets; refusing to provision twice');
  l.precheck = pre;
  saveLedger(l);

  const keyName = readFileSync(join(KEYDIR, 'keyname'), 'utf8').trim();
  const pub = readFileSync(join(KEYDIR, `${keyName}.pub`), 'utf8').trim();
  let key = live(l, 'ssh_key')[0];
  if (!key) {
    const { ssh_key } = await api('POST', 'account/keys', { name: keyName, public_key: pub });
    record(l, { type: 'ssh_key', id: ssh_key.id, name: keyName, fingerprint: ssh_key.fingerprint, hourlyUsd: 0 });
    key = live(l, 'ssh_key')[0];
  }

  let vpc = live(l, 'vpc')[0];
  if (!vpc) {
    const { vpc: v } = await api('POST', 'vpcs', {
      name: 'lawmind-gatec-vpc',
      region: REGION,
      ip_range: '10.130.0.0/24',
      description: 'LawMind Gate-C temporary private network (LCC R32B)',
    });
    record(l, { type: 'vpc', id: v.id, name: v.name, ipRange: v.ip_range, hourlyUsd: 0 });
    vpc = live(l, 'vpc')[0];
  }

  const sz = await sizes();
  for (const m of MACHINES) {
    const { droplet } = await api('POST', 'droplets', {
      name: m.name,
      region: REGION,
      size: m.size,
      image: IMAGE,
      ssh_keys: [key.id],
      backups: false,
      ipv6: false,
      monitoring: true,
      vpc_uuid: vpc.id,
      tags: ['lawmind-gatec', `lawmind-gatec-${m.role}`],
      user_data: userData(pub, m.role),
    });
    record(l, {
      type: 'droplet',
      id: droplet.id,
      name: m.name,
      role: m.role,
      sizeSlug: m.size,
      hourlyUsd: sz[m.size].price_hourly,
      createdAt: droplet.created_at,
    });
  }

  const ips = {};
  for (const r of live(l, 'droplet')) {
    const d = await waitActive(r.id);
    r.publicIp = d.networks.v4.find((n) => n.type === 'public')?.ip_address ?? null;
    r.privateIp = d.networks.v4.find((n) => n.type === 'private')?.ip_address ?? null;
    r.status = d.status;
    ips[r.role] = r;
  }
  saveLedger(l);

  const sshRule = { protocol: 'tcp', ports: '22', sources: { addresses: [`${adminIp}/32`] } };
  const outbound = ['tcp', 'udp'].map((protocol) => ({
    protocol,
    ports: 'all',
    destinations: { addresses: ['0.0.0.0/0', '::/0'] },
  }));
  outbound.push({ protocol: 'icmp', destinations: { addresses: ['0.0.0.0/0', '::/0'] } });
  const firewalls = [
    {
      name: 'lawmind-gatec-corpus-fw',
      droplet_ids: [ips.corpus.id],
      inbound_rules: [
        sshRule,
        // PostgreSQL from the API/USER droplet only. It listens on the private IP.
        { protocol: 'tcp', ports: '5432', sources: { droplet_ids: [ips['api-user'].id] } },
      ],
      outbound_rules: outbound,
    },
    {
      name: 'lawmind-gatec-api-user-fw',
      droplet_ids: [ips['api-user'].id],
      inbound_rules: [
        sshRule,
        { protocol: 'tcp', ports: '80', sources: { addresses: ['0.0.0.0/0', '::/0'] } },
        { protocol: 'tcp', ports: '443', sources: { addresses: ['0.0.0.0/0', '::/0'] } },
      ],
      outbound_rules: outbound,
    },
  ];
  for (const fw of firewalls) {
    const { firewall } = await api('POST', 'firewalls', fw);
    record(l, { type: 'firewall', id: firewall.id, name: firewall.name, hourlyUsd: 0, adminIp });
  }
  return status();
}

async function status() {
  const l = loadLedger();
  for (const r of live(l, 'droplet')) {
    const { droplet: d } = await api('GET', `droplets/${r.id}`);
    r.status = d.status;
    r.publicIp = d.networks.v4.find((n) => n.type === 'public')?.ip_address ?? null;
    r.privateIp = d.networks.v4.find((n) => n.type === 'private')?.ip_address ?? null;
    r.vcpus = d.vcpus;
    r.memoryMiB = d.memory;
    r.diskGiB = d.disk;
  }
  l.cost = cost(l);
  saveLedger(l);
  return l;
}

function cost(l) {
  const now = Date.now();
  let accrued = 0;
  let projected = 0;
  for (const r of l.resources.filter((x) => x.type === 'droplet')) {
    const start = Date.parse(r.createdAt);
    const end = r.destroyedAt ? Date.parse(r.destroyedAt) : now;
    // DigitalOcean bills a partial hour as a full hour.
    accrued += Math.ceil((end - start) / 3600_000) * r.hourlyUsd;
    projected += LIFETIME_H * r.hourlyUsd;
  }
  const a = Math.round(accrued * 100) / 100;
  return {
    at: new Date(now).toISOString(),
    accruedComputeUsd: a,
    projected72hComputeUsd: Math.round(projected * 100) / 100,
    band: a >= HARD_STOP_USD ? 'STOP_NEW_WORK' : a > 50 ? 'COST_WARNING' : 'NORMAL',
  };
}

async function sshIp() {
  const ip = flag('admin-ip');
  if (!ip) throw new Error('--admin-ip required');
  const l = loadLedger();
  for (const f of live(l, 'firewall')) {
    const { firewall } = await api('GET', `firewalls/${f.id}`);
    const old = firewall.inbound_rules.find((r) => r.ports === '22');
    await api('DELETE', `firewalls/${f.id}/rules`, { inbound_rules: [old] });
    await api('POST', `firewalls/${f.id}/rules`, {
      inbound_rules: [{ protocol: 'tcp', ports: '22', sources: { addresses: [`${ip}/32`] } }],
    });
    f.adminIp = ip;
  }
  saveLedger(l);
  return live(l, 'firewall');
}

async function teardown() {
  if (!args.includes('--confirm')) throw new Error('teardown requires --confirm');
  const l = loadLedger();
  const order = ['firewall', 'droplet', 'vpc', 'ssh_key'];
  const done = [];
  for (const type of order) {
    for (const r of live(l, type)) {
      if (FOREIGN.includes(r.name)) throw new Error(`refusing: ${r.name} is foreign`);
      const path =
        type === 'firewall' ? `firewalls/${r.id}`
        : type === 'droplet' ? `droplets/${r.id}`
        : type === 'vpc' ? `vpcs/${r.id}`
        : `account/keys/${r.id}`;
      if (type === 'vpc') {
        // A VPC deletes only once its droplets are gone; allow for the lag.
        for (let i = 0; i < 24; i++) {
          try {
            await api('DELETE', path);
            break;
          } catch (err) {
            if (i === 23) throw err;
            await new Promise((res) => setTimeout(res, 10_000));
          }
        }
      } else {
        await api('DELETE', path);
      }
      r.destroyedAt = new Date().toISOString();
      saveLedger(l);
      done.push({ type, id: r.id, name: r.name });
    }
  }
  const { droplets } = await api('GET', 'droplets?per_page=200');
  l.teardown = {
    at: new Date().toISOString(),
    deleted: done,
    remainingGateCDroplets: droplets.filter((d) => d.name.startsWith('lawmind-gatec-')).map((d) => d.id),
    foreignUntouched: droplets.filter((d) => FOREIGN.includes(d.name)).map((d) => ({ id: d.id, name: d.name, status: d.status })),
  };
  l.cost = cost(l);
  saveLedger(l);
  return l.teardown;
}

/**
 * The ONE DNS record this round owns: `A alpha-api.lawmind.co`. Spaceship's
 * `force: false` adds without replacing the zone; DELETE names the exact item.
 */
function spaceship() {
  const env = Object.fromEntries(
    readFileSync(join(KEYDIR, 'secrets.env'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  return async (method, body) => {
    const res = await fetch('https://spaceship.dev/api/v1/dns/records/lawmind.co', {
      method,
      headers: {
        'X-Api-Key': env.SPACESHIP_API_KEY,
        'X-Api-Secret': env.SPACESHIP_API_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`spaceship ${method} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  };
}

async function dnsRecord(add) {
  const l = loadLedger();
  const api = live(l, 'droplet').find((r) => r.role === 'api-user') ?? l.resources.find((r) => r.role === 'api-user');
  const item = { type: 'A', name: 'alpha-api', address: api.publicIp, ttl: 300 };
  const call = spaceship();
  if (add) {
    await call('PUT', { force: false, items: [item] });
    if (!live(l, 'dns_record').length) record(l, { type: 'dns_record', id: 'alpha-api.lawmind.co', name: 'alpha-api.lawmind.co', address: item.address, hourlyUsd: 0 });
  } else {
    await call('DELETE', [{ type: 'A', name: 'alpha-api', address: item.address }]);
    for (const r of live(l, 'dns_record')) r.destroyedAt = new Date().toISOString();
    saveLedger(l);
  }
  return { dns: add ? 'added' : 'removed', item };
}

const run = {
  precheck,
  provision,
  status,
  cost: async () => cost(loadLedger()),
  'ssh-ip': sshIp,
  teardown,
  'dns-add': () => dnsRecord(true),
  'dns-remove': () => dnsRecord(false),
}[cmd];
if (!run) {
  console.error('usage: lcc-r32b-do.mjs <precheck|provision --admin-ip IP|status|cost|ssh-ip --admin-ip IP|teardown --confirm>');
  process.exit(2);
}
run()
  .then((out) => console.log(JSON.stringify(out, null, 2)))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
