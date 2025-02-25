import { BattleStat } from "#app/data/battle-stat";
import { MysteryEncounterOptionBuilder } from "#app/data/mystery-encounters/mystery-encounter-option";
import {
  EnemyPartyConfig, generateModifierType, generateModifierTypeOption,
  initBattleWithEnemyConfig,
  leaveEncounterWithoutBattle, setEncounterExp,
  setEncounterRewards
} from "#app/data/mystery-encounters/utils/encounter-phase-utils";
import Pokemon, { EnemyPokemon, PlayerPokemon } from "#app/field/pokemon";
import {
  BerryModifierType,
  getPartyLuckValue,
  ModifierPoolType,
  ModifierTypeOption, modifierTypes,
  regenerateModifierPoolThresholds,
} from "#app/modifier/modifier-type";
import { StatChangePhase } from "#app/phases";
import { randSeedInt } from "#app/utils";
import { BattlerTagType } from "#enums/battler-tag-type";
import { MysteryEncounterType } from "#enums/mystery-encounter-type";
import BattleScene from "#app/battle-scene";
import MysteryEncounter, { MysteryEncounterBuilder } from "../mystery-encounter";
import { queueEncounterMessage, showEncounterText } from "#app/data/mystery-encounters/utils/encounter-dialogue-utils";
import { getPokemonNameWithAffix } from "#app/messages";
import { MysteryEncounterTier } from "#enums/mystery-encounter-tier";
import { MysteryEncounterOptionMode } from "#enums/mystery-encounter-option-mode";
import { TrainerSlot } from "#app/data/trainer-config";
import { applyModifierTypeToPlayerPokemon, getHighestStatPlayerPokemon, getSpriteKeysFromPokemon } from "#app/data/mystery-encounters/utils/encounter-pokemon-utils";
import PokemonData from "#app/system/pokemon-data";
import { BerryModifier } from "#app/modifier/modifier";
import i18next from "#app/plugins/i18n";
import { BerryType } from "#enums/berry-type";
import { Stat } from "#enums/stat";

/** the i18n namespace for the encounter */
const namespace = "mysteryEncounter:berriesAbound";

/**
 * Berries Abound encounter.
 * @see {@link https://github.com/AsdarDevelops/PokeRogue-Events/issues/24 | GitHub Issue #24}
 * @see For biome requirements check {@linkcode mysteryEncountersByBiome}
 */
export const BerriesAboundEncounter: MysteryEncounter =
  MysteryEncounterBuilder.withEncounterType(MysteryEncounterType.BERRIES_ABOUND)
    .withEncounterTier(MysteryEncounterTier.COMMON)
    .withSceneWaveRangeRequirement(10, 180) // waves 10 to 180
    .withCatchAllowed(true)
    .withHideWildIntroMessage(true)
    .withIntroSpriteConfigs([
      {
        spriteKey: "lum_berry",
        fileRoot: "items",
        isItem: true,
        x: 7,
        y: -14,
        disableAnimation: true
      },
      {
        spriteKey: "salac_berry",
        fileRoot: "items",
        isItem: true,
        x: 2,
        y: 4,
        disableAnimation: true
      },
      {
        spriteKey: "lansat_berry",
        fileRoot: "items",
        isItem: true,
        x: 32,
        y: 5,
        disableAnimation: true
      },
      {
        spriteKey: "liechi_berry",
        fileRoot: "items",
        isItem: true,
        x: 6,
        y: -5,
        disableAnimation: true
      },
      {
        spriteKey: "sitrus_berry",
        fileRoot: "items",
        isItem: true,
        x: 7,
        y: 8,
        disableAnimation: true
      },
      {
        spriteKey: "enigma_berry",
        fileRoot: "items",
        isItem: true,
        x: 26,
        y: -4,
        disableAnimation: true
      },
      {
        spriteKey: "leppa_berry",
        fileRoot: "items",
        isItem: true,
        x: 16,
        y: -27,
        disableAnimation: true
      },
      {
        spriteKey: "petaya_berry",
        fileRoot: "items",
        isItem: true,
        x: 30,
        y: -17,
        disableAnimation: true
      },
      {
        spriteKey: "ganlon_berry",
        fileRoot: "items",
        isItem: true,
        x: 16,
        y: -11,
        disableAnimation: true
      },
      {
        spriteKey: "apicot_berry",
        fileRoot: "items",
        isItem: true,
        x: 14,
        y: -2,
        disableAnimation: true
      },
      {
        spriteKey: "starf_berry",
        fileRoot: "items",
        isItem: true,
        x: 18,
        y: 9,
        disableAnimation: true
      },
    ]) // Set in onInit()
    .withIntroDialogue([
      {
        text: `${namespace}.intro`,
      },
    ])
    .withOnInit((scene: BattleScene) => {
      const encounter = scene.currentBattle.mysteryEncounter;

      // Calculate boss mon
      const bossSpecies = scene.arena.randomSpecies(scene.currentBattle.waveIndex, scene.currentBattle.waveIndex, 0, getPartyLuckValue(scene.getParty()), true);
      const bossPokemon = new EnemyPokemon(scene, bossSpecies, scene.currentBattle.waveIndex, TrainerSlot.NONE, true);
      encounter.setDialogueToken("enemyPokemon", getPokemonNameWithAffix(bossPokemon));
      const config: EnemyPartyConfig = {
        levelAdditiveMultiplier: 1,
        pokemonConfigs: [{
          species: bossSpecies,
          dataSource: new PokemonData(bossPokemon),
          isBoss: true
        }],
      };
      encounter.enemyPartyConfigs = [config];

      // Calculate the number of extra berries that player receives
      // 10-40: 2, 40-120: 4, 120-160: 5, 160-180: 7
      const numBerries =
        scene.currentBattle.waveIndex > 160 ? 7
          : scene.currentBattle.waveIndex > 120 ? 5
            : scene.currentBattle.waveIndex > 40 ? 4 : 2;
      regenerateModifierPoolThresholds(scene.getParty(), ModifierPoolType.PLAYER, 0);
      encounter.misc = { numBerries };

      const { spriteKey, fileRoot } = getSpriteKeysFromPokemon(bossPokemon);
      encounter.spriteConfigs.push({
        spriteKey: spriteKey,
        fileRoot: fileRoot,
        hasShadow: true,
        tint: 0.25,
        x: -5,
        repeat: true,
        isPokemon: true
      });

      // Get fastest party pokemon for option 2
      const fastestPokemon = getHighestStatPlayerPokemon(scene, Stat.SPD, true);
      encounter.misc.fastestPokemon = fastestPokemon;
      encounter.misc.enemySpeed = bossPokemon.getStat(Stat.SPD);
      encounter.setDialogueToken("fastestPokemon", fastestPokemon.getNameToRender());

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
            text: `${namespace}.option.1.selected`,
          },
        ],
      },
      async (scene: BattleScene) => {
        // Pick battle
        const encounter = scene.currentBattle.mysteryEncounter;
        const numBerries = encounter.misc.numBerries;

        const doBerryRewards = async () => {
          const berryText = numBerries + " " + i18next.t(`${namespace}.berries`);

          scene.playSound("item_fanfare");
          queueEncounterMessage(scene, i18next.t("battle:rewardGain", { modifierName: berryText }));

          // Generate a random berry and give it to the first Pokemon with room for it
          for (let i = 0; i < numBerries; i++) {
            await tryGiveBerry(scene);
          }
        };

        const shopOptions: ModifierTypeOption[] = [];
        for (let i = 0; i < 5; i++) {
          // Generate shop berries
          shopOptions.push(generateModifierTypeOption(scene, modifierTypes.BERRY));
        }

        setEncounterRewards(scene, { guaranteedModifierTypeOptions: shopOptions, fillRemaining: false }, undefined, doBerryRewards);
        await initBattleWithEnemyConfig(scene, scene.currentBattle.mysteryEncounter.enemyPartyConfigs[0]);
      }
    )
    .withOption(
      MysteryEncounterOptionBuilder
        .newOptionWithMode(MysteryEncounterOptionMode.DEFAULT)
        .withDialogue({
          buttonLabel: `${namespace}.option.2.label`,
          buttonTooltip: `${namespace}.option.2.tooltip`
        })
        .withOptionPhase(async (scene: BattleScene) => {
          // Pick race for berries
          const encounter = scene.currentBattle.mysteryEncounter;
          const fastestPokemon = encounter.misc.fastestPokemon;
          const enemySpeed = encounter.misc.enemySpeed;
          const speedDiff = fastestPokemon.getStat(Stat.SPD) / enemySpeed;
          const numBerries = encounter.misc.numBerries;

          const shopOptions: ModifierTypeOption[] = [];
          for (let i = 0; i < 5; i++) {
            // Generate shop berries
            shopOptions.push(generateModifierTypeOption(scene, modifierTypes.BERRY));
          }

          if (speedDiff < 1) {
            // Caught and attacked by boss, gets +1 to all stats at start of fight
            const doBerryRewards = async () => {
              const berryText = numBerries + " " + i18next.t(`${namespace}.berries`);

              scene.playSound("item_fanfare");
              queueEncounterMessage(scene, i18next.t("battle:rewardGain", { modifierName: berryText }));

              // Generate a random berry and give it to the first Pokemon with room for it
              for (let i = 0; i < numBerries; i++) {
                await tryGiveBerry(scene);
              }
            };

            const config = scene.currentBattle.mysteryEncounter.enemyPartyConfigs[0];
            config.pokemonConfigs![0].tags = [BattlerTagType.MYSTERY_ENCOUNTER_POST_SUMMON];
            config.pokemonConfigs![0].mysteryEncounterBattleEffects = (pokemon: Pokemon) => {
              queueEncounterMessage(pokemon.scene, `${namespace}.option.2.boss_enraged`);
              pokemon.scene.unshiftPhase(new StatChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, [BattleStat.ATK, BattleStat.DEF, BattleStat.SPATK, BattleStat.SPDEF, BattleStat.SPD], 1));
            };
            setEncounterRewards(scene, { guaranteedModifierTypeOptions: shopOptions, fillRemaining: false }, undefined, doBerryRewards);
            await showEncounterText(scene, `${namespace}.option.2.selected_bad`);
            await initBattleWithEnemyConfig(scene, config);
            return;
          } else {
            // Gains 1 berry for every 10% faster the player's pokemon is than the enemy, up to a max of numBerries, minimum of 1
            const numBerriesGrabbed = Math.max(Math.min(Math.round((speedDiff - 1)/0.1), numBerries), 1);
            encounter.setDialogueToken("numBerries", String(numBerriesGrabbed));
            const doFasterBerryRewards = async () => {
              const berryText = numBerriesGrabbed + " " + i18next.t(`${namespace}.berries`);

              scene.playSound("item_fanfare");
              queueEncounterMessage(scene, i18next.t("battle:rewardGain", { modifierName: berryText }));

              // Generate a random berry and give it to the first Pokemon with room for it (trying to give to fastest first)
              for (let i = 0; i < numBerriesGrabbed; i++) {
                await tryGiveBerry(scene, fastestPokemon);
              }
            };

            setEncounterExp(scene, fastestPokemon.id, encounter.enemyPartyConfigs[0].pokemonConfigs![0].species.baseExp);
            setEncounterRewards(scene, { guaranteedModifierTypeOptions: shopOptions, fillRemaining: false }, undefined, doFasterBerryRewards);
            await showEncounterText(scene, `${namespace}.option.2.selected`);
            leaveEncounterWithoutBattle(scene);
          }
        })
        .build()
    )
    .withSimpleOption(
      {
        buttonLabel: `${namespace}.option.3.label`,
        buttonTooltip: `${namespace}.option.3.tooltip`,
        selected: [
          {
            text: `${namespace}.option.3.selected`,
          },
        ],
      },
      async (scene: BattleScene) => {
        // Leave encounter with no rewards or exp
        leaveEncounterWithoutBattle(scene, true);
        return true;
      }
    )
    .build();

async function tryGiveBerry(scene: BattleScene, prioritizedPokemon?: PlayerPokemon) {
  const berryType = randSeedInt(Object.keys(BerryType).filter(s => !isNaN(Number(s))).length) as BerryType;
  const berry = generateModifierType(scene, modifierTypes.BERRY, [berryType]) as BerryModifierType;

  const party = scene.getParty();

  // Will try to apply to prioritized pokemon first, then do normal application method if it fails
  if (prioritizedPokemon) {
    const heldBerriesOfType = scene.findModifier(m => m instanceof BerryModifier
      && m.pokemonId === prioritizedPokemon.id && (m as BerryModifier).berryType === berryType, true) as BerryModifier;

    if (!heldBerriesOfType || heldBerriesOfType.getStackCount() < heldBerriesOfType.getMaxStackCount(scene)) {
      await applyModifierTypeToPlayerPokemon(scene, prioritizedPokemon, berry);
      return;
    }
  }

  // Iterate over the party until berry was successfully given
  for (const pokemon of party) {
    const heldBerriesOfType = scene.findModifier(m => m instanceof BerryModifier
      && m.pokemonId === pokemon.id && (m as BerryModifier).berryType === berryType, true) as BerryModifier;

    if (!heldBerriesOfType || heldBerriesOfType.getStackCount() < heldBerriesOfType.getMaxStackCount(scene)) {
      await applyModifierTypeToPlayerPokemon(scene, pokemon, berry);
      break;
    }
  }
}
