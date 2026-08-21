/**
 * NEW2's independent verdicts on 40 of the 125 VERIFIED_CORE_V1 documents.
 *
 * Written from reading the documents' own text — cause title plus operative
 * tail — and NOTHING of LCC's. Their role-claims, their adjudication file and
 * their per-document labels were not opened until this file existed.
 *
 * The question is P4's: is this document a substantive, citable authority?
 *
 *   SUBSTANTIVE      a reasoned adjudication of a lis. Could support a
 *                    proposition. Includes short orders that still decide.
 *   PROCEDURAL       the court disposed of the matter without deciding it —
 *                    a transfer, a chamber summons, a direction merely to
 *                    CONSIDER, an order recording an undertaking, or an order
 *                    that says in terms that it decides nothing.
 *   BAIL             a bail or anticipatory-bail order. Citable with care and
 *                    NOT a substantive authority; reported apart from
 *                    PROCEDURAL because judges do cite them (NEW3's gold has 12)
 *                    and calling them impure was a NEW2 error already corrected.
 *   UNCERTAIN        the evidence read does not settle it. A verdict, not an
 *                    abstention — and where the reason is that the document's
 *                    tail is a service list rather than an order, that is
 *                    recorded, because it is a finding about method.
 *   IDENTITY_UNSAFE  one document covering many registered cases.
 */
export const KEY = [
  { n: 1, id: '00002791', verdict: 'PROCEDURAL', why: 'records an undertaking by the Government Pleader; "no further specific directions are necessary"' },
  { n: 2, id: '000160fe', verdict: 'SUBSTANTIVE', why: 'mandamus: directs the authority to process the D.El.Ed application within three months' },
  { n: 3, id: '000225c8', verdict: 'SUBSTANTIVE', why: 'Letters Patent Appeal, 62-page CAV judgment, Single Judge orders quashed and set aside' },
  { n: 4, id: '00043c27', verdict: 'UNCERTAIN', why: 'Division Bench writ, but the tail read is the service list, not the operative order', tailIsFooter: true },
  { n: 5, id: '00048e44', verdict: 'SUBSTANTIVE', why: 'states the scope of review vs appeal; dismissed in limine but reasoned', textNoise: 'visible OCR noise ("Divisian Benc", "edch") my detector did not catch' },
  { n: 6, id: '0004efc7', verdict: 'PROCEDURAL', why: 'interlocutory application for suspension pending appeal, refused "at this stage"' },
  { n: 7, id: '000668da', verdict: 'SUBSTANTIVE', why: 'MACT appeal, compensation modified on the merits' },
  { n: 8, id: '0006b8bd', verdict: 'PROCEDURAL', why: 'directs the Tahasildar to work out a direction already contained in Annexure-4' },
  { n: 9, id: '0007233a', verdict: 'SUBSTANTIVE', why: 'reasons on the scope of Article 226 review; "no patent perversity is discernible"' },
  { n: 10, id: '000910b3', verdict: 'SUBSTANTIVE', why: 'two orders quashed and set aside, licence restoration directed' },
  { n: 11, id: '0009af1a', verdict: 'PROCEDURAL', why: 'the court says so itself: "This order does not pronounce on the finality of the rights of the parties"' },
  { n: 12, id: '0009eb95', verdict: 'PROCEDURAL', why: 'disposed at counsel\'s own request in view of settled law; decides nothing new' },
  { n: 13, id: '000a17c9', verdict: 'SUBSTANTIVE', why: 'criminal appeals and revision decided on 498A/304B ingredients; acquittal upheld' },
  { n: 14, id: '000dddf8', verdict: 'UNCERTAIN', why: 's.482 dismissed with observations to the court below; reasoning too thin to place' },
  { n: 15, id: '000df7ff', verdict: 'PROCEDURAL', why: 'common order directing an authority to "safeguard the interest of the Hamalies"; no determination' },
  { n: 16, id: '000e35e9', verdict: 'PROCEDURAL', why: 'transfer petition — case management between District Judges' },
  { n: 17, id: '000e57d9', verdict: 'UNCERTAIN', why: 'criminal revision allowed, but the tail read is the certified-copy footer', tailIsFooter: true },
  { n: 18, id: '000ed054', verdict: 'PROCEDURAL', why: 'vehicle-release directions — photographs, panchnama, videography for trial' },
  { n: 19, id: '000f4e87', verdict: 'BAIL', why: 'bail granted on conditions' },
  { n: 20, id: '001009b2', verdict: 'BAIL', why: 'bail allowed with conditions and an expedition direction' },
  { n: 21, id: '00113966', verdict: 'SUBSTANTIVE', why: 'criminal revision dismissed on a reasoned view of the factual plea' },
  { n: 22, id: '00127763', verdict: 'PROCEDURAL', why: 'disposed "with these observations"; police told to inform the petitioner' },
  { n: 23, id: '00128df6', verdict: 'IDENTITY_UNSAFE', why: 'one document headed "SERIAL NOS. 901 TO 1086 AND 1090, 1094 AND 1097 TO 1156" — hundreds of matters under one id' },
  { n: 24, id: '0012a77a', verdict: 'SUBSTANTIVE', why: 'Division Bench, 20k chars, construes "military service" under the Haryana notification' },
  { n: 25, id: '001422eb', verdict: 'SUBSTANTIVE', why: 's.528 BNSS quashing refused on a considered view' },
  { n: 26, id: '00144969', verdict: 'PROCEDURAL', why: 'chamber summons disposed; a motion stands adjourned', textNoise: 'header text TRIPLICATED in the extraction; my detector did not catch it' },
  { n: 27, id: '0014611f', verdict: 'SUBSTANTIVE', why: 'criminal appeal partly allowed with modification of sentence' },
  { n: 28, id: '00154bec', verdict: 'BAIL', why: 'anticipatory bail refused with reasons' },
  { n: 29, id: '0015d509', verdict: 'IDENTITY_UNSAFE', why: 'covers Special Civil Applications 7202 to 7456 of 2003 under a single registered number' },
  { n: 30, id: '0016d283', verdict: 'UNCERTAIN', why: 'Crl OP allowed, but the tail read is the service list and certified-copy note', tailIsFooter: true },
  { n: 31, id: '00174cca', verdict: 'BAIL', why: 'bail allowed with conditions' },
  { n: 32, id: '0017784f', verdict: 'SUBSTANTIVE', why: 'leave to appeal against acquittal refused, applying the perversity standard' },
  { n: 33, id: '0017f6bf', verdict: 'PROCEDURAL', why: 'directs the Deputy Commissioner to consider the application within 15 days; decides nothing' },
  { n: 34, id: '0018045c', verdict: 'SUBSTANTIVE', why: 'declines writ jurisdiction at an interlocutory stage, with reasons', storedClassWrong: 'stored as procedural_disposal from a "Dismiss for Default" disposal string the text contradicts' },
  { n: 35, id: '00182298', verdict: 'SUBSTANTIVE', why: 'Article 226 interference declined on reasons; liberty reserved' },
  { n: 36, id: '00186778', verdict: 'IDENTITY_UNSAFE', why: '23 Transfer CMPs decided in one common order under a single registered number', alsoProcedural: true },
  { n: 37, id: '335f85ab', verdict: 'SUBSTANTIVE', why: 's.138 NI Act appeal; conviction and sentence recorded' },
  { n: 38, id: '33a8b65f', verdict: 'SUBSTANTIVE', why: 'quashing petition rejected on a reasoned view of the authorisation point' },
  { n: 39, id: '6bd9226f', verdict: 'SUBSTANTIVE', why: 'murder appeal; conviction and sentence of the third accused set aside' },
  { n: 40, id: 'e63522a8', verdict: 'SUBSTANTIVE', why: 'State revision on abetment of suicide; s.107 IPC ingredients found absent' },
];
