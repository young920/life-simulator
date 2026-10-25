export type StatKey = "health" | "intelligence" | "charm" | "wealth" | "happiness";

export type LifeStats = Record<StatKey, number>;

export type LifeChoice = {
  label: string;
  consequence: string;
  effects: Partial<LifeStats>;
  relationshipEffects: Record<string, number>;
};

export type LifeEvent = {
  id: string;
  age: number;
  stage: string;
  title: string;
  narrative: string;
  imagePrompt: string;
  characterIds: string[];
  choices: LifeChoice[];
};

export type LifeCharacter = {
  id: string;
  name: string;
  role: string;
  description: string;
  firstMeetAge: number;
};

export type LifeMemory = {
  id: string;
  age: number;
  title: string;
  narrative: string;
  highlight: string;
};

export type LifePlan = {
  worldSummary: string;
  openingLine: string;
  endingLine: string;
  characters: LifeCharacter[];
  events: LifeEvent[];
  memories?: LifeMemory[];
};

export type LifeLogEntry = {
  age: number;
  title: string;
  text: string;
  highlight?: string;
  kind: "milestone" | "memory" | "year";
};

export const STAT_META: Array<{ id: StatKey; label: string; icon: string }> = [
  { id: "health", label: "健康", icon: "心身" },
  { id: "intelligence", label: "智力", icon: "悟性" },
  { id: "charm", label: "魅力", icon: "魅力" },
  { id: "wealth", label: "家境", icon: "资源" },
  { id: "happiness", label: "心境", icon: "心境" },
];

export const DEFAULT_STATS: LifeStats = {
  health: 50,
  intelligence: 50,
  charm: 50,
  wealth: 50,
  happiness: 50,
};

export const DEFAULT_MODEL_CHAIN = [
  "kimi-k2.8",
  "MiniMax-M3",
  "step-5-preview",
  "deepseek-v4.1-flash",
  "MiniMax-M3.1-Flash",
];

export const MODEL_CHAIN_STORAGE_KEY = "life-sim-model-chain-v1";
export const MODEL_CHAIN_PRIORITY_VERSION_KEY = "life-sim-model-chain-priority-v5";

export function clampStat(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function applyEffects(stats: LifeStats, effects: Partial<LifeStats>): LifeStats {
  return {
    health: clampStat(stats.health + (effects.health || 0)),
    intelligence: clampStat(stats.intelligence + (effects.intelligence || 0)),
    charm: clampStat(stats.charm + (effects.charm || 0)),
    wealth: clampStat(stats.wealth + (effects.wealth || 0)),
    happiness: clampStat(stats.happiness + (effects.happiness || 0)),
  };
}

export function advanceLifeYear(stats: LifeStats, age: number): LifeStats {
  const next = { ...stats };
  if (age >= 45 && age % 2 === 1) next.health = clampStat(next.health - 1);
  if (age >= 35 && age % 4 === 0) next.charm = clampStat(next.charm - 1);
  if (age >= 40 && age % 5 === 0) next.happiness = clampStat(next.happiness - 1);
  if (age >= 20 && age % 6 === 0) next.wealth = clampStat(next.wealth + (next.intelligence >= 55 ? 2 : 1));
  return next;
}

export function stageForAge(age: number) {
  if (age < 3) return "婴幼儿期";
  if (age < 7) return "童年";
  if (age < 13) return "少年期";
  if (age < 18) return "青春期";
  if (age < 30) return "青年期";
  if (age < 45) return "壮年期";
  if (age < 60) return "中年期";
  if (age < 80) return "老年期";
  return "晚年";
}

export function summarizeYear(age: number, worldLabel: string, aspiration: string, stats?: LifeStats) {
  const stage = stageForAge(age);
  if (age === 1) return "你开始认识世界，熟悉的人和声音逐渐有了名字。";
  if (age === 6) return `新的环境向你打开。在${worldLabel}里，你第一次发现，自己可以选择如何与世界相处。`;
  if (age === 12) return `在${worldLabel}里，你逐渐找到自己的长处，也开始在意别人如何看待你。`;
  if (age === 18) return `你站在人生的岔路口，${aspiration}开始从愿望变成真正的选择。`;
  const insight = stats ? STAT_META.slice().sort((left, right) => stats[right.id] - stats[left.id])[0]?.label : "";
  const insightLine = insight && age % 3 === 0 ? `这一年，你渐渐学会把${insight}变成自己的底气。` : "";
  if (age < 18) {
    const moments = [
      `在${worldLabel}的日常里，你悄悄记住了一件小事。它让你第一次觉得，自己也能改变周围的一点点。`,
      `这一年，你开始有了自己的秘密和坚持。身边的大人还不知道，那些小选择正在慢慢塑造你。`,
      `一段新的经历让你重新认识熟悉的地方。你发现，勇气有时只是愿意再试一次。`,
      `你把好奇心带进${stage}的生活里。一次意外的相遇，让平凡的一天多了新的回声。`,
    ];
    return moments[age % moments.length] + insightLine;
  }
  if (age < 40) {
    const moments = [
      `你在${worldLabel}里一点点安顿生活。熟悉的人仍在身边，新机会也开始要求你作出取舍。`,
      `生活向前挤了一步：新的责任、旧的牵挂，还有一个关于${aspiration}的念头，开始争夺你的时间。`,
      `这一年有些忙乱，却并非徒劳。你做成一件具体的小事，也看见自己离想要的生活近了一点。`,
      `一次不在计划里的变化打乱日常。你重新安排轻重缓急，终于为自己留出一点位置。`,
    ];
    return moments[age % moments.length] + insightLine;
  }
  if (age < 65) {
    const moments = [
      `生活渐渐有了自己的节奏。你看见过去的选择留下了什么，也开始重新理解${aspiration}。`,
      `旧日的决定在这一年显出回声。有人仍与你同行，也有人走远；你学会把遗憾和感激一起收下。`,
      `一件家常小事让你停下来想了很久。原来真正珍惜的东西，一直藏在日复一日的生活里。`,
      `你为一段关系或一件旧事作了新的安排。没有轰轰烈烈，却让接下来的日子轻松了一些。`,
    ];
    return moments[age % moments.length] + insightLine;
  }
  const laterLifeMoments = [
    `时间慢了下来。你想起曾经遇见的人，也更明白这一生真正珍惜的东西。`,
    `旧照片、熟悉的声音和一个迟来的问候，拼成了这一年的亮处。你开始把故事讲给身边的人听。`,
    `你重新走过一段熟悉的路，发现自己记住的不是输赢，而是谁曾在身旁陪你走过。`,
    `这一年，你把一件牵挂已久的事交给后来的人。放手之后，心里反而多出一片安静。`,
  ];
  return laterLifeMoments[age % laterLifeMoments.length] + insightLine;
}

export function parseModelChain(value: string | null): string[] {
  if (!value) return [...DEFAULT_MODEL_CHAIN];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [...DEFAULT_MODEL_CHAIN];
    return [...new Set(parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0))].slice(0, 5);
  } catch {
    return [...DEFAULT_MODEL_CHAIN];
  }
}

export function loadInitialModelChain(storage: Pick<Storage, "getItem" | "setItem">): string[] {
  const saved = parseModelChain(storage.getItem(MODEL_CHAIN_STORAGE_KEY));
  const preferred = ["kimi-k2.8", "MiniMax-M3"];
  if (storage.getItem(MODEL_CHAIN_PRIORITY_VERSION_KEY) === "Kimi-K2.8+MiniMax-M3") return saved;
  const migrated = [...preferred, ...saved.filter((model) => !preferred.includes(model))].slice(0, 5);
  storage.setItem(MODEL_CHAIN_STORAGE_KEY, JSON.stringify(migrated));
  storage.setItem(MODEL_CHAIN_PRIORITY_VERSION_KEY, "Kimi-K2.8+MiniMax-M3");
  return migrated;
}
