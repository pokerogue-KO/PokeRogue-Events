import Battle, { BattlerIndex, BattleType } from "#app/battle";
import { biomeLinks, BiomePoolTier } from "#app/data/biomes";
import MysteryEncounterOption from "#app/data/mystery-encounters/mystery-encounter-option";
import { WEIGHT_INCREMENT_ON_SPAWN_MISS } from "#app/data/mystery-encounters/mystery-encounters";
import { showEncounterText } from "#app/data/mystery-encounters/utils/encounter-dialogue-utils";
import Pokemon, { FieldPosition, PlayerPokemon, PokemonMove, PokemonSummonData } from "#app/field/pokemon";
import { ExpBalanceModifier, ExpShareModifier, MultipleParticipantExpBonusModifier, PokemonExpBoosterModifier } from "#app/modifier/modifier";
import { CustomModifierSettings, ModifierPoolType, ModifierType, ModifierTypeGenerator, ModifierTypeOption, modifierTypes, regenerateModifierPoolThresholds } from "#app/modifier/modifier-type";
import { BattleEndPhase, EggLapsePhase, ExpPhase, GameOverPhase, MovePhase, SelectModifierPhase, ShowPartyExpBarPhase, TrainerVictoryPhase } from "#app/phases";
import { MysteryEncounterBattlePhase, MysteryEncounterBattleStartCleanupPhase, MysteryEncounterPhase, MysteryEncounterRewardsPhase } from "#app/phases/mystery-encounter-phases";
import PokemonData from "#app/system/pokemon-data";
import { OptionSelectConfig, OptionSelectItem } from "#app/ui/abstact-option-select-ui-handler";
import { PartyOption, PartyUiMode, PokemonSelectFilter } from "#app/ui/party-ui-handler";
import { Mode } from "#app/ui/ui";
import * as Utils from "#app/utils";
import { isNullOrUndefined } from "#app/utils";
import { BattlerTagType } from "#enums/battler-tag-type";
import { Biome } from "#enums/biome";
import { TrainerType } from "#enums/trainer-type";
import i18next from "i18next";
import BattleScene from "#app/battle-scene";
import Trainer, { TrainerVariant } from "#app/field/trainer";
import { Gender } from "#app/data/gender";
import { Nature } from "#app/data/nature";
import { Moves } from "#enums/moves";
import { initMoveAnim, loadMoveAnimAssets } from "#app/data/battle-anims";
import { MysteryEncounterMode } from "#enums/mystery-encounter-mode";
import { Status, StatusEffect } from "#app/data/status-effect";
import { TrainerConfig, trainerConfigs, TrainerSlot } from "#app/data/trainer-config";
import PokemonSpecies from "#app/data/pokemon-species";
import Overrides from "#app/overrides";
import { Egg, IEggOptions } from "#app/data/egg";
import { MysteryEncounterPokemonData } from "#app/data/mystery-encounters/mystery-encounter-pokemon-data";
import HeldModifierConfig from "#app/interfaces/held-modifier-config";

/**
 * Animates exclamation sprite over trainer's head at start of encounter
 * @param scene
 */
export function doTrainerExclamation(scene: BattleScene) {
  const exclamationSprite = scene.add.sprite(0, 0, "exclaim");
  exclamationSprite.setName("exclamation");
  scene.field.add(exclamationSprite);
  scene.field.moveTo(exclamationSprite, scene.field.getAll().length - 1);
  exclamationSprite.setVisible(true);
  exclamationSprite.setPosition(110, 68);
  scene.tweens.add({
    targets: exclamationSprite,
    y: "-=25",
    ease: "Cubic.easeOut",
    duration: 300,
    yoyo: true,
    onComplete: () => {
      scene.time.delayedCall(800, () => {
        scene.field.remove(exclamationSprite, true);
      });
    }
  });

  scene.playSound("GEN8- Exclaim", { volume: 0.7 });
}

export interface EnemyPokemonConfig {
  species: PokemonSpecies;
  isBoss: boolean;
  bossSegments?: number;
  bossSegmentModifier?: number; // Additive to the determined segment number
  mysteryEncounterData?: MysteryEncounterPokemonData;
  formIndex?: number;
  abilityIndex?: number;
  level?: number;
  gender?: Gender;
  passive?: boolean;
  moveSet?: Moves[];
  nature?: Nature;
  ivs?: [integer, integer, integer, integer, integer, integer];
  shiny?: boolean;
  /** Can set just the status, or pass a timer on the status turns */
  status?: StatusEffect | [StatusEffect, number];
  mysteryEncounterBattleEffects?: (pokemon: Pokemon) => void;
  modifierConfigs?: HeldModifierConfig[];
  tags?: BattlerTagType[];
  dataSource?: PokemonData;
}

export interface EnemyPartyConfig {
  levelAdditiveMultiplier?: number; // Formula for enemy: level += waveIndex / 10 * levelAdditive
  doubleBattle?: boolean;
  trainerType?: TrainerType; // Generates trainer battle solely off trainer type
  trainerConfig?: TrainerConfig; // More customizable option for configuring trainer battle
  pokemonConfigs?: EnemyPokemonConfig[];
  female?: boolean; // True for female trainer, false for male
  disableSwitch?: boolean; // True will prevent player from switching
}

/**
 * Generates an enemy party for a mystery encounter battle
 * This will override and replace any standard encounter generation logic
 * Useful for tailoring specific battles to mystery encounters
 * @param scene - Battle Scene
 * @param partyConfig - Can pass various customizable attributes for the enemy party, see EnemyPartyConfig
 */
export async function initBattleWithEnemyConfig(scene: BattleScene, partyConfig: EnemyPartyConfig): Promise<void> {
  const loaded: boolean = false;
  const loadEnemyAssets: Promise<void>[] = [];

  const battle: Battle = scene.currentBattle;

  let doubleBattle: boolean = partyConfig?.doubleBattle ?? false;

  // Trainer
  const trainerType = partyConfig?.trainerType;
  const partyTrainerConfig = partyConfig?.trainerConfig;
  let trainerConfig: TrainerConfig;
  if (!isNullOrUndefined(trainerType) || partyTrainerConfig) {
    scene.currentBattle.mysteryEncounter.encounterMode = MysteryEncounterMode.TRAINER_BATTLE;
    if (scene.currentBattle.trainer) {
      scene.currentBattle.trainer.setVisible(false);
      scene.currentBattle.trainer.destroy();
    }

    trainerConfig = partyConfig?.trainerConfig ? partyConfig?.trainerConfig : trainerConfigs[trainerType!];

    const doubleTrainer = trainerConfig.doubleOnly || (trainerConfig.hasDouble && !!partyConfig.doubleBattle);
    doubleBattle = doubleTrainer;
    const trainerFemale = isNullOrUndefined(partyConfig.female) ? !!(Utils.randSeedInt(2)) : partyConfig.female;
    const newTrainer = new Trainer(scene, trainerConfig.trainerType, doubleTrainer ? TrainerVariant.DOUBLE : trainerFemale ? TrainerVariant.FEMALE : TrainerVariant.DEFAULT, undefined, undefined, undefined, trainerConfig);
    newTrainer.x += 300;
    newTrainer.setVisible(false);
    scene.field.add(newTrainer);
    scene.currentBattle.trainer = newTrainer;
    loadEnemyAssets.push(newTrainer.loadAssets());

    battle.enemyLevels = scene.currentBattle.trainer.getPartyLevels(scene.currentBattle.waveIndex);
  } else {
    // Wild
    scene.currentBattle.mysteryEncounter.encounterMode = MysteryEncounterMode.WILD_BATTLE;
    const numEnemies = partyConfig?.pokemonConfigs && partyConfig.pokemonConfigs.length > 0 ? partyConfig?.pokemonConfigs?.length : doubleBattle ? 2 : 1;
    battle.enemyLevels = new Array(numEnemies).fill(null).map(() => scene.currentBattle.getLevelForWave());
  }

  scene.getEnemyParty().forEach(enemyPokemon => enemyPokemon.destroy());
  battle.enemyParty = [];
  battle.double = doubleBattle;

  // ME levels are modified by an additive value that scales with wave index
  // Base scaling: Every 10 waves, modifier gets +1 level
  // This can be amplified or counteracted by setting levelAdditiveMultiplier in config
  // levelAdditiveMultiplier value of 0.5 will halve the modifier scaling, 2 will double it, etc.
  // Leaving null/undefined will disable level scaling
  const mult: number = !isNullOrUndefined(partyConfig.levelAdditiveMultiplier) ? partyConfig.levelAdditiveMultiplier! : 0;
  const additive = Math.max(Math.round((scene.currentBattle.waveIndex / 10) * mult), 0);
  battle.enemyLevels = battle.enemyLevels.map(level => level + additive);

  battle.enemyLevels.forEach((level, e) => {
    let enemySpecies;
    let dataSource;
    let isBoss = false;
    if (!loaded) {
      if ((!isNullOrUndefined(trainerType) || trainerConfig) && battle.trainer) {
        // Allows overriding a trainer's pokemon to use specific species/data
        if (partyConfig?.pokemonConfigs && e < partyConfig.pokemonConfigs.length) {
          const config = partyConfig.pokemonConfigs[e];
          level = config.level ? config.level : level;
          dataSource = config.dataSource;
          enemySpecies = config.species;
          isBoss = config.isBoss;
          battle.enemyParty[e] = scene.addEnemyPokemon(enemySpecies, level, TrainerSlot.TRAINER, isBoss, dataSource);
        } else {
          battle.enemyParty[e] = battle.trainer.genPartyMember(e);
        }
      } else {
        if (partyConfig?.pokemonConfigs && e < partyConfig.pokemonConfigs.length) {
          const config = partyConfig.pokemonConfigs[e];
          level = config.level ? config.level : level;
          dataSource = config.dataSource;
          enemySpecies = config.species;
          isBoss = config.isBoss;
          if (isBoss) {
            scene.currentBattle.mysteryEncounter.encounterMode = MysteryEncounterMode.BOSS_BATTLE;
          }
        } else {
          enemySpecies = scene.randomSpecies(battle.waveIndex, level, true);
        }

        battle.enemyParty[e] = scene.addEnemyPokemon(enemySpecies, level, TrainerSlot.NONE, isBoss, dataSource);
      }
    }

    const enemyPokemon = scene.getEnemyParty()[e];

    // Make sure basic data is clean
    enemyPokemon.hp = enemyPokemon.getMaxHp();
    enemyPokemon.status = null;
    enemyPokemon.passive = false;

    if (e < (doubleBattle ? 2 : 1)) {
      enemyPokemon.setX(-66 + enemyPokemon.getFieldPositionOffset()[0]);
      enemyPokemon.resetSummonData();
    }

    if (!loaded) {
      scene.gameData.setPokemonSeen(enemyPokemon, true, !!(trainerType || trainerConfig));
    }

    if (partyConfig?.pokemonConfigs && e < partyConfig.pokemonConfigs.length) {
      const config = partyConfig.pokemonConfigs[e];

      // Generate new id, reset status and HP in case using data source
      if (config.dataSource) {
        enemyPokemon.id = Utils.randSeedInt(4294967296);
      }

      // Set form
      if (!isNullOrUndefined(config.formIndex)) {
        enemyPokemon.formIndex = config.formIndex!;
      }

      // Set shiny
      if (!isNullOrUndefined(config.shiny)) {
        enemyPokemon.shiny = config.shiny!;
      }

      // Set custom mystery encounter data fields (such as sprite scale, custom abilities, types, etc.)
      if (!isNullOrUndefined(config.mysteryEncounterData)) {
        enemyPokemon.mysteryEncounterData = config.mysteryEncounterData!;
      }

      // Set Boss
      if (config.isBoss) {
        let segments = !isNullOrUndefined(config.bossSegments) ? config.bossSegments! : scene.getEncounterBossSegments(scene.currentBattle.waveIndex, level, enemySpecies, true);
        if (!isNullOrUndefined(config.bossSegmentModifier)) {
          segments += config.bossSegmentModifier!;
        }
        enemyPokemon.setBoss(true, segments);
      }

      // Set Passive
      if (config.passive) {
        enemyPokemon.passive = true;
      }

      // Set Nature
      if (config.nature) {
        enemyPokemon.nature = config.nature;
      }

      // Set IVs
      if (config.ivs) {
        enemyPokemon.ivs = config.ivs;
      }

      // Set Status
      const statusEffects = config.status;
      if (statusEffects) {
        // Default to cureturn 3 for sleep
        const status = Array.isArray(statusEffects) ? statusEffects[0] : statusEffects;
        const cureTurn = Array.isArray(statusEffects) ? statusEffects[1] : statusEffects === StatusEffect.SLEEP ? 3 : undefined;
        enemyPokemon.status = new Status(status, 0, cureTurn);
      }

      // Set summon data fields
      if (!enemyPokemon.summonData) {
        enemyPokemon.summonData = new PokemonSummonData();
      }

      // Set ability
      if (!isNullOrUndefined(config.abilityIndex)) {
        enemyPokemon.abilityIndex = config.abilityIndex!;
      }

      // Set gender
      if (!isNullOrUndefined(config.gender)) {
        enemyPokemon.gender = config.gender!;
        enemyPokemon.summonData.gender = config.gender!;
      }

      // Set moves
      if (config?.moveSet && config.moveSet.length > 0) {
        const moves = config.moveSet.map(m => new PokemonMove(m));
        enemyPokemon.moveset = moves;
        enemyPokemon.summonData.moveset = moves;
      }

      // Set tags
      if (config.tags && config.tags.length > 0) {
        const tags = config.tags;
        tags.forEach(tag => enemyPokemon.addTag(tag));
      }

      // mysteryEncounterBattleEffects will only be used IFF MYSTERY_ENCOUNTER_POST_SUMMON tag is applied
      if (config.mysteryEncounterBattleEffects) {
        enemyPokemon.mysteryEncounterBattleEffects = config.mysteryEncounterBattleEffects;
      }

      // Requires re-priming summon data to update everything properly
      enemyPokemon.primeSummonData(enemyPokemon.summonData);

      enemyPokemon.initBattleInfo();
      enemyPokemon.getBattleInfo().initInfo(enemyPokemon);
      enemyPokemon.generateName();
    }

    loadEnemyAssets.push(enemyPokemon.loadAssets());

    console.log(enemyPokemon.name, enemyPokemon.species.speciesId, enemyPokemon.stats);
  });

  scene.pushPhase(new MysteryEncounterBattlePhase(scene, partyConfig.disableSwitch));

  await Promise.all(loadEnemyAssets);
  battle.enemyParty.forEach((enemyPokemon_2, e_1) => {
    if (e_1 < (doubleBattle ? 2 : 1)) {
      enemyPokemon_2.setVisible(false);
      if (battle.double) {
        enemyPokemon_2.setFieldPosition(e_1 ? FieldPosition.RIGHT : FieldPosition.LEFT);
      }
      // Spawns at current visible field instead of on "next encounter" field (off screen to the left)
      enemyPokemon_2.x += 300;
    }
  });
  if (!loaded) {
    regenerateModifierPoolThresholds(scene.getEnemyField(), battle.battleType === BattleType.TRAINER ? ModifierPoolType.TRAINER : ModifierPoolType.WILD);
    const customModifierTypes = partyConfig?.pokemonConfigs
      ?.filter(config => config?.modifierConfigs)
      .map(config => config.modifierConfigs!);
    if (customModifierTypes) {
      scene.generateEnemyModifiers(customModifierTypes);
    }
  }
}

/**
 * Load special move animations/sfx for hard-coded encounter-specific moves that a pokemon uses at the start of an encounter
 * See: [startOfBattleEffects](IMysteryEncounter.startOfBattleEffects) for more details
 *
 * This promise does not need to be awaited on if called in an encounter onInit (will just load lazily)
 * @param scene
 * @param moves
 */
export function loadCustomMovesForEncounter(scene: BattleScene, moves: Moves | Moves[]) {
  moves = Array.isArray(moves) ? moves : [moves];
  return Promise.all(moves.map(move => initMoveAnim(scene, move)))
    .then(() => loadMoveAnimAssets(scene, moves));
}

/**
 * Will update player money, and animate change (sound optional)
 * @param scene - Battle Scene
 * @param changeValue
 * @param playSound
 * @param showMessage
 */
export function updatePlayerMoney(scene: BattleScene, changeValue: number, playSound: boolean = true, showMessage: boolean = true) {
  scene.money = Math.min(Math.max(scene.money + changeValue, 0), Number.MAX_SAFE_INTEGER);
  scene.updateMoneyText();
  scene.animateMoneyChanged(false);
  if (playSound) {
    scene.playSound("buy");
  }
  if (showMessage) {
    if (changeValue < 0) {
      scene.queueMessage(i18next.t("mysteryEncounter:paid_money", { amount: -changeValue }), null, true);
    } else {
      scene.queueMessage(i18next.t("mysteryEncounter:receive_money", { amount: changeValue }), null, true);
    }
  }
}

/**
 * Converts modifier bullshit to an actual item
 * @param scene - Battle Scene
 * @param modifier
 * @param pregenArgs - can specify BerryType for berries, TM for TMs, AttackBoostType for item, etc.
 */
export function generateModifierType(scene: BattleScene, modifier: () => ModifierType, pregenArgs?: any[]): ModifierType {
  const modifierId = Object.keys(modifierTypes).find(k => modifierTypes[k] === modifier)!;
  let result: ModifierType = modifierTypes[modifierId]?.();

  // Populates item id and tier (order matters)
  result = result
    .withIdFromFunc(modifierTypes[modifierId])
    .withTierFromPool();

  const generatedResult = result instanceof ModifierTypeGenerator ? result.generateType(scene.getParty(), pregenArgs) : result;
  return generatedResult ?? result;
}

/**
 * Converts modifier bullshit to an actual item
 * @param scene - Battle Scene
 * @param modifier
 * @param pregenArgs - can specify BerryType for berries, TM for TMs, AttackBoostType for item, etc.
 */
export function generateModifierTypeOption(scene: BattleScene, modifier: () => ModifierType, pregenArgs?: any[]): ModifierTypeOption {
  const result = generateModifierType(scene, modifier, pregenArgs);
  return new ModifierTypeOption(result, 0);
}

/**
 * This function is intended for use inside onPreOptionPhase() of an encounter option
 * @param scene
 * @param onPokemonSelected - Any logic that needs to be performed when Pokemon is chosen
 * If a second option needs to be selected, onPokemonSelected should return a OptionSelectItem[] object
 * @param onPokemonNotSelected - Any logic that needs to be performed if no Pokemon is chosen
 * @param selectablePokemonFilter
 */
export function selectPokemonForOption(scene: BattleScene, onPokemonSelected: (pokemon: PlayerPokemon) => void | OptionSelectItem[], onPokemonNotSelected?: () => void, selectablePokemonFilter?: PokemonSelectFilter): Promise<boolean> {
  return new Promise(resolve => {
    const modeToSetOnExit = scene.ui.getMode();

    // Open party screen to choose pokemon to train
    scene.ui.setMode(Mode.PARTY, PartyUiMode.SELECT, -1, (slotIndex: integer, option: PartyOption) => {
      if (slotIndex < scene.getParty().length) {
        scene.ui.setMode(modeToSetOnExit).then(() => {
          const pokemon = scene.getParty()[slotIndex];
          const secondaryOptions = onPokemonSelected(pokemon);
          if (!secondaryOptions) {
            scene.currentBattle.mysteryEncounter.setDialogueToken("selectedPokemon", pokemon.getNameToRender());
            resolve(true);
            return;
          }

          // There is a second option to choose after selecting the Pokemon
          scene.ui.setMode(Mode.MESSAGE).then(() => {
            const displayOptions = () => {
              // Always appends a cancel option to bottom of options
              const fullOptions = secondaryOptions.map(option => {
                // Update handler to resolve promise
                const onSelect = option.handler;
                option.handler = () => {
                  onSelect();
                  scene.currentBattle.mysteryEncounter.setDialogueToken("selectedPokemon", pokemon.getNameToRender());
                  resolve(true);
                  return true;
                };
                return option;
              }).concat({
                label: i18next.t("menu:cancel"),
                handler: () => {
                  scene.ui.clearText();
                  scene.ui.setMode(Mode.MYSTERY_ENCOUNTER);
                  resolve(false);
                  return true;
                },
                onHover: () => {
                  scene.ui.showText(i18next.t("mysteryEncounter:cancel_option"));
                }
              });

              const config: OptionSelectConfig = {
                options: fullOptions,
                maxOptions: 7,
                yOffset: 0,
                supportHover: true
              };
              scene.ui.setModeWithoutClear(Mode.OPTION_SELECT, config, null, true);
            };

            const textPromptKey = scene.currentBattle.mysteryEncounter?.selectedOption?.dialogue?.secondOptionPrompt;
            if (!textPromptKey) {
              displayOptions();
            } else {
              showEncounterText(scene, textPromptKey).then(() => displayOptions());
            }
          });
        });
      } else {
        scene.ui.setMode(modeToSetOnExit).then(() => {
          if (onPokemonNotSelected) {
            onPokemonNotSelected();
          }
          resolve(false);
        });
      }
    }, selectablePokemonFilter);
  });
}

/**
 * Will initialize reward phases to follow the mystery encounter
 * Can have shop displayed or skipped
 * @param scene - Battle Scene
 * @param customShopRewards - adds a shop phase with the specified rewards / reward tiers
 * @param eggRewards
 * @param preRewardsCallback - can execute an arbitrary callback before the new phases if necessary (useful for updating items/party/injecting new phases before MysteryEncounterRewardsPhase)
 */
export function setEncounterRewards(scene: BattleScene, customShopRewards?: CustomModifierSettings, eggRewards?: IEggOptions[], preRewardsCallback?: Function) {
  scene.currentBattle.mysteryEncounter.doEncounterRewards = (scene: BattleScene) => {
    if (preRewardsCallback) {
      preRewardsCallback();
    }

    if (customShopRewards) {
      scene.unshiftPhase(new SelectModifierPhase(scene, 0, undefined, customShopRewards));
    } else {
      scene.tryRemovePhase(p => p instanceof SelectModifierPhase);
    }

    if (eggRewards) {
      eggRewards.forEach(eggOptions => {
        const egg = new Egg(eggOptions);
        egg.addEggToGameData(scene);
      });
    }

    return true;
  };
}

/**
 * Will initialize exp phases into the phase queue (these are in addition to any combat or other exp earned)
 * Exp Share and Exp Balance will still function as normal
 * @param scene - Battle Scene
 * @param participantId - id/s of party pokemon that get full exp value. Other party members will receive Exp Share amounts
 * @param baseExpValue - gives exp equivalent to a pokemon of the wave index's level.
 * Guidelines:
 * 36 - Sunkern (lowest in game)
 * 62-64 - regional starter base evos
 * 100 - Scyther
 * 170 - Spiritomb
 * 250 - Gengar
 * 290 - trio legendaries
 * 340 - box legendaries
 * 608 - Blissey (highest in game)
 * https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_by_effort_value_yield_(Generation_IX)
 * @param useWaveIndex - set to false when directly passing the the full exp value instead of baseExpValue
 */
export function setEncounterExp(scene: BattleScene, participantId: integer | integer[], baseExpValue: number, useWaveIndex: boolean = true) {
  const participantIds = Array.isArray(participantId) ? participantId : [participantId];

  scene.currentBattle.mysteryEncounter.doEncounterExp = (scene: BattleScene) => {
    const party = scene.getParty();
    const expShareModifier = scene.findModifier(m => m instanceof ExpShareModifier) as ExpShareModifier;
    const expBalanceModifier = scene.findModifier(m => m instanceof ExpBalanceModifier) as ExpBalanceModifier;
    const multipleParticipantExpBonusModifier = scene.findModifier(m => m instanceof MultipleParticipantExpBonusModifier) as MultipleParticipantExpBonusModifier;
    const nonFaintedPartyMembers = party.filter(p => p.hp);
    const expPartyMembers = nonFaintedPartyMembers.filter(p => p.level < scene.getMaxExpLevel());
    const partyMemberExp: number[] = [];
    // EXP value calculation is based off Pokemon.getExpValue
    let expValue = Math.floor(baseExpValue * (useWaveIndex ? scene.currentBattle.waveIndex : 1) / 5 + 1);

    if (participantIds?.length > 0) {
      if (scene.currentBattle.mysteryEncounter.encounterMode === MysteryEncounterMode.TRAINER_BATTLE) {
        expValue = Math.floor(expValue * 1.5);
      }
      for (const partyMember of nonFaintedPartyMembers) {
        const pId = partyMember.id;
        const participated = participantIds.includes(pId);
        if (participated) {
          partyMember.addFriendship(2);
        }
        if (!expPartyMembers.includes(partyMember)) {
          continue;
        }
        if (!participated && !expShareModifier) {
          partyMemberExp.push(0);
          continue;
        }
        let expMultiplier = 0;
        if (participated) {
          expMultiplier += (1 / participantIds.length);
          if (participantIds.length > 1 && multipleParticipantExpBonusModifier) {
            expMultiplier += multipleParticipantExpBonusModifier.getStackCount() * 0.2;
          }
        } else if (expShareModifier) {
          expMultiplier += (expShareModifier.getStackCount() * 0.2) / participantIds.length;
        }
        if (partyMember.pokerus) {
          expMultiplier *= 1.5;
        }
        if (Overrides.XP_MULTIPLIER_OVERRIDE !== null) {
          expMultiplier = Overrides.XP_MULTIPLIER_OVERRIDE;
        }
        const pokemonExp = new Utils.NumberHolder(expValue * expMultiplier);
        scene.applyModifiers(PokemonExpBoosterModifier, true, partyMember, pokemonExp);
        partyMemberExp.push(Math.floor(pokemonExp.value));
      }

      if (expBalanceModifier) {
        let totalLevel = 0;
        let totalExp = 0;
        expPartyMembers.forEach((expPartyMember, epm) => {
          totalExp += partyMemberExp[epm];
          totalLevel += expPartyMember.level;
        });

        const medianLevel = Math.floor(totalLevel / expPartyMembers.length);

        const recipientExpPartyMemberIndexes: number[] = [];
        expPartyMembers.forEach((expPartyMember, epm) => {
          if (expPartyMember.level <= medianLevel) {
            recipientExpPartyMemberIndexes.push(epm);
          }
        });

        const splitExp = Math.floor(totalExp / recipientExpPartyMemberIndexes.length);

        expPartyMembers.forEach((_partyMember, pm) => {
          partyMemberExp[pm] = Phaser.Math.Linear(partyMemberExp[pm], recipientExpPartyMemberIndexes.indexOf(pm) > -1 ? splitExp : 0, 0.2 * expBalanceModifier.getStackCount());
        });
      }

      for (let pm = 0; pm < expPartyMembers.length; pm++) {
        const exp = partyMemberExp[pm];

        if (exp) {
          const partyMemberIndex = party.indexOf(expPartyMembers[pm]);
          scene.unshiftPhase(expPartyMembers[pm].isOnField() ? new ExpPhase(scene, partyMemberIndex, exp) : new ShowPartyExpBarPhase(scene, partyMemberIndex, exp));
        }
      }
    }

    return true;
  };
}

export class OptionSelectSettings {
  hideDescription?: boolean;
  slideInDescription?: boolean;
  overrideTitle?: string;
  overrideDescription?: string;
  overrideQuery?: string;
  overrideOptions?: MysteryEncounterOption[];
  startingCursorIndex?: number;
}

/**
 * Can be used to queue a new series of Options to select for an Encounter
 * MUST be used only in onOptionPhase, will not work in onPreOptionPhase or onPostOptionPhase
 * @param scene
 * @param optionSelectSettings
 */
export function initSubsequentOptionSelect(scene: BattleScene, optionSelectSettings: OptionSelectSettings) {
  scene.pushPhase(new MysteryEncounterPhase(scene, optionSelectSettings));
}

/**
 * Can be used to exit an encounter without any battles or followup
 * Will skip any shops and rewards, and queue the next encounter phase as normal
 * @param scene
 * @param addHealPhase - when true, will add a shop phase to end of encounter with 0 rewards but healing items are available
 * @param encounterMode - Can set custom encounter mode if necessary (may be required for forcing Pokemon to return before next phase)
 */
export function leaveEncounterWithoutBattle(scene: BattleScene, addHealPhase: boolean = false, encounterMode: MysteryEncounterMode = MysteryEncounterMode.NO_BATTLE) {
  scene.currentBattle.mysteryEncounter.encounterMode = encounterMode;
  scene.clearPhaseQueue();
  scene.clearPhaseQueueSplice();
  handleMysteryEncounterVictory(scene, addHealPhase);
}

/**
 *
 * @param scene
 * @param addHealPhase - Adds an empty shop phase to allow player to purchase healing items
 * @param doNotContinue - default `false`. If set to true, will not end the battle and continue to next wave
 */
export function handleMysteryEncounterVictory(scene: BattleScene, addHealPhase: boolean = false, doNotContinue: boolean = false) {
  const allowedPkm = scene.getParty().filter((pkm) => pkm.isAllowedInBattle());

  if (allowedPkm.length === 0) {
    scene.clearPhaseQueue();
    scene.unshiftPhase(new GameOverPhase(scene));
    return;
  }

  // If in repeated encounter variant, do nothing
  // Variant must eventually be swapped in order to handle "true" end of the encounter
  const encounter = scene.currentBattle.mysteryEncounter;
  if (encounter.continuousEncounter || doNotContinue) {
    return;
  } else if (encounter.encounterMode === MysteryEncounterMode.NO_BATTLE) {
    scene.pushPhase(new EggLapsePhase(scene));
    scene.pushPhase(new MysteryEncounterRewardsPhase(scene, addHealPhase));
  } else if (!scene.getEnemyParty().find(p => encounter.encounterMode !== MysteryEncounterMode.TRAINER_BATTLE ? p.isOnField() : !p?.isFainted(true))) {
    scene.pushPhase(new BattleEndPhase(scene));
    if (encounter.encounterMode === MysteryEncounterMode.TRAINER_BATTLE) {
      scene.pushPhase(new TrainerVictoryPhase(scene));
    }
    if (scene.gameMode.isEndless || !scene.gameMode.isWaveFinal(scene.currentBattle.waveIndex)) {
      if (!encounter.doContinueEncounter) {
        // Only lapse eggs once for multi-battle encounters
        scene.pushPhase(new EggLapsePhase(scene));
      }
      scene.pushPhase(new MysteryEncounterRewardsPhase(scene, addHealPhase));
    }
  }
}

/**
 *
 * @param scene
 * @param hide - If true, performs ease out and hide visuals. If false, eases in visuals. Defaults to true
 * @param destroy - If true, will destroy visuals ONLY ON HIDE TRANSITION. Does nothing on show. Defaults to true
 * @param duration
 */
export function transitionMysteryEncounterIntroVisuals(scene: BattleScene, hide: boolean = true, destroy: boolean = true, duration: number = 750): Promise<boolean> {
  return new Promise(resolve => {
    const introVisuals = scene.currentBattle.mysteryEncounter.introVisuals;
    const enemyPokemon = scene.getEnemyField();
    if (enemyPokemon) {
      scene.currentBattle.enemyParty = [];
    }
    if (introVisuals) {
      if (!hide) {
        // Make sure visuals are in proper state for showing
        introVisuals.setVisible(true);
        introVisuals.x = 244;
        introVisuals.y = 60;
        introVisuals.alpha = 0;
      }

      // Transition
      scene.tweens.add({
        targets: [introVisuals, enemyPokemon],
        x: `${hide? "+" : "-"}=16`,
        y: `${hide ? "-" : "+"}=16`,
        alpha: hide ? 0 : 1,
        ease: "Sine.easeInOut",
        duration,
        onComplete: () => {
          if (hide && destroy) {
            scene.field.remove(introVisuals, true);

            enemyPokemon.forEach(pokemon => {
              scene.field.remove(pokemon, true);
            });

            scene.currentBattle.mysteryEncounter.introVisuals = undefined;
          }
          resolve(true);
        }
      });
    } else {
      resolve(true);
    }
  });
}

/**
 * Will queue moves for any pokemon to use before the first CommandPhase of a battle
 * Mostly useful for allowing MysteryEncounter enemies to "cheat" and use moves before the first turn
 * @param scene
 */
export function handleMysteryEncounterBattleStartEffects(scene: BattleScene) {
  const encounter = scene.currentBattle?.mysteryEncounter;
  if (scene.currentBattle.battleType === BattleType.MYSTERY_ENCOUNTER && encounter.encounterMode !== MysteryEncounterMode.NO_BATTLE && !encounter.startOfBattleEffectsComplete) {
    const effects = encounter.startOfBattleEffects;
    effects.forEach(effect => {
      let source;
      if (effect.sourcePokemon) {
        source = effect.sourcePokemon;
      } else if (!isNullOrUndefined(effect.sourceBattlerIndex)) {
        if (effect.sourceBattlerIndex === BattlerIndex.ATTACKER) {
          source = scene.getEnemyField()[0];
        } else if (effect.sourceBattlerIndex === BattlerIndex.ENEMY) {
          source = scene.getEnemyField()[0];
        } else if (effect.sourceBattlerIndex === BattlerIndex.ENEMY_2) {
          source = scene.getEnemyField()[1];
        } else if (effect.sourceBattlerIndex === BattlerIndex.PLAYER) {
          source = scene.getPlayerField()[0];
        } else if (effect.sourceBattlerIndex === BattlerIndex.PLAYER_2) {
          source = scene.getPlayerField()[1];
        }
      } else {
        source = scene.getEnemyField()[0];
      }
      scene.pushPhase(new MovePhase(scene, source, effect.targets, effect.move, effect.followUp, effect.ignorePp));
    });

    // Pseudo turn end phase to reset flinch states, Endure, etc.
    scene.pushPhase(new MysteryEncounterBattleStartCleanupPhase(scene));

    encounter.startOfBattleEffectsComplete = true;
  }
}

/**
 * TODO: remove once encounter spawn rate is finalized
 * Just a helper function to calculate aggregate stats for MEs in a Classic run
 * @param scene
 * @param baseSpawnWeight
 */
export function calculateMEAggregateStats(scene: BattleScene, baseSpawnWeight: number) {
  const numRuns = 1000;
  let run = 0;
  const targetEncountersPerRun = 15; // AVERAGE_ENCOUNTERS_PER_RUN_TARGET
  const biomes = Object.keys(Biome).filter(key => isNaN(Number(key)));
  const alwaysPickTheseBiomes = [Biome.ISLAND, Biome.ABYSS, Biome.WASTELAND, Biome.FAIRY_CAVE, Biome.TEMPLE, Biome.LABORATORY, Biome.SPACE, Biome.WASTELAND];

  const calculateNumEncounters = (): any[] => {
    let encounterRate = baseSpawnWeight; // BASE_MYSTERY_ENCOUNTER_SPAWN_WEIGHT
    const numEncounters = [0, 0, 0, 0];
    const encountersByBiome = new Map<string, number>(biomes.map(b => [b, 0]));
    const validMEfloorsByBiome = new Map<string, number>(biomes.map(b => [b, 0]));
    let currentBiome = Biome.TOWN;
    let currentArena = scene.newArena(currentBiome);
    scene.setSeed(Utils.randomString(24));
    scene.resetSeed();
    for (let i = 10; i < 180; i++) {
      // Boss
      if (i % 10 === 0) {
        continue;
      }

      // New biome
      if (i % 10 === 1) {
        if (Array.isArray(biomeLinks[currentBiome])) {
          let biomes: Biome[];
          scene.executeWithSeedOffset(() => {
            biomes = (biomeLinks[currentBiome] as (Biome | [Biome, integer])[])
              .filter(b => {
                return !Array.isArray(b) || !Utils.randSeedInt(b[1]);
              })
              .map(b => !Array.isArray(b) ? b : b[0]);
          }, i * 100);
          if (biomes! && biomes.length > 0) {
            const specialBiomes = biomes.filter(b => alwaysPickTheseBiomes.includes(b));
            if (specialBiomes.length > 0) {
              currentBiome = specialBiomes[Utils.randSeedInt(specialBiomes.length)];
            } else {
              currentBiome = biomes[Utils.randSeedInt(biomes.length)];
            }
          }
        } else if (biomeLinks.hasOwnProperty(currentBiome)) {
          currentBiome = (biomeLinks[currentBiome] as Biome);
        } else {
          if (!(i % 50)) {
            currentBiome = Biome.END;
          } else {
            currentBiome = scene.generateRandomBiome(i);
          }
        }

        currentArena = scene.newArena(currentBiome);
      }

      // Fixed battle
      if (scene.gameMode.isFixedBattle(i)) {
        continue;
      }

      // Trainer
      if (scene.gameMode.isWaveTrainer(i, currentArena)) {
        continue;
      }

      // Otherwise, roll encounter

      const roll = Utils.randSeedInt(256);
      validMEfloorsByBiome.set(Biome[currentBiome], (validMEfloorsByBiome.get(Biome[currentBiome]) ?? 0) + 1);

      // If total number of encounters is lower than expected for the run, slightly favor a new encounter
      // Do the reverse as well
      const expectedEncountersByFloor = targetEncountersPerRun / (180 - 10) * i;
      const currentRunDiffFromAvg = expectedEncountersByFloor - numEncounters.reduce((a, b) => a + b);
      const favoredEncounterRate = encounterRate + currentRunDiffFromAvg * 5;

      if (roll < favoredEncounterRate) {
        encounterRate = baseSpawnWeight;

        // Calculate encounter rarity
        // Common / Uncommon / Rare / Super Rare (base is out of 128)
        const tierWeights = [64, 40, 21, 3];

        // Adjust tier weights by currently encountered events (pity system that lowers odds of multiple common/uncommons)
        tierWeights[0] = tierWeights[0] - 6 * numEncounters[0];
        tierWeights[1] = tierWeights[1] - 4 * numEncounters[1];

        const totalWeight = tierWeights.reduce((a, b) => a + b);
        const tierValue = Utils.randSeedInt(totalWeight);
        const commonThreshold = totalWeight - tierWeights[0]; // 64 - 32 = 32
        const uncommonThreshold = totalWeight - tierWeights[0] - tierWeights[1]; // 64 - 32 - 16 = 16
        const rareThreshold = totalWeight - tierWeights[0] - tierWeights[1] - tierWeights[2]; // 64 - 32 - 16 - 10 = 6

        tierValue > commonThreshold ? ++numEncounters[0] : tierValue > uncommonThreshold ? ++numEncounters[1] : tierValue > rareThreshold ? ++numEncounters[2] : ++numEncounters[3];
        encountersByBiome.set(Biome[currentBiome], (encountersByBiome.get(Biome[currentBiome]) ?? 0) + 1);
      } else {
        encounterRate += WEIGHT_INCREMENT_ON_SPAWN_MISS;
      }
    }

    return [numEncounters, encountersByBiome, validMEfloorsByBiome];
  };

  const encounterRuns: number[][] = [];
  const encountersByBiomeRuns: Map<string, number>[] = [];
  const validFloorsByBiome: Map<string, number>[] = [];
  while (run < numRuns) {
    scene.executeWithSeedOffset(() => {
      const [numEncounters, encountersByBiome, validMEfloorsByBiome] = calculateNumEncounters();
      encounterRuns.push(numEncounters);
      encountersByBiomeRuns.push(encountersByBiome);
      validFloorsByBiome.push(validMEfloorsByBiome);
    }, 1000 * run);
    run++;
  }

  const n = encounterRuns.length;
  const totalEncountersInRun = encounterRuns.map(run => run.reduce((a, b) => a + b));
  const totalMean = totalEncountersInRun.reduce((a, b) => a + b) / n;
  const totalStd = Math.sqrt(totalEncountersInRun.map(x => Math.pow(x - totalMean, 2)).reduce((a, b) => a + b) / n);
  const commonMean = encounterRuns.reduce((a, b) => a + b[0], 0) / n;
  const uncommonMean = encounterRuns.reduce((a, b) => a + b[1], 0) / n;
  const rareMean = encounterRuns.reduce((a, b) => a + b[2], 0) / n;
  const superRareMean = encounterRuns.reduce((a, b) => a + b[3], 0) / n;

  const encountersPerRunPerBiome = encountersByBiomeRuns.reduce((a, b) => {
    for (const biome of a.keys()) {
      a.set(biome, a.get(biome)! + b.get(biome)!);
    }
    return a;
  });
  const meanEncountersPerRunPerBiome: Map<string, number> = new Map<string, number>();
  encountersPerRunPerBiome.forEach((value, key) => {
    meanEncountersPerRunPerBiome.set(key, value / n);
  });

  const validMEFloorsPerRunPerBiome = validFloorsByBiome.reduce((a, b) => {
    for (const biome of a.keys()) {
      a.set(biome, a.get(biome)! + b.get(biome)!);
    }
    return a;
  });
  const meanMEFloorsPerRunPerBiome: Map<string, number> = new Map<string, number>();
  validMEFloorsPerRunPerBiome.forEach((value, key) => {
    meanMEFloorsPerRunPerBiome.set(key, value / n);
  });

  let stats = `Starting weight: ${baseSpawnWeight}\nAverage MEs per run: ${totalMean}\nStandard Deviation: ${totalStd}\nAvg Commons: ${commonMean}\nAvg Greats: ${uncommonMean}\nAvg Ultras: ${rareMean}\nAvg Rogues: ${superRareMean}\n`;

  const meanEncountersPerRunPerBiomeSorted = [...meanEncountersPerRunPerBiome.entries()].sort((e1, e2) => e2[1] - e1[1]);
  meanEncountersPerRunPerBiomeSorted.forEach(value => stats = stats + `${value[0]}: avg valid floors ${meanMEFloorsPerRunPerBiome.get(value[0])}, avg MEs ${value[1]},\n`);

  console.log(stats);
}


/**
 * TODO: remove once encounter spawn rate is finalized
 * Just a helper function to calculate aggregate stats for MEs in a Classic run
 * @param scene
 * @param luckValue - 0 to 14
 */
export function calculateRareSpawnAggregateStats(scene: BattleScene, luckValue: number) {
  const numRuns = 1000;
  let run = 0;

  const calculateNumRareEncounters = (): any[] => {
    const bossEncountersByRarity = [0, 0, 0, 0];
    scene.setSeed(Utils.randomString(24));
    scene.resetSeed();
    // There are 12 wild boss floors
    for (let i = 0; i < 12; i++) {
      // Roll boss tier
      // luck influences encounter rarity
      let luckModifier = 0;
      if (!isNaN(luckValue)) {
        luckModifier = luckValue * 0.5;
      }
      const tierValue = Utils.randSeedInt(64 - luckModifier);
      const tier = tierValue >= 20 ? BiomePoolTier.BOSS : tierValue >= 6 ? BiomePoolTier.BOSS_RARE : tierValue >= 1 ? BiomePoolTier.BOSS_SUPER_RARE : BiomePoolTier.BOSS_ULTRA_RARE;

      switch (tier) {
      default:
      case BiomePoolTier.BOSS:
        ++bossEncountersByRarity[0];
        break;
      case BiomePoolTier.BOSS_RARE:
        ++bossEncountersByRarity[1];
        break;
      case BiomePoolTier.BOSS_SUPER_RARE:
        ++bossEncountersByRarity[2];
        break;
      case BiomePoolTier.BOSS_ULTRA_RARE:
        ++bossEncountersByRarity[3];
        break;
      }
    }

    return bossEncountersByRarity;
  };

  const encounterRuns: number[][] = [];
  while (run < numRuns) {
    scene.executeWithSeedOffset(() => {
      const bossEncountersByRarity = calculateNumRareEncounters();
      encounterRuns.push(bossEncountersByRarity);
    }, 1000 * run);
    run++;
  }

  const n = encounterRuns.length;
  // const totalEncountersInRun = encounterRuns.map(run => run.reduce((a, b) => a + b));
  // const totalMean = totalEncountersInRun.reduce((a, b) => a + b) / n;
  // const totalStd = Math.sqrt(totalEncountersInRun.map(x => Math.pow(x - totalMean, 2)).reduce((a, b) => a + b) / n);
  const commonMean = encounterRuns.reduce((a, b) => a + b[0], 0) / n;
  const rareMean = encounterRuns.reduce((a, b) => a + b[1], 0) / n;
  const superRareMean = encounterRuns.reduce((a, b) => a + b[2], 0) / n;
  const ultraRareMean = encounterRuns.reduce((a, b) => a + b[3], 0) / n;

  const stats = `Avg Commons: ${commonMean}\nAvg Rare: ${rareMean}\nAvg Super Rare: ${superRareMean}\nAvg Ultra Rare: ${ultraRareMean}\n`;

  console.log(stats);
}
