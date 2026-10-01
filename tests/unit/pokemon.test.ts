import { describe, expect, it } from 'vitest';
import { FORMS_COUNT, pokemonIconValue, pokemonKey, pokemonName, SPECIES_COUNT, searchPokemon, spriteStyle } from '../../src/lib/pokemon';
import { collectReminders, iconEmoji } from '../../shared/calendar.js';
import { pokemonSpriteUrl } from '../../shared/pokemon.js';
import { emptyData, makeEvent } from '../../src/store/factories';

describe('Pokémon icons', () => {
  it('knows every Pokémon with Spanish names', () => {
    expect(SPECIES_COUNT).toBeGreaterThanOrEqual(1025);
    expect(pokemonName('25')).toBe('Pikachu');
    expect(pokemonName('772')).toBe('Código Cero');
  });

  it('searches by Spanish or English name and by number', () => {
    expect(searchPokemon('pika').map((r) => r[0])).toContain('25');
    expect(searchPokemon('codigo').map((r) => r[0])).toEqual(['772']);
    expect(searchPokemon('type: null').map((r) => r[0])).toEqual(['772']);
    expect(searchPokemon('#25').map((r) => r[0])[0]).toBe('25');
  });

  it('stores icons as "poke:<number>" and uses PokeAPI sprites', () => {
    expect(pokemonIconValue('25')).toBe('poke:25');
    expect(pokemonKey('poke:25')).toBe('25');
    expect(pokemonKey('poke:201-b')).toBe('201-b');
    expect(pokemonKey('lucide:Star')).toBeNull();
    expect(pokemonKey('poke:../x')).toBeNull();
    expect(pokemonSpriteUrl('25')).toMatch(/generation-viii\/icons\/25\.png$/);
    expect(pokemonSpriteUrl('1000')).toMatch(/sprites\/pokemon\/1000\.png$/);
  });

  it('crops the sprite to the Pokémon', () => {
    // Pikachu covers x 26–46, y 32–51 of its 68×56 icon: 21 px wide fitted into 21 px.
    const style = spriteStyle('25', 21);
    expect(style.backgroundSize).toBe('68px 56px');
    expect(style.backgroundPosition).toBe('-26px -31.5px');
  });

  it('shows shiny Pokémon with the 96×96 shiny sprite', () => {
    expect(pokemonIconValue('25', true)).toBe('poke:25:s');
    expect(pokemonIconValue('25:s', false)).toBe('poke:25');
    expect(pokemonIconValue('25:s')).toBe('poke:25:s');
    expect(pokemonKey('poke:25:s')).toBe('25:s');
    expect(pokemonKey('poke:201-b:s')).toBe('201-b:s');
    expect(pokemonKey('poke:25:x')).toBeNull();
    expect(pokemonName('25:s')).toBe('Pikachu shiny');
    expect(pokemonSpriteUrl('25:s')).toMatch(/sprites\/pokemon\/shiny\/25\.png$/);
    expect(pokemonSpriteUrl('10229:s')).toMatch(/sprites\/pokemon\/shiny\/10229\.png$/);
    // Shiny Pikachu covers x 31–69, y 24–69 of its 96×96 sprite: 46 px tall fitted into 23 px.
    const style = spriteStyle('25:s', 23);
    expect(style.backgroundSize).toBe('48px 48px');
    expect(style.backgroundPosition).toBe('-13.75px -12px');
    expect(style.backgroundImage).toContain('/shiny/25.png');
  });

  it('includes regional, Mega, Gigantamax and cosmetic forms with Spanish names', () => {
    expect(FORMS_COUNT).toBeGreaterThan(400);
    expect(pokemonName('10091')).toBe('Rattata de Alola');
    expect(pokemonName('10033')).toBe('Mega-Venusaur');
    expect(pokemonName('10196')).toBe('Charizard Gigamax');
    expect(pokemonName('10229')).toBe('Growlithe de Hisui');
    expect(pokemonName('10250')).toBe('Tauros de Paldea (Raza Combatiente)');
    expect(pokemonName('201-b')).toBe('Unown (B)');
    const alola = searchPokemon('alola').map((r) => r[2]);
    expect(alola).toContain('Vulpix de Alola');
    expect(searchPokemon('alolan vulpix').map((r) => r[2])).toEqual(['Vulpix de Alola']);
    expect(searchPokemon('#37').map((r) => r[2])).toEqual(expect.arrayContaining(['Vulpix', 'Vulpix de Alola']));
    // Hisui forms only have the regular 96×96 sprite.
    expect(pokemonSpriteUrl('10229')).toMatch(/sprites\/pokemon\/10229\.png$/);
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
