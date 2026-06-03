import { createServerBodySchema } from '../../src/dtos/server.dto';

describe('createServerBodySchema', () => {
  it('accepts a positive even requiredPlayers', () => {
    const parsed = createServerBodySchema.parse({ name: 'Dust2', requiredPlayers: 4 });
    expect(parsed).toEqual({ name: 'Dust2', requiredPlayers: 4 });
  });

  it('trims the name', () => {
    const parsed = createServerBodySchema.parse({ name: '  Inferno  ', requiredPlayers: 10 });
    expect(parsed.name).toBe('Inferno');
  });

  it.each([5, 7, 13])('rejects an odd requiredPlayers (%i)', (n) => {
    expect(createServerBodySchema.safeParse({ name: 'X', requiredPlayers: n }).success).toBe(false);
  });

  it.each([0, -2, -4])('rejects a non-positive requiredPlayers (%i)', (n) => {
    expect(createServerBodySchema.safeParse({ name: 'X', requiredPlayers: n }).success).toBe(false);
  });

  it('rejects a non-integer requiredPlayers', () => {
    expect(createServerBodySchema.safeParse({ name: 'X', requiredPlayers: 4.5 }).success).toBe(
      false,
    );
  });

  it('rejects an empty name', () => {
    expect(createServerBodySchema.safeParse({ name: '', requiredPlayers: 4 }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      createServerBodySchema.safeParse({ name: 'X', requiredPlayers: 4, gameType: 'hack' }).success,
    ).toBe(false);
  });
});
