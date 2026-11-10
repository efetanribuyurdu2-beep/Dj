import { describe, expect, it } from 'vitest';
import { ACTIONS, detectRelative, learnFrom, parseMidi, relativeDelta, resolve, upsertBinding, type Binding } from '../src/audio/midi';

const act = (id: string) => ACTIONS.find((a) => a.id === id)!;

describe('MIDI parsing', () => {
  it('parses note on/off and CC on any channel', () => {
    expect(parseMidi([0x91, 11, 127])).toEqual({ type: 'note', channel: 1, number: 11, value: 127, on: true });
    expect(parseMidi([0x91, 11, 0])).toMatchObject({ on: false });
    expect(parseMidi([0x81, 11, 64])).toMatchObject({ type: 'note', on: false });
    expect(parseMidi([0xb0, 19, 100])).toEqual({ type: 'cc', channel: 0, number: 19, value: 100 });
    expect(parseMidi([0xf8])).toBeNull();
  });

  it('decodes relative encoders', () => {
    expect(relativeDelta(65, 'offset64')).toBe(1);
    expect(relativeDelta(62, 'offset64')).toBe(-2);
    expect(relativeDelta(1, 'twos')).toBe(1);
    expect(relativeDelta(127, 'twos')).toBe(-1);
    expect(detectRelative(65)).toBe('offset64');
    expect(detectRelative(127)).toBe('twos');
  });
});

describe('MIDI learn', () => {
  it('binds the first press / move, ignores note-off and 14-bit LSB on faders', () => {
    expect(learnFrom(act('A.play'), { type: 'note', channel: 0, number: 11, value: 0, on: false })).toBeNull();
    expect(learnFrom(act('A.play'), { type: 'note', channel: 0, number: 11, value: 127, on: true })).toEqual({
      action: 'A.play',
      type: 'note',
      channel: 0,
      number: 11,
    });
    expect(learnFrom(act('A.volume'), { type: 'cc', channel: 0, number: 51, value: 3 })).toBeNull();
    expect(learnFrom(act('A.volume'), { type: 'cc', channel: 0, number: 19, value: 90 })).toMatchObject({ number: 19 });
        expect(learnFrom(act('A.jog'), { type: 'cc', channel: 0, number: 34, value: 65 })).toMatchObject({ relative: 'offset64' });
  });

  it('re-learning replaces both the old action binding and the reused control', () => {
    let list: Binding[] = [];
    list = upsertBinding(list, { action: 'A.play', type: 'note', channel: 0, number: 11 });
    list = upsertBinding(list, { action: 'A.cue', type: 'note', channel: 0, number: 12 });
    list = upsertBinding(list, { action: 'A.play', type: 'note', channel: 0, number: 12 });
    expect(list).toEqual([{ action: 'A.play', type: 'note', channel: 0, number: 12 }]);
  });

  it('resolves inputs by kind', () => {
    const list: Binding[] = [
      { action: 'A.play', type: 'note', channel: 0, number: 11 },
      { action: 'crossfader', type: 'cc', channel: 6, number: 31 },
      { action: 'B.jog', type: 'cc', channel: 1, number: 34, relative: 'offset64' },
    ];
    expect(resolve(list, { type: 'note', channel: 0, number: 11, value: 127, on: true })).toEqual({ action: 'A.play', kind: 'button', pressed: true });
    expect(resolve(list, { type: 'cc', channel: 6, number: 31, value: 127 })).toEqual({ action: 'crossfader', kind: 'absolute', value: 1 });
    expect(resolve(list, { type: 'cc', channel: 1, number: 34, value: 61 })).toEqual({ action: 'B.jog', kind: 'relative', delta: -3 });
    expect(resolve(list, { type: 'cc', channel: 2, number: 31, value: 1 })).toBeNull();
  });
});
