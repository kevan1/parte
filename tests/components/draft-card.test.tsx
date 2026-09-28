import { fireEvent, render } from '@testing-library/react-native';

import { DraftCard } from '@/components/time-entry/draft-card';
import type { EditableTimeEntryDraft } from '@/domain/types';

const draft: EditableTimeEntryDraft = {
  clientId: '22222222-2222-4222-8222-222222222222',
  workDate: '2026-08-13',
  durationMinutes: 90,
  durationInput: '1,5',
  existingDayMinutes: 0,
  existingDayDate: '2026-08-13',
  startTime: null,
  endTime: null,
  projectName: 'Horas',
  taskDescription: 'Corregir login',
  notes: null,
  suggestedWorkStreamId: '11111111-1111-4111-8111-111111111111',
  selectedWorkStreamId: null,
  continuityChoice: 'pending',
};

describe('draft confirmation card [AC-7, AC-8, AC-12, AC-14]', () => {
  it('shows required editable fields and explicit continuity choices', async () => {
    const onAcceptSuggestion = jest.fn();
    const onUseNewStream = jest.fn();
    const view = await render(
      <DraftCard
        index={0}
        draft={draft}
        onChange={jest.fn()}
        onWorkDateChange={jest.fn()}
        onAcceptSuggestion={onAcceptSuggestion}
        onUseNewStream={onUseNewStream}
      />,
    );
    expect(view.getByLabelText('Proyecto')).toBeTruthy();
    expect(view.getByLabelText('Tarea')).toBeTruthy();
    expect(view.getByLabelText('Horas')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Sí, continuar' }));
    expect(onAcceptSuggestion).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByRole('button', { name: 'No, tarea nueva' }));
    expect(onUseNewStream).toHaveBeenCalledTimes(1);
  });

  it('reports invalid visible hours instead of retaining a hidden prior value', async () => {
    const onChange = jest.fn();
    const view = await render(
      <DraftCard
        index={0}
        draft={draft}
        onChange={onChange}
        onWorkDateChange={jest.fn()}
        onAcceptSuggestion={jest.fn()}
        onUseNewStream={jest.fn()}
      />,
    );
    fireEvent.changeText(view.getByLabelText('Horas'), '0');
    expect(onChange).toHaveBeenLastCalledWith({ durationInput: '0' });
  });

  it('explains when an alias will use an existing project', async () => {
    const view = await render(
      <DraftCard
        index={0}
        draft={{
          ...draft,
          suggestedWorkStreamId: null,
          continuityChoice: 'new',
          projectSuggestion: { inputName: 'Horas app', existingName: 'Horas' },
        }}
        onChange={jest.fn()}
        onWorkDateChange={jest.fn()}
        onAcceptSuggestion={jest.fn()}
        onUseNewStream={jest.fn()}
      />,
    );

    expect(view.getByText(/“Horas app” coincide con el proyecto existente “Horas”/)).toBeTruthy();
    expect(view.getByDisplayValue('Horas')).toBeTruthy();
  });
});
