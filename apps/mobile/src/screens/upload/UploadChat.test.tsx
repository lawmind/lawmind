import { render, screen } from '@testing-library/react-native';

import { UploadChat, type UploadTurn } from './UploadChat';

/**
 * TWO RULES UNDER TEST, both of which fail silently if they regress.
 *
 *   1. ONE DOCUMENT. The component takes a single file name and a single
 *      conversation. There is no array to accidentally grow. Mixing case files
 *      in one context makes the model conflate parties between matters — a
 *      confidentiality breach between two of the same advocate's clients that
 *      reads as a fluent, confident answer about the wrong person.
 *
 *   2. NOTHING IS SENT UNTIL THE DPA EXISTS. `available` comes from the server.
 *      When it is false the screen says why, rather than showing a dead input
 *      that reads as a bug.
 */

const turns: UploadTurn[] = [
  { role: 'advocate', question: 'Does this report mention the recovery memo?' },
  {
    role: 'lawmind',
    answer: 'Yes — paragraph 4.',
    passages: [{ page: 2, text: 'The recovery memo was prepared at the spot.' }],
  },
];

describe('UploadChat', () => {
  it('states the one-document constraint rather than leaving it implicit', async () => {
    await render(<UploadChat available fileName="Mock_Report.pdf" turns={turns} />);

    expect(screen.getByText('1 DOCUMENT')).toBeTruthy();
    expect(
      screen.getByText(
        'Answers come only from this document. Add a second file to start a new conversation.'
      )
    ).toBeTruthy();
  });

  it('refuses honestly, with a reason, when the DPA is not in place', async () => {
    await render(<UploadChat available={false} fileName="Mock_Report.pdf" turns={turns} />);

    expect(screen.getByText('This is not switched on yet')).toBeTruthy();
    expect(screen.getByText(/data-processing agreement/)).toBeTruthy();
  });

  it('sends nothing and shows no conversation while unavailable', async () => {
    await render(<UploadChat available={false} fileName="Mock_Report.pdf" turns={turns} />);

    // The turns are present in props but must not be rendered — a blocked
    // feature that still displays its output is not blocked.
    expect(screen.queryByText('Yes — paragraph 4.')).toBeNull();
    expect(screen.queryByText('Does this report mention the recovery memo?')).toBeNull();
  });

  it('grounds every answer in a passage from that document', async () => {
    await render(<UploadChat available fileName="Mock_Report.pdf" turns={turns} />);

    expect(screen.getByText('The recovery memo was prepared at the spot.')).toBeTruthy();
    expect(screen.getByText('Page 2')).toBeTruthy();
  });
});
