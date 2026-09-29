import { describe, expect, it } from 'vitest';
import { pokemonIconValue, pokemonId, pokemonName, POKEMON_COUNT, searchPokemon, spriteStyle } from '../../src/lib/pokemon';
import { collectReminders, iconEmoji } from '../../shared/calendar.js';
import { pokemonSpriteUrl } from '../../shared/pokemon.js';
import { emptyData, makeEvent } from '../../src/store/factories';

describe('Pokémon icons', () => {
  it('knows every Pokémon with Spanish names', () => {
    expect(POKEMON_COUNT).toBeGreaterThanOrEqual(1025);
    expect(pokemonName(25)).toBe('Pikachu');
    expect(pokemonName(772)).toBe('Código Cero');
  });

  it('searches by Spanish or English name and by number', () => {
    expect(searchPokemon('pika').map((r) => r[0])).toContain(25);
    expect(searchPokemon('codigo').map((r) => r[0])).toEqual([772]);
    expect(searchPokemon('type: null').map((r) => r[0])).toEqual([772]);
    expect(searchPokemon('#25').map((r) => r[0])[0]).toBe(25);
  });

  it('stores icons as "poke:<number>" and uses PokeAPI sprites', () => {
    expect(pokemonIconValue(25)).toBe('poke:25');
    expect(pokemonId('poke:25')).toBe(25);
    expect(pokemonId('lucide:Star')).toBeNull();
    expect(pokemonSpriteUrl(25)).toMatch(/generation-viii\/icons\/25\.png$/);
    expect(pokemonSpriteUrl(1000)).toMatch(/sprites\/pokemon\/1000\.png$/);
  });

  it('crops the sprite to the Pokémon', () => {
    // Pikachu covers x 26–46, y 32–51 of its 68×56 icon: 21 px wide fitted into 21 px.
    const style = spriteStyle(25, 21);
    expect(style.backgroundSize).toBe('68px 56px');
    expect(style.backgroundPosition).toBe('-26px -31.5px');
  });

  it('keeps notification titles readable', () => {
    expect(iconEmoji('poke:25', 'birthday')).toBe('🎂');
    const data = emptyData();
    data.settings = { ...data.settings, timeZone: 'UTC' };
    const event = makeEvent('event', '2026-09-28T10:00', { title: 'Gym', icon: 'poke:25', reminders: [0] });
    data.events[event.id] = event;
    const [notice] = collectReminders(data, Date.UTC(2026, 8, 28, 9), Date.UTC(2026, 8, 28, 11));
    expect(notice.title).toBe('📅 Gym');
    expect(notice.icon).toBe('poke:25');
  });
});
