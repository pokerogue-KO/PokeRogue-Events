import { EnemyPartyConfig, generateModifierType, initBattleWithEnemyConfig, leaveEncounterWithoutBattle, setEncounterRewards, transitionMysteryEncounterIntroVisuals, } from "#app/data/mystery-encounters/utils/encounter-phase-utils";
import { modifierTypes, PokemonHeldItemModifierType } from "#app/modifier/modifier-type";
import { MysteryEncounterType } from "#enums/mystery-encounter-type";
import BattleScene from "#app/battle-scene";
import MysteryEncounter, { MysteryEncounterBuilder } from "../mystery-encounter";
import { MysteryEncounterTier } from "#enums/mystery-encounter-tier";
import { TrainerType } from "#enums/trainer-type";
import { Species } from "#enums/species";
import { Abilities } from "#enums/abilities";
import { getPokemonSpecies } from "#app/data/pokemon-species";
import { Moves } from "#enums/moves";
import { Nature } from "#enums/nature";
import { Type } from "#app/data/type";
import { BerryType } from "#enums/berry-type";
import { Stat } from "#enums/stat";
import { PartyHealPhase, ReturnPhase, ShowTrainerPhase } from "#app/phases";
import { SpeciesFormChangeManualTrigger } from "#app/data/pokemon-forms";
import { applyPostBattleInitAbAttrs, PostBattleInitAbAttr } from "#app/data/ability";
import { showEncounterDialogue } from "#app/data/mystery-encounters/utils/encounter-dialogue-utils";
import { MysteryEncounterMode } from "#enums/mystery-encounter-mode";

/** the i18n namespace for the encounter */
const namespace = "mysteryEncounter:theWinstrateChallenge";

/**
 * The Winstrate Challenge encounter.
 * @see {@link https://github.com/AsdarDevelops/PokeRogue-Events/issues/136 | GitHub Issue #136}
 * @see For biome requirements check {@linkcode mysteryEncountersByBiome}
 */
export const TheWinstrateChallengeEncounter: MysteryEncounter =
  MysteryEncounterBuilder.withEncounterType(MysteryEncounterType.THE_WINSTRATE_CHALLENGE)
    .withEncounterTier(MysteryEncounterTier.ROGUE)
    .withSceneWaveRangeRequirement(80, 180)
    .withIntroSpriteConfigs([
      {
        spriteKey: "vito",
        fileRoot: "trainer",
        hasShadow: false,
        x: 16,
        y: -4
      },
      {
        spriteKey: "vivi",
        fileRoot: "trainer",
        hasShadow: false,
        x: -14,
        y: -4
      },
      {
        spriteKey: "victor",
        fileRoot: "trainer",
        hasShadow: true,
        x: -32
      },
      {
        spriteKey: "victoria",
        fileRoot: "trainer",
        hasShadow: true,
        x: 40,
      },
      {
        spriteKey: "vicky",
        fileRoot: "trainer",
        hasShadow: true,
        x: 3,
        y: 5,
        yShadow: 5
      },
    ])
    .withIntroDialogue([
      {
        text: `${namespace}.intro`,
      },
      {
        speaker: `${namespace}.speaker`,
        text: `${namespace}.intro_dialogue`,
      },
    ])
    .withAutoHideIntroVisuals(false)
    .withOnInit((scene: BattleScene) => {
      const encounter = scene.currentBattle.mysteryEncounter;

      // Loaded back to front for pop() operations
      encounter.enemyPartyConfigs.push(getVitoTrainerConfig(scene));
      encounter.enemyPartyConfigs.push(getVickyTrainerConfig(scene));
      encounter.enemyPartyConfigs.push(getViviTrainerConfig(scene));
      encounter.enemyPartyConfigs.push(getVictoriaTrainerConfig(scene));
      encounter.enemyPartyConfigs.push(getVictorTrainerConfig(scene));

      return true;
    })
    .withTitle(`${namespace}.title`)
    .withDescription(`${namespace}.description`)
    .withQuery(`${namespace}.query`)
    .withSimpleOption(
      {
        buttonLabel: `${namespace}.option.1.label`,
        buttonTooltip: `${namespace}.option.1.tooltip`,
        selected: [
          {
            speaker: "trainerNames:victor",
            text: `${namespace}.option.1.selected`,
          },
        ],
      },
      async (scene: BattleScene) => {
        // Spawn 5 trainer battles back to back with Macho Brace in rewards
        // scene.currentBattle.mysteryEncounter.continuousEncounter = true;
        scene.currentBattle.mysteryEncounter.doContinueEncounter = (scene: BattleScene) => {
          return endTrainerBattleAndShowDialogue(scene);
        };
        await transitionMysteryEncounterIntroVisuals(scene, true, false);
        await spawnNextTrainerOrEndEncounter(scene);
      }
    )
    .withSimpleOption(
      {
        buttonLabel: `${namespace}.option.2.label`,
        buttonTooltip: `${namespace}.option.2.tooltip`,
        selected: [
          {
            speaker: `${namespace}.speaker`,
            text: `${namespace}.option.2.selected`,
          },
        ],
      },
      async (scene: BattleScene) => {
        // Refuse the challenge, they full heal the party and give the player a Rarer Candy
        scene.unshiftPhase(new PartyHealPhase(scene, true));
        setEncounterRewards(scene, { guaranteedModifierTypeFuncs: [modifierTypes.RARER_CANDY], fillRemaining: false });
        leaveEncounterWithoutBattle(scene);
      }
    )
    .build();

async function spawnNextTrainerOrEndEncounter(scene: BattleScene) {
  const encounter = scene.currentBattle.mysteryEncounter;
  const nextConfig = encounter.enemyPartyConfigs.pop();
  if (!nextConfig) {
    await transitionMysteryEncounterIntroVisuals(scene, false, false);
    await showEncounterDialogue(scene, `${namespace}.victory`, `${namespace}.speaker`);
    setEncounterRewards(scene, { guaranteedModifierTypeFuncs: [modifierTypes.MYSTERY_ENCOUNTER_MACHO_BRACE], fillRemaining: false });
    encounter.doContinueEncounter = undefined;
    leaveEncounterWithoutBattle(scene, false, MysteryEncounterMode.TRAINER_BATTLE);
  } else {
    await initBattleWithEnemyConfig(scene, nextConfig);
  }
}

function endTrainerBattleAndShowDialogue(scene: BattleScene): Promise<void> {
  return new Promise(async resolve => {
    if (scene.currentBattle.mysteryEncounter.enemyPartyConfigs.length === 0) {
      // Battle is over
      const trainer = scene.currentBattle.trainer;
      if (trainer) {
        scene.tweens.add({
          targets: trainer,
          x: "+=16",
          y: "-=16",
          alpha: 0,
          ease: "Sine.easeInOut",
          duration: 750,
          onComplete: () => {
            scene.field.remove(trainer, true);
          }
        });
      }

      await spawnNextTrainerOrEndEncounter(scene);
      resolve(); // Wait for all dialogue/post battle stuff to complete before resolving
    } else {
      scene.arena.resetArenaEffects();
      const playerField = scene.getPlayerField();
      playerField.forEach((_, p) => scene.unshiftPhase(new ReturnPhase(scene, p)));

      for (const pokemon of scene.getParty()) {
        // Only trigger form change when Eiscue is in Noice form
        // Hardcoded Eiscue for now in case it is fused with another pokemon
        if (pokemon.species.speciesId === Species.EISCUE && pokemon.hasAbility(Abilities.ICE_FACE) && pokemon.formIndex === 1) {
          scene.triggerPokemonFormChange(pokemon, SpeciesFormChangeManualTrigger);
        }

        pokemon.resetBattleData();
        applyPostBattleInitAbAttrs(PostBattleInitAbAttr, pokemon);
      }

      scene.unshiftPhase(new ShowTrainerPhase(scene));
      // Hide the trainer and init next battle
      const trainer = scene.currentBattle.trainer;
      // Unassign previous trainer from battle so it isn't destroyed before animation completes
      scene.currentBattle.trainer = null;
      await spawnNextTrainerOrEndEncounter(scene);
      if (trainer) {
        scene.tweens.add({
          targets: trainer,
          x: "+=16",
          y: "-=16",
          alpha: 0,
          ease: "Sine.easeInOut",
          duration: 750,
          onComplete: () => {
            scene.field.remove(trainer, true);
            resolve();
          }
        });
      }
    }
  });
}

function getVictorTrainerConfig(scene: BattleScene): EnemyPartyConfig {
  return {
    trainerType: TrainerType.VICTOR,
    pokemonConfigs: [
      {
        species: getPokemonSpecies(Species.SWELLOW),
        isBoss: false,
        abilityIndex: 0, // Guts
        nature: Nature.ADAMANT,
        moveSet: [Moves.FACADE, Moves.BRAVE_BIRD, Moves.PROTECT, Moves.QUICK_ATTACK],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.FLAME_ORB) as PokemonHeldItemModifierType,
            isTransferable: false
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.FOCUS_BAND) as PokemonHeldItemModifierType,
            stackCount: 2,
            isTransferable: false
          },
        ]
      },
      {
        species: getPokemonSpecies(Species.OBSTAGOON),
        isBoss: false,
        abilityIndex: 1, // Guts
        nature: Nature.ADAMANT,
        moveSet: [Moves.FACADE, Moves.OBSTRUCT, Moves.NIGHT_SLASH, Moves.FIRE_PUNCH],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.FLAME_ORB) as PokemonHeldItemModifierType,
            isTransferable: false
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.LEFTOVERS) as PokemonHeldItemModifierType,
            stackCount: 2,
            isTransferable: false
          }
        ]
      }
    ]
  };
}

function getVictoriaTrainerConfig(scene: BattleScene): EnemyPartyConfig {
  return {
    trainerType: TrainerType.VICTORIA,
    pokemonConfigs: [
      {
        species: getPokemonSpecies(Species.ROSERADE),
        isBoss: false,
        abilityIndex: 0, // Natural Cure
        nature: Nature.CALM,
        moveSet: [Moves.SYNTHESIS, Moves.SLUDGE_BOMB, Moves.GIGA_DRAIN, Moves.SLEEP_POWDER],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.SOUL_DEW) as PokemonHeldItemModifierType,
            isTransferable: false
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.QUICK_CLAW) as PokemonHeldItemModifierType,
            stackCount: 2,
            isTransferable: false
          }
        ]
      },
      {
        species: getPokemonSpecies(Species.GARDEVOIR),
        isBoss: false,
        formIndex: 1,
        nature: Nature.TIMID,
        moveSet: [Moves.PSYSHOCK, Moves.MOONBLAST, Moves.SHADOW_BALL, Moves.WILL_O_WISP],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.ATTACK_TYPE_BOOSTER, [Type.PSYCHIC]) as PokemonHeldItemModifierType,
            stackCount: 1,
            isTransferable: false
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.ATTACK_TYPE_BOOSTER, [Type.FAIRY]) as PokemonHeldItemModifierType,
            stackCount: 1,
            isTransferable: false
          }
        ]
      }
    ]
  };
}

function getViviTrainerConfig(scene: BattleScene): EnemyPartyConfig {
  return {
    trainerType: TrainerType.VIVI,
    pokemonConfigs: [
      {
        species: getPokemonSpecies(Species.SEAKING),
        isBoss: false,
        abilityIndex: 3, // Lightning Rod
        nature: Nature.ADAMANT,
        moveSet: [Moves.WATERFALL, Moves.MEGAHORN, Moves.KNOCK_OFF, Moves.REST],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.LUM]) as PokemonHeldItemModifierType,
            stackCount: 2,
            isTransferable: false
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.BASE_STAT_BOOSTER, [Stat.HP]) as PokemonHeldItemModifierType,
            stackCount: 4,
            isTransferable: false
          }
        ]
      },
      {
        species: getPokemonSpecies(Species.BRELOOM),
        isBoss: false,
        abilityIndex: 1, // Poison Heal
        nature: Nature.JOLLY,
        moveSet: [Moves.SPORE, Moves.SWORDS_DANCE, Moves.SEED_BOMB, Moves.DRAIN_PUNCH],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.BASE_STAT_BOOSTER, [Stat.HP]) as PokemonHeldItemModifierType,
            stackCount: 4,
            isTransferable: false
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.TOXIC_ORB) as PokemonHeldItemModifierType,
            isTransferable: false
          }
        ]
      },
      {
        species: getPokemonSpecies(Species.CAMERUPT),
        isBoss: false,
        formIndex: 1,
        nature: Nature.CALM,
        moveSet: [Moves.EARTH_POWER, Moves.FIRE_BLAST, Moves.YAWN, Moves.PROTECT],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.QUICK_CLAW) as PokemonHeldItemModifierType,
            stackCount: 3,
            isTransferable: false
          },
        ]
      }
    ]
  };
}

function getVickyTrainerConfig(scene: BattleScene): EnemyPartyConfig {
  return {
    trainerType: TrainerType.VICKY,
    pokemonConfigs: [
      {
        species: getPokemonSpecies(Species.MEDICHAM),
        isBoss: false,
        formIndex: 1,
        nature: Nature.IMPISH,
        moveSet: [Moves.AXE_KICK, Moves.ICE_PUNCH, Moves.ZEN_HEADBUTT, Moves.BULLET_PUNCH],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.SHELL_BELL) as PokemonHeldItemModifierType,
            isTransferable: false
          }
        ]
      }
    ]
  };
}

function getVitoTrainerConfig(scene: BattleScene): EnemyPartyConfig {
  return {
    trainerType: TrainerType.VITO,
    pokemonConfigs: [
      {
        species: getPokemonSpecies(Species.HISUI_ELECTRODE),
        isBoss: false,
        abilityIndex: 0, // Soundproof
        nature: Nature.MODEST,
        moveSet: [Moves.THUNDERBOLT, Moves.GIGA_DRAIN, Moves.FOUL_PLAY, Moves.THUNDER_WAVE],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.BASE_STAT_BOOSTER, [Stat.SPD]) as PokemonHeldItemModifierType,
            stackCount: 2,
            isTransferable: false
          }
        ]
      },
      {
        species: getPokemonSpecies(Species.SWALOT),
        isBoss: false,
        abilityIndex: 2, // Gluttony
        nature: Nature.QUIET,
        moveSet: [Moves.SLUDGE_BOMB, Moves.GIGA_DRAIN, Moves.ICE_BEAM, Moves.EARTHQUAKE],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.SITRUS]) as PokemonHeldItemModifierType,
            stackCount: 2,
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.APICOT]) as PokemonHeldItemModifierType,
            stackCount: 2,
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.GANLON]) as PokemonHeldItemModifierType,
            stackCount: 2,
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.STARF]) as PokemonHeldItemModifierType,
            stackCount: 2,
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.SALAC]) as PokemonHeldItemModifierType,
            stackCount: 2,
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.LUM]) as PokemonHeldItemModifierType,
            stackCount: 2,
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.LANSAT]) as PokemonHeldItemModifierType,
            stackCount: 2,
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.LIECHI]) as PokemonHeldItemModifierType,
            stackCount: 2,
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.PETAYA]) as PokemonHeldItemModifierType,
            stackCount: 2,
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.ENIGMA]) as PokemonHeldItemModifierType,
            stackCount: 2,
          },
          {
            modifierType: generateModifierType(scene, modifierTypes.BERRY, [BerryType.LEPPA]) as PokemonHeldItemModifierType,
            stackCount: 2,
          }
        ]
      },
      {
        species: getPokemonSpecies(Species.DODRIO),
        isBoss: false,
        abilityIndex: 2, // Tangled Feet
        nature: Nature.JOLLY,
        moveSet: [Moves.DRILL_PECK, Moves.QUICK_ATTACK, Moves.THRASH, Moves.KNOCK_OFF],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.KINGS_ROCK) as PokemonHeldItemModifierType,
            stackCount: 2,
            isTransferable: false
          }
        ]
      },
      {
        species: getPokemonSpecies(Species.ALAKAZAM),
        isBoss: false,
        formIndex: 1,
        nature: Nature.BOLD,
        moveSet: [Moves.PSYCHIC, Moves.SHADOW_BALL, Moves.FOCUS_BLAST, Moves.THUNDERBOLT],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.WIDE_LENS) as PokemonHeldItemModifierType,
            stackCount: 2,
            isTransferable: false
          },
        ]
      },
      {
        species: getPokemonSpecies(Species.DARMANITAN),
        isBoss: false,
        abilityIndex: 0, // Sheer Force
        nature: Nature.IMPISH,
        moveSet: [Moves.EARTHQUAKE, Moves.U_TURN, Moves.FLARE_BLITZ, Moves.ROCK_SLIDE],
        modifierConfigs: [
          {
            modifierType: generateModifierType(scene, modifierTypes.QUICK_CLAW) as PokemonHeldItemModifierType,
            stackCount: 2,
            isTransferable: false
          },
        ]
      }
    ]
  };
}
