import { detectTreatment } from './citations.ts';
const cases: [string,string][] = [
  ['[2020] 11 SCR 896', ' : 2020 INSC 665 : (2021) 2 SCC 427 – relied upon State of Haryana'],
  ['[1963] 3 SCR 837',  ' – held overruled. Central Board of Dawoodi Bohra Community'],
  ['[2022] 18 SCR 133', ' : 2022 SCC OnLine SC 1275 – held per incuriam. Abhishek Sin'],
  ['X 1 SCC 1',         ' – relied on. Next'],
  ['X 1 SCC 1',         ' – overruled. Next'],
  ['X 1 SCC 1',         ' – Not correct law. Next'],
  ['X 1 SCC 1',         ' – stood overruled. Next'],
  ['X 1 SCC 1',         ' – partly overruled. Next'],
  ['X 1 SCC 1',         ' – held not good law. Next'],
  ['X 1 SCC 1',         ' – Doubted on limited aspect. Next'],
  ['X 1 SCC 1',         ' – followed. Next'],
  ['X 1 SCC 1',         ' – distinguished. Next'],
];
for (const [cit, after] of cases) {
  const text = 'lead ' + cit + after;
  console.log(JSON.stringify(detectTreatment(text, 5 + cit.length)).padEnd(52), '<<', after.slice(0,46));
}
