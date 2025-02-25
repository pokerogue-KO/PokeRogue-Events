import { EnemyPartyConfig, EnemyPokemonConfig, generateModifierType, initBattleWithEnemyConfig, leaveEncounterWithoutBattle, loadCustomMovesForEncounter, setEncounterRewards, transitionMysteryEncounterIntroVisuals, } from "#app/data/mystery-encounters/utils/encounter-phase-utils";
import { modifierTypes, PokemonHeldItemModifierType } from "#app/modifier/modifier-type";
import { MysteryEncounterType } from "#enums/mystery-encounter-type";
import BattleScene from "#app/battle-scene";
import MysteryEncounter, { MysteryEncounterBuilder } from "../mystery-encounter";
import { MysteryEncounterOptionBuilder } from "../mystery-encounter-option";
import { ModifierRewardPhase } from "#app/phases";
import { MysteryEncounterTier } from "#enums/mystery-encounter-tier";
import { MysteryEncounterOptionMode } from "#enums/mystery-encounter-option-mode";
import { Species } from "#enums/species";
import { HitHealModifier, PokemonHeldItemModifier, TurnHealModifier } from "#app/modifier/modifier";
import { applyModifierTypeToPlayerPokemon } from "#app/data/mystery-encounters/utils/encounter-pokemon-utils";
import { showEncounterText } from "#app/data/mystery-encounters/utils/encounter-dialogue-utils";
import i18next from "#app/plugins/i18n";
import { ModifierTier } from "#app/modifier/modifier-tier";
import { getPokemonSpecies } from "#app/data/pokemon-species";
import { Moves } from "#enums/moves";
import { BattlerIndex } from "#app/battle";
import { PokemonMove } from "#app/field/pokemon";

/** the i18n namespace for this encounter */
const namespace = "mysteryEncounter:trashToTreasure";

const SOUND_EFFECT_WAIT_TIME = 700;

/**
 * Trash to Treasure encounter.
 * @see {@link https://github.com/AsdarDevelops/PokeRogue-Events/issues/74 | GitHub Issue #74}
 * @see For biome requirements check {@linkcode mysteryEncountersByBiome}
 */
export const TrashToTreasureEncounter: MysteryEncounter =
  MysteryEncounterBuilder.withEncounterType(MysteryEncounterType.TRASH_TO_TREASURE)
    .withEncounterTier(MysteryEncounterTier.ULTRA)
    .withSceneWaveRangeRequirement(10, 180)
    .withMaxAllowedEncounters(1)
    .withIntroSpriteConfigs([
      {
        spriteKey: Species.GARBODOR.toString() + "-gigantamax",
        fileRoot: "pokemon",
        hasShadow: false,
        disableAnimation: true,
        scale: 1.5,
        y: 8,
        tint: 0.4
      }
    ])
    .withAutoHideIntroVisuals(false)
    .withIntroDialogue([
      {
        text: `${namespace}.intro`,
      },
    ])
    .withTitle(`${namespace}.title`)
    .withDescription(`${namespace}.description`)
    .withQuery(`${namespace}.query`)
    .withOnInit((scene: BattleScene) => {
      const encounter = scene.currentBattle.mysteryEncounter;

      // Calculate boss mon
      const bossSpecies = getPokemonSpecies(Species.GARBODOR);
      const pokemonConfig: EnemyPokemonConfig = {
        species: bossSpecies,
        isBoss: true,
        formIndex: 1, // Gmax
        bossSegmentModifier: 1, // +1 Segment from normal
        moveSet: [Moves.PAYBACK, Moves.GUNK_SHOT, Moves.STOMPING_TANTRUM, Moves.DRAIN_PUNCH]
      };
      const config: EnemyPartyConfig = {
        levelAdditiveMultiplier: 1,
        pokemonConfigs: [pokemonConfig],
        disableSwitch: true
      };
      encounter.enemyPartyConfigs = [config];

      // Load animations/sfx for Garbodor fight start moves
      loadCustomMovesForEncounter(scene, [Moves.TOXIC, Moves.AMNESIA]);

      scene.loadSe("PRSFX- Dig2", "battle_anims", "PRSFX- Dig2.wav");
      scene.loadSe("PRSFX- Venom Drench", "battle_anims", "PRSFX- Venom Drench.wav");
      return true;
    })
    .withOption(
      MysteryEncounterOptionBuilder
        .newOptionWithMode(MysteryEncounterOptionMode.DEFAULT)
        .withDialogue({
          buttonLabel: `${namespace}.option.1.label`,
          buttonTooltip: `${namespace}.option.1.tooltip`,
          selected: [
            {
              text: `${namespace}.option.1.selected`,
            },
          ],
        })
        .withPreOptionPhase(async (scene: BattleScene) => {
          // Play Dig2 and then Venom Drench sfx
          doGarbageDig(scene);
        })
        .withOptionPhase(async (scene: BattleScene) => {
          // Gain 2 Leftovers and 2 Shell Bell
          transitionMysteryEncounterIntroVisuals(scene);
          await tryApplyDigRewardItems(scene);

          // Give the player the Black Sludge curse
          scene.unshiftPhase(new ModifierRewardPhase(scene, modifierTypes.MYSTERY_ENCOUNTER_BLACK_SLUDGE));
          leaveEncounterWithoutBattle(scene, true);
        })
        .build()
    )
    .withOption(
      MysteryEncounterOptionBuilder
        .newOptionWithMode(MysteryEncounterOptionMode.DEFAULT)
        .withDialogue({
          buttonLabel: `${namespace}.option.2.label`,
          buttonTooltip: `${namespace}.option.2.tooltip`,
          selected: [
            {
              text: `${namespace}.option.2.selected`,
            },
          ],
        })
        .withOptionPhase(async (scene: BattleScene) => {
          // Investigate garbage, battle Gmax Garbodor
          scene.setFieldScale(0.75);
          await showEncounterText(scene, `${namespace}.option.2.selected_2`);
          transitionMysteryEncounterIntroVisuals(scene);

          const encounter = scene.currentBattle.mysteryEncounter;

          setEncounterRewards(scene, { guaranteedModifierTiers: [ModifierTier.ROGUE, ModifierTier.ROGUE, ModifierTier.ULTRA, ModifierTier.GREAT], fillRemaining: true });
          encounter.startOfBattleEffects.push(
            {
              sourceBattlerIndex: BattlerIndex.ENEMY,
              targets: [BattlerIndex.PLAYER],
              move: new PokemonMove(Moves.TOXIC),
              ignorePp: true
            },
            {
              sourceBattlerIndex: BattlerIndex.ENEMY,
              targets: [BattlerIndex.ENEMY],
              move: new PokemonMove(Moves.AMNESIA),
              ignorePp: true
            });
          await initBattleWithEnemyConfig(scene, encounter.enemyPartyConfigs[0]);
        })
        .build()
    )
    .build();

async function tryApplyDigRewardItems(scene: BattleScene) {
  const shellBell = generateModifierType(scene, modifierTypes.SHELL_BELL) as PokemonHeldItemModifierType;
  const leftovers = generateModifierType(scene, modifierTypes.LEFTOVERS) as PokemonHeldItemModifierType;

  const party = scene.getParty();

  // Iterate over the party until an item was successfully given
  // First leftovers
  for (const pokemon of party) {
    const heldItems = scene.findModifiers(m => m instanceof PokemonHeldItemModifier
      && m.pokemonId === pokemon.id, true) as PokemonHeldItemModifier[];
    const existingLeftovers = heldItems.find(m => m instanceof TurnHealModifier) as TurnHealModifier;

    if (!existingLeftovers || existingLeftovers.getStackCount() < existingLeftovers.getMaxStackCount(scene)) {
      await applyModifierTypeToPlayerPokemon(scene, pokemon, leftovers);
      break;
    }
  }

  // Second leftovers
  for (const pokemon of party) {
    const heldItems = scene.findModifiers(m => m instanceof PokemonHeldItemModifier
      && m.pokemonId === pokemon.id, true) as PokemonHeldItemModifier[];
    const existingLeftovers = heldItems.find(m => m instanceof TurnHealModifier) as TurnHealModifier;

    if (!existingLeftovers || existingLeftovers.getStackCount() < existingLeftovers.getMaxStackCount(scene)) {
      await applyModifierTypeToPlayerPokemon(scene, pokemon, leftovers);
      break;
    }
  }

  scene.playSound("item_fanfare");
  await showEncounterText(scene, i18next.t("battle:rewardGain", { modifierName: "2 " + leftovers.name }), undefined, true);

  // First Shell bell
  for (const pokemon of party) {
    const heldItems = scene.findModifiers(m => m instanceof PokemonHeldItemModifier
      && m.pokemonId === pokemon.id, true) as PokemonHeldItemModifier[];
    const existingShellBell = heldItems.find(m => m instanceof HitHealModifier) as HitHealModifier;

    if (!existingShellBell || existingShellBell.getStackCount() < existingShellBell.getMaxStackCount(scene)) {
      await applyModifierTypeToPlayerPokemon(scene, pokemon, shellBell);
      break;
    }
  }

  // Second Shell bell
  for (const pokemon of party) {
    const heldItems = scene.findModifiers(m => m instanceof PokemonHeldItemModifier
      && m.pokemonId === pokemon.id, true) as PokemonHeldItemModifier[];
    const existingShellBell = heldItems.find(m => m instanceof HitHealModifier) as HitHealModifier;

    if (!existingShellBell || existingShellBell.getStackCount() < existingShellBell.getMaxStackCount(scene)) {
      await applyModifierTypeToPlayerPokemon(scene, pokemon, shellBell);
      break;
    }
  }

  scene.playSound("item_fanfare");
  await showEncounterText(scene, i18next.t("battle:rewardGain", { modifierName: "2 " + shellBell.name }), undefined, true);
}

async function doGarbageDig(scene: BattleScene) {
  scene.playSound("PRSFX- Dig2");
  scene.time.delayedCall(SOUND_EFFECT_WAIT_TIME, () => {
    scene.playSound("PRSFX- Dig2");
    scene.playSound("PRSFX- Venom Drench", { volume: 2 });
  });
  scene.time.delayedCall(SOUND_EFFECT_WAIT_TIME * 2, () => {
    scene.playSound("PRSFX- Dig2");
  });
}
