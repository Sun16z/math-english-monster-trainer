import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MONSTERS,
  HOUSE_ITEMS,
  PET_ACCESSORIES,
  PET_FOODS,
  PET_SKINS,
  SHOP_ITEMS,
  STAGES,
  addFoodToBag,
  addHouseProgress,
  addSkinToPet,
  applySkinToMonster,
  calculateDamage,
  chooseFoodReward,
  computeStageStars,
  createInitialRun,
  feedPetWithFood,
  generateEnglishQuestion,
  generateMandarinQuestion,
  generateMathQuestion,
  generateNaturalQuestion,
  generateQuestion,
  getEvolutionName,
  getEvolutionStage,
  getMonsterHp,
  getPetStage,
  getMonsterForWave,
  getStageMonster,
  growPetDex,
  hatchEgg,
  isBossWave,
  isEggReady,
  isStageUnlocked,
  makeRng,
  maybeDropEgg,
  normalizeFoodBag,
  normalizeHouse,
  normalizeMapProgress,
  normalizePetDex,
  normalizeShop,
  rollPetAccessory,
  warmEgg,
} from '../src/gameLogic.js';

test('stages give six unlockable habitats with boss waves', () => {
  assert.equal(STAGES.length, MONSTERS.length);
  assert.equal(getStageMonster(0, 1).id, MONSTERS[0].id);
  assert.equal(getStageMonster(2, 5).id, MONSTERS[2].id);
  assert.ok(isBossWave(5));
  assert.ok(!isBossWave(4));

  const normalHp = getMonsterHp(MONSTERS[0], 1, 'sprout');
  const bossHp = getMonsterHp(MONSTERS[0], 1, 'sprout', { boss: true });
  assert.ok(bossHp > normalHp);

  assert.equal(computeStageStars({ stageWrong: 0 }), 3);
  assert.equal(computeStageStars({ stageWrong: 2 }), 2);
  assert.equal(computeStageStars({ stageWrong: 5 }), 1);

  assert.ok(isStageUnlocked(0, {}));
  assert.ok(!isStageUnlocked(1, {}));
  assert.ok(isStageUnlocked(1, normalizeMapProgress({ [STAGES[0].id]: 2 })));
});

test('eggs drop, warm up, and hatch into skin variants', () => {
  const rng = makeRng(99);
  const egg = maybeDropEgg({ currentEgg: null, scoreGain: 220, streak: 4, caught: true }, rng);
  assert.ok(egg, '收服時一定掉蛋');
  assert.ok(egg.needed >= 3);
  assert.equal(maybeDropEgg({ currentEgg: egg, caught: true }, rng), null, '已有蛋時不再掉蛋');

  let warmed = egg;
  for (let round = 0; round < egg.needed; round += 1) {
    assert.ok(!isEggReady(warmed));
    warmed = warmEgg(warmed);
  }
  assert.ok(isEggReady(warmed));

  for (let seed = 1; seed <= 40; seed += 1) {
    const hatched = hatchEgg(warmed, makeRng(seed * 17));
    assert.ok(MONSTERS.some((monster) => monster.id === hatched.monsterId));
    assert.ok(PET_SKINS.some((skin) => skin.id === hatched.skin.id));
  }
});

test('skins persist through growth and apply to monster colors', () => {
  let dex = addSkinToPet({}, 'mossbit', 'golden');
  assert.deepEqual(dex.mossbit.skins, ['golden']);
  assert.equal(dex.mossbit.activeSkin, 'golden');

  dex = growPetDex(dex, 'mossbit', 6, makeRng(4));
  assert.deepEqual(dex.mossbit.skins, ['golden'], '升級不可弄丟皮膚');
  assert.equal(dex.mossbit.activeSkin, 'golden');

  const restored = normalizePetDex(dex, ['mossbit']);
  assert.deepEqual(restored.mossbit.skins, ['golden']);

  const skinned = applySkinToMonster(MONSTERS[0], 'golden');
  assert.notEqual(skinned.colorA, MONSTERS[0].colorA);
  assert.equal(skinned.skinLabel, '黃金');
});

test('pets evolve through three named stages', () => {
  assert.equal(getEvolutionStage(1), 0);
  assert.equal(getEvolutionStage(4), 1);
  assert.equal(getEvolutionStage(7), 2);

  const moon = MONSTERS.find((monster) => monster.id === 'mossbit');
  assert.equal(getEvolutionName(moon, 1), '黑月咪兔');
  assert.equal(getEvolutionName(moon, 5), '黑月魔法兔');
  assert.equal(getEvolutionName(moon, 8), '黑月女王兔');

  MONSTERS.forEach((monster) => {
    assert.equal(monster.stages.length, 3, `${monster.name} 需要三段進化名`);
  });

  const stage = getPetStage({ xp: 30 });
  assert.equal(stage.evoStage, 2);
});

test('signature cute pets use stable original shape variants', () => {
  const moonPet = MONSTERS.find((monster) => monster.id === 'mossbit');
  const cloudPet = MONSTERS.find((monster) => monster.id === 'flarelume');

  assert.equal(moonPet.name, '黑月咪兔');
  assert.equal(moonPet.petShape, 'moonBunny');
  assert.equal(cloudPet.name, '雲朵耳寶');
  assert.equal(cloudPet.petShape, 'cloudPup');
  assert.ok(PET_ACCESSORIES.some((accessory) => accessory.id === 'mischiefBow'));
  assert.ok(PET_ACCESSORIES.some((accessory) => accessory.id === 'cloudBell'));
});

test('shop wardrobe items normalize and point to valid accessories', () => {
  assert.ok(SHOP_ITEMS.length >= 5);
  SHOP_ITEMS.forEach((item) => {
    assert.ok(PET_ACCESSORIES.some((accessory) => accessory.id === item.accessoryId), `${item.id} needs a drawable accessory`);
    assert.ok(item.cost > 0, `${item.id} needs a learning point cost`);
  });

  const shopOnlyAccessories = PET_ACCESSORIES.filter((accessory) => accessory.shopOnly).map((accessory) => accessory.id);
  assert.ok(shopOnlyAccessories.includes('flowerHeadband'));
  assert.ok(shopOnlyAccessories.includes('starCape'));

  const normalized = normalizeShop({
    owned: ['flowerHeadband', 'not-real', 'flowerHeadband', 'starCape'],
    equippedByPet: {
      mossbit: 'flowerHeadband',
      flarelume: 'missing',
      notMonster: 'starCape',
    },
  });

  assert.deepEqual(normalized.owned, ['flowerHeadband', 'starCape']);
  assert.deepEqual(normalized.equippedByPet, { mossbit: 'flowerHeadband' });
  assert.deepEqual(normalizeShop({ owned: 'bad', equippedByPet: null }), { owned: [], equippedByPet: {} });

  for (let seed = 1; seed <= 30; seed += 1) {
    assert.notEqual(rollPetAccessory(`pet-${seed}`, makeRng(seed)).shopOnly, true);
  }
});

test('math questions always include the correct answer once', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const question = generateMathQuestion(
      { grade: seed % 2 ? 'grade2' : 'grade5', level: 4, wave: seed, streak: seed % 3, difficulty: 'scout' },
      makeRng(seed),
    );
    const matches = question.choices.filter((choice) => choice === question.answer);
    assert.equal(matches.length, 1);
    assert.equal(question.choices.length, 4);
  }
});

test('grade 5 math includes percent and large-unit conversion banks', () => {
  const domains = new Set();
  for (let seed = 1; seed <= 800; seed += 1) {
    const question = generateMathQuestion(
      { grade: 'grade5', level: (seed % 9) + 1, wave: (seed % 7) + 1, streak: seed % 4, difficulty: 'scout' },
      makeRng(seed),
    );
    domains.add(question.domain);
    assert.equal(question.choices.includes(question.answer), true);
  }

  assert.ok(domains.has('百分率') || domains.has('百分率換小數') || domains.has('折扣百分率'));
  assert.ok(domains.has('公噸公斤換算'));
  assert.ok(domains.has('公頃公畝換算'));
  assert.ok(domains.has('公頃平方公尺換算'));
  assert.ok(domains.has('平方公里平方公尺換算'));
  assert.ok(domains.has('平方公尺公畝換算'));
  assert.ok(domains.has('公里公尺換算'));
});

test('mandarin questions cover exam-style language skills', () => {
  for (const grade of ['grade2', 'grade5']) {
    const question = generateMandarinQuestion({ grade, level: 2, wave: 3 }, makeRng(7));
    assert.equal(question.subject, 'mandarin');
    assert.equal(question.choices.includes(question.answer), true);
    assert.ok(question.domain.length > 0);
  }
});

test('english questions always include a local explanation and answer', () => {
  for (let seed = 10; seed < 40; seed += 1) {
    const question = generateEnglishQuestion({ grade: seed % 2 ? 'grade2' : 'grade5', level: seed, wave: 2 }, makeRng(seed));
    assert.equal(question.choices.includes(question.answer), true);
    assert.equal(typeof question.explanation, 'string');
    assert.ok(question.explanation.length > 4);
    assert.equal(typeof question.speechPrompt, 'string');
    assert.ok(question.speechPrompt.length > 2);
    assert.equal(typeof question.practiceText, 'string');
    assert.ok(question.practiceText.length > 0);
  }
});

test('natural questions cover grade 5 plant and combustion topics', () => {
  const domains = new Set();
  for (let seed = 1; seed <= 600; seed += 1) {
    const question = generateNaturalQuestion(
      { grade: 'grade5', level: (seed % 6) + 1, wave: (seed % 5) + 1, streak: seed % 3 },
      makeRng(seed),
    );
    domains.add(question.domain);
    assert.equal(question.subject, 'natural');
    assert.equal(question.choices.includes(question.answer), true);
    assert.ok(question.explanation.length > 6);
  }

  assert.ok(domains.has('植物世界面面觀'));
  assert.ok(domains.has('植物構造與功能'));
  assert.ok(domains.has('植物分類與繁殖'));
  assert.ok(domains.has('空氣和燃燒'));
  assert.ok(domains.has('燃燒三要素'));
  assert.ok(domains.has('氧氣與二氧化碳'));
  assert.ok(domains.has('滅火與安全'));
});

test('bank-based questions shuffle the answer position across seeds', () => {
  for (const [generate, options] of [
    [generateMandarinQuestion, { grade: 'grade2' }],
    [generateMandarinQuestion, { grade: 'grade5' }],
    [generateNaturalQuestion, { grade: 'grade2' }],
    [generateNaturalQuestion, { grade: 'grade5' }],
  ]) {
    const positions = new Set();
    for (let seed = 1; seed <= 60; seed += 1) {
      const question = generate({ ...options, level: seed % 5, wave: seed % 7 }, makeRng(seed));
      positions.add(question.choices.indexOf(question.answer));
    }
    assert.ok(positions.size > 1, '答案不可以永遠出現在同一個位置');
  }
});

test('grade 5 math includes fraction operations with common denominators', () => {
  const domains = new Set();
  for (let seed = 1; seed <= 900; seed += 1) {
    const question = generateMathQuestion(
      { grade: 'grade5', level: (seed % 9) + 1, wave: (seed % 7) + 1, streak: seed % 4, difficulty: 'scout' },
      makeRng(seed),
    );
    domains.add(question.domain);
    assert.equal(question.choices.filter((choice) => choice === question.answer).length, 1);
  }

  assert.ok(domains.has('異分母分數加法'));
  assert.ok(domains.has('異分母分數減法'));
  assert.ok(domains.has('約分'));
  assert.ok(domains.has('通分比大小'));
});

test('grade 2 math includes coins, grouping and number comparison', () => {
  const domains = new Set();
  for (let seed = 1; seed <= 900; seed += 1) {
    const question = generateMathQuestion(
      { grade: 'grade2', level: (seed % 9) + 1, wave: (seed % 7) + 1, streak: seed % 4, difficulty: 'scout' },
      makeRng(seed),
    );
    domains.add(question.domain);
    assert.equal(question.choices.filter((choice) => choice === question.answer).length, 1);
    assert.equal(question.choices.length, 4);
  }

  assert.ok(domains.has('錢幣計算'));
  assert.ok(domains.has('分裝'));
  assert.ok(domains.has('數的大小比較'));
});

test('mixed mode alternates between every subject over progression', () => {
  const subjects = new Set();
  for (let answeredCount = 0; answeredCount <= 12; answeredCount += 1) {
    subjects.add(generateQuestion({ mode: 'mixed', level: 2, wave: 1, streak: 0, answeredCount }, answeredCount + 1).subject);
  }
  assert.deepEqual([...subjects].sort(), ['english', 'mandarin', 'math', 'natural']);
});

test('pet growth creates stable size and random accessories', () => {
  const firstDex = growPetDex({}, 'mossbit', 4, makeRng(2));
  const firstPet = firstDex.mossbit;
  const firstStage = getPetStage(firstPet);

  assert.equal(firstStage.level, 2);
  assert.ok(firstStage.size > 0.9);
  assert.ok(firstPet.accessory.label.length > 0);

  const grownDex = growPetDex(firstDex, 'mossbit', 12, makeRng(3));
  const grownStage = getPetStage(grownDex.mossbit);
  assert.ok(grownStage.level > firstStage.level);
  assert.ok(grownStage.size > firstStage.size);

  const restored = normalizePetDex(grownDex, ['mossbit']);
  assert.equal(restored.mossbit.accessory.id, grownDex.mossbit.accessory.id);
});

test('food rewards scale with score and feeding grows pets', () => {
  const lowReward = chooseFoodReward({ scoreGain: 92, streak: 1, caught: false });
  const highReward = chooseFoodReward({ scoreGain: 230, streak: 6, caught: true });

  assert.equal(lowReward.id, 'berry');
  assert.ok(highReward.tier > lowReward.tier);
  assert.ok(PET_FOODS.some((food) => food.id === highReward.id));

  const bag = addFoodToBag({}, highReward.id, 2);
  assert.equal(normalizeFoodBag(bag)[highReward.id], 2);

  const firstDex = growPetDex({}, 'mossbit', 4, makeRng(8));
  const fed = feedPetWithFood(firstDex, 'mossbit', highReward.id, makeRng(9));
  assert.ok(fed.stage.level >= getPetStage(firstDex.mossbit).level);
  assert.ok(fed.pet.xp > firstDex.mossbit.xp);

  const nextBag = addFoodToBag(bag, highReward.id, -1);
  assert.equal(nextBag[highReward.id], 1);
});

test('house progress adds permanent villa items before renovation upgrades', () => {
  let result = addHouseProgress({});
  assert.equal(result.reward.id, HOUSE_ITEMS[0].id);
  assert.deepEqual(result.house.built, [HOUSE_ITEMS[0].id]);

  for (let index = 1; index < HOUSE_ITEMS.length; index += 1) {
    result = addHouseProgress(result.house);
    assert.equal(result.reward.id, HOUSE_ITEMS[index].id);
  }

  assert.equal(result.house.complete, true);
  assert.equal(result.house.built.length, HOUSE_ITEMS.length);
  const renovated = addHouseProgress(result.house);
  assert.equal(renovated.house.built.length, HOUSE_ITEMS.length);
  assert.equal(renovated.house.renovation, 1);
  assert.equal(renovated.reward.kind, 'upgrade');

  const normalized = normalizeHouse({ built: ['frontDoor', 'not-real', 'frontDoor'], renovation: '2' });
  assert.deepEqual(normalized.built, ['frontDoor']);
  assert.equal(normalized.renovation, 2);
});

test('damage scales with streak and level', () => {
  const low = calculateDamage({ streak: 0, level: 1, subject: 'math' });
  const high = calculateDamage({ streak: 5, level: 6, subject: 'english' });
  assert.ok(high > low);
});

test('initial run is playable and wave monsters wrap from catalogue', () => {
  const run = createInitialRun({ mode: 'math', grade: 'grade5', difficulty: 'sprout' });
  assert.equal(run.phase, 'playing');
  assert.equal(run.grade, 'grade5');
  assert.equal(run.hearts, 5);
  assert.ok(run.question.choices.length === 4);
  assert.deepEqual(run.reviewQueue, []);
  assert.deepEqual(run.foodBag, {});
  assert.equal(getMonsterForWave(1).id, getMonsterForWave(7).id);
});
