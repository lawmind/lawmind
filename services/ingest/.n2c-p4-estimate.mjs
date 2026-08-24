/**
 * NEW2 P4b — the stratified estimate, using NEW1's estimator rather than a pool.
 *
 * ELIGIBILITY_SAMPLING_FRAME.md §5 is explicit: the allocation is deliberately
 * unequal, so pooling the strata unweighted reports the oversampled stratum as
 * if it were the corpus. This applies the weights.
 *
 *   rate     = SUM_h (N_h/N) * p_h
 *   variance = SUM_h (N_h/N)^2 * p_h(1-p_h)/n_h
 *
 * A stratum that scores ZERO has zero variance under that formula, which is an
 * artefact rather than certainty. So each stratum ALSO carries a Wilson
 * interval, and the zero stratum carries a one-sided upper bound, and the
 * headline is reported with both.
 */
import { readFileSync, writeFileSync } from 'node:fs';
const labels = JSON.parse(readFileSync('docs/ai/new2/uncited-v2-labels.json','utf8')).labels;
const frame  = JSON.parse(readFileSync('docs/ai/new2/uncited-authority-frame-v2.json','utf8'));
const strat  = new Map(frame.documents.map(x=>[String(x.seq), x.stratum]));

const wilson=(k,n)=>{if(!n)return[0,0];const z=1.959964,p=k/n,d=1+z*z/n,c=p+z*z/(2*n),s=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));return[Math.max(0,(c-s)/d),Math.min(1,(c+s)/d)];};

const agg={};
for (const [seq,[label]] of Object.entries(labels)) {
  const s = strat.get(seq); (agg[s] ??= {n:0,sub:0,bord:0});
  agg[s].n++; if(label==='SUBSTANTIVE')agg[s].sub++; if(label==='BORDERLINE')agg[s].bord++;
}

/** Population shares from NEW1's census (ELIGIBILITY_SAMPLING_FRAME.md §5). */
const W = { RESIDUAL_NO_NEGATIVE_MARKER: 0.430, MARKER_CARRYING: 0.570 };

const per = {};
for (const [s,v] of Object.entries(agg)) {
  per[s] = {
    n: v.n, substantive: v.sub, borderline: v.bord,
    rate: v.sub/v.n, ci95: wilson(v.sub,v.n),
    rate_incl_borderline: (v.sub+v.bord)/v.n, ci95_incl_borderline: wilson(v.sub+v.bord,v.n),
  };
}

let rate=0, varr=0, rateB=0;
for (const [s,w] of Object.entries(W)) {
  const p = per[s].rate, pb = per[s].rate_incl_borderline, n = per[s].n;
  rate += w*p; rateB += w*pb; varr += w*w*p*(1-p)/n;
}
const se = Math.sqrt(varr);

const out = {
  generated_at: new Date().toISOString(),
  labelling_rule: JSON.parse(readFileSync('docs/ai/new2/uncited-v2-labels.json','utf8')).labelling_rule,
  per_stratum: per,
  refused_population_weighted: {
    weights: W,
    rate, rate_pct: +(rate*100).toFixed(2),
    normal_se: se, normal_ci95: [Math.max(0,rate-1.96*se), rate+1.96*se],
    rate_incl_borderline_pct: +(rateB*100).toFixed(2),
    note: 'MARKER_CARRYING scored 0/40, so its variance contribution is 0 by construction. The honest bound on that stratum is its Wilson upper limit, carried separately.',
  },
  control_vs_refused: {
    control_rate_pct: +(per.CONTROL_ABOVE_GATE_2000_3000.rate*100).toFixed(2),
    residual_refused_rate_pct: +(per.RESIDUAL_NO_NEGATIVE_MARKER.rate*100).toFixed(2),
    weighted_refused_rate_pct: +(rate*100).toFixed(2),
  },
};
writeFileSync('docs/ai/new2/uncited-v2-estimate.json', JSON.stringify(out,null,2));
const pct=x=>(x*100).toFixed(2)+'%';
for (const [s,v] of Object.entries(per))
  console.log(`${s.padEnd(30)} ${v.substantive}/${v.n} = ${pct(v.rate)}  CI [${pct(v.ci95[0])}, ${pct(v.ci95[1])}]   +borderline ${pct(v.rate_incl_borderline)}`);
console.log(`\nWEIGHTED refused-population rate: ${pct(rate)}  normal CI [${pct(Math.max(0,rate-1.96*se))}, ${pct(rate+1.96*se)}]`);
console.log(`WEIGHTED including borderline:    ${pct(rateB)}`);
console.log('wrote docs/ai/new2/uncited-v2-estimate.json');
