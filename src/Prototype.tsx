import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  GlobeIcon,
  HeartIcon,
  LightningBoltIcon,
  MagicWandIcon,
  MoonIcon,
  PersonIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
  StarFilledIcon,
} from "@radix-ui/react-icons";
import {
  createLifePlan,
  generateEventImage,
  loadModelCatalog,
  testModelChain,
  type ModelCatalog,
} from "./api";
import {
  advanceLifeYear,
  applyEffects,
  DEFAULT_MODEL_CHAIN,
  DEFAULT_STATS,
  loadInitialModelChain,
  MODEL_CHAIN_STORAGE_KEY,
  stageForAge,
  STAT_META,
  summarizeYear,
  type LifeCharacter,
  type LifeEvent,
  type LifeLogEntry,
  type LifePlan,
  type LifeStats,
} from "./life";
import { BottomSheet, KeyboardInput, KeyboardTextarea, MobileScroll, useKeyboard } from "./mobile";
import { startAmbientMusic, type AmbientMusicController } from "./ambientMusic";

const eras = ["古代", "近现代", "现代", "未来", "异世界"];
const identities = ["普通人", "修行者", "学生", "职场人", "家族继承人", "随机"];
const aspirations = ["逍遥自在", "实力至上", "守护所爱", "探索真相", "名利巅峰", "随机"];
const WORLD_IMAGE_LIMIT = 5;
const lifeNames = ["林知遥", "江月白", "沈听澜", "顾星野", "陆清和", "许照宁", "苏见山", "闻溪", "叶知秋", "程望舒", "宋云舟", "谢青禾"];
const WAITING_FORTUNES = ["愿你在未知处遇见新生。", "愿你所向之处，始终有光。", "愿每次选择，都更接近自己。", "愿重要的人，都在路上与你相逢。", "愿勇敢给你答案，温柔也给你力量。"];
const IMAGE_STYLE_ANCHOR = [
  "全局画风锚点（必须优先遵守）：高品质二维日系动漫电影插画，手绘动画背景，干净细腻线稿，柔和赛璐璐明暗与绘本式光影；人物明确采用动漫化比例和表情设计，避免真人五官与照片质感。系列色彩以靛青、玉青、暖金为主，并按当前世界自然变化。",
  "禁止照片、写实摄影、超写实皮肤或真人肖像、3D/CG渲染、恐怖摄影、惊悚怪脸、畸变、血腥和内脏。灵异或战争场景保持诗意、克制、非猎奇，不用逼真恐怖元素。画面不要文字、水印、Logo。",
].join(" ");

function rollLifeName(previous = "") {
  const choices = lifeNames.filter((item) => item !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
}

function chooseRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

const worldNodes = [
  { title: "现代", detail: "觉醒修行", style: "home-modern", world: "一个现代都市，表面是繁华的高楼与职场，暗地里灵气复苏，人人可修行，门派、财团与异族并存。" },
  { title: "古代", detail: "王朝风云", style: "home-ancient", world: "一个古老王朝，江湖门派与皇权并立，每个人都在乱世寻找自己的位置。" },
  { title: "仙侠", detail: "问道长生", style: "home-xianxia", world: "群山之上有修仙门派，凡人也能踏上修行路，长生背后藏着代价。" },
  { title: "蒸汽", detail: "机械与魔法", style: "home-steam", world: "一座蒸汽与魔法并存的工业都市，齿轮、飞艇与古老秘术共同改变文明。" },
  { title: "异世界", detail: "诡秘未知", style: "home-haunted", world: "一个被浓雾包围的老城，每逢月圆，街巷里便会出现亡者的指引。" },
  { title: "海洋", detail: "群岛纪元", style: "home-ocean", world: "海洋覆盖大地，群岛间的城邦依靠古老航线往来，每次远航都可能改写命运。" },
  { title: "星际", detail: "文明远行", style: "home-space", world: "群星之间存在古老文明，地球只是漫长星际航路上的一座港湾。" },
];

const eraTiles = [
  { title: "古代", image: "/assets/game/mountain-initiation.png" },
  { title: "近现代", image: "/assets/game/rainy-invitation.png" },
  { title: "现代", image: "/assets/game/celestial-world.png" },
  { title: "未来", image: "/assets/game/star-signal.png" },
  { title: "异世界", image: "/assets/game/ghost-lantern.png" },
];

type ImageState = { url?: string | null; dataUrl?: string | null };
type SavedRun = {
  plan: LifePlan;
  year: number;
  eventIndex: number;
  stats: LifeStats;
  relationships: Record<string, number>;
  metCharacterIds: string[];
  lifeLog: LifeLogEntry[];
  name: string;
};

function clampRelationship(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fallbackEventImage(world: string, era: string, index: number) {
  if (/灵异|鬼|亡者|怪谈|阴阳/.test(world)) return "/assets/game/ghost-lantern.png";
  if (/星际|群星|宇宙|外星|太空|银河|航路|星舰/.test(world) || era === "未来") return "/assets/game/star-signal.png";
  if (/修仙|仙门|群山|长生|古老王朝|王朝/.test(world) || era === "古代") return "/assets/game/mountain-initiation.png";
  return index % 2 === 0 ? "/assets/game/rainy-invitation.png" : "/assets/game/celestial-world.png";
}

function styledIllustrationPrompt(scene: string, composition: string) {
  return `画面内容：${scene}\n构图要求：${composition}\n${IMAGE_STYLE_ANCHOR}`;
}

function yearFocus(age: number, aspiration: string) {
  if (age === 0) return "人生由此启程 · 世界第一次向你打开";
  const groups = age < 7
    ? ["新的日常正在改变你", "你开始表达自己的愿望", "一次小尝试留下勇气"]
    : age < 18
      ? ["你的兴趣开始发芽", "一次相遇改变了看法", "你发现自己也能作选择"]
      : age < 40
        ? [`为${aspiration}迈出一步`, "新的关系打开生活的另一面", "你开始决定自己要留下什么"]
        : age < 65
          ? ["旧日选择开始显出回声", "你重新安排了生活的轻重", `你再次看见${aspiration}的意义`]
          : ["一段旧关系有了新的理解", "你把重要的故事讲给后来的人", "你开始珍惜日常留下的回声"];
  return groups[(age * 7) % groups.length];
}

function storyYearLabel(age: number) {
  return "第" + Math.max(1, age + 1) + "年";
}

function describeModelFailure(attempt: { status?: number | null; reason?: string }) {
  if (attempt.status) return "HTTP " + attempt.status;
  const reason = attempt.reason || "";
  if (/empty answer/i.test(reason)) return "返回空内容";
  if (/memory ages|duplicate event ages/i.test(reason)) return "关键年龄或年度记忆不完整";
  if (/JSON|object|array|valid event|valid age|choices/i.test(reason)) return "输出格式未通过校验";
  if (/fetch failed|network|timeout/i.test(reason)) return "连接失败或超时";
  return "未生成有效方案";
}

function TypewriterText({ text, animate, intervalMs, onTick }: { text: string; animate: boolean; intervalMs: number; onTick?: () => void }) {
  const [printed, setPrinted] = useState(animate ? "" : text);
  const positionRef = useRef(animate ? 0 : text.length);
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  useEffect(() => {
    if (!animate) {
      positionRef.current = text.length;
      setPrinted(text);
      return;
    }
    const timer = window.setInterval(() => {
      positionRef.current = Math.min(text.length, positionRef.current + 1);
      setPrinted(text.slice(0, positionRef.current));
      if (positionRef.current % 2 === 0) tickRef.current?.();
      if (positionRef.current >= text.length) window.clearInterval(timer);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [text, animate, intervalMs]);

  return <span className="typewriter-text" aria-label={text}><span>{printed}</span>{animate && printed.length < text.length && <i className="typewriter-caret" aria-hidden="true" />}</span>;
}

export default function Prototype() {
  const keyboard = useKeyboard();
  const [page, setPage] = useState(0);
  const [world, setWorld] = useState("一个现代都市，表面是繁华的高楼与职场，暗地里灵气复苏，人人可修行，门派、财团与异族并存。");
  const [era, setEra] = useState("现代");
  const [identity, setIdentity] = useState("修行者");
  const [aspiration, setAspiration] = useState("实力至上");
  const [randomChoiceNotice, setRandomChoiceNotice] = useState("");
  const [name, setName] = useState(() => rollLifeName());
  const [castNotes, setCastNotes] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [eraSheetOpen, setEraSheetOpen] = useState(false);
  const [customEra, setCustomEra] = useState("近未来");
  const [stats, setStats] = useState<LifeStats>(DEFAULT_STATS);
  const [planError, setPlanError] = useState("");

  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>({ textModels: [], imageModels: [], videoModels: [], otherModels: [] });
  const [modelCatalogStatus, setModelCatalogStatus] = useState<"loading" | "ready" | "error">("loading");
  const [modelChain, setModelChain] = useState<string[]>(() => loadInitialModelChain(window.localStorage));
  const [modelToAdd, setModelToAdd] = useState("");
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [modelTestMessage, setModelTestMessage] = useState("");
  const [modelTesting, setModelTesting] = useState(false);
  const [imageGenerationEnabled, setImageGenerationEnabled] = useState(() => window.localStorage.getItem("life-prototype-image-gen-v1") !== "false");

  const [lifePlan, setLifePlan] = useState<LifePlan | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(0.5);
  const [typingSoundEnabled, setTypingSoundEnabled] = useState(() => window.localStorage.getItem("life-prototype-typing-sound-v1") === "true");
  const [typingSoundUnavailable, setTypingSoundUnavailable] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [planStage, setPlanStage] = useState<"story" | "cover">("story");
  const [planElapsedSeconds, setPlanElapsedSeconds] = useState(0);
  const [displayedPlanStageIndex, setDisplayedPlanStageIndex] = useState(-1);
  const [litWaitingStars, setLitWaitingStars] = useState(0);
  const [waitingFortune, setWaitingFortune] = useState("");
  const waitingFortuneRef = useRef("");
  const planAbortRef = useRef<AbortController | null>(null);
  const [year, setYear] = useState(0);
  const [eventIndex, setEventIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [relationships, setRelationships] = useState<Record<string, number>>({});
  const [metCharacterIds, setMetCharacterIds] = useState<string[]>([]);
  const [lifeLog, setLifeLog] = useState<LifeLogEntry[]>([]);
  const [relationshipOpen, setRelationshipOpen] = useState(false);
  const [imageByEvent, setImageByEvent] = useState<Record<string, ImageState>>({});
  const [coverImage, setCoverImage] = useState<ImageState | null>(null);
  const [imageLoadingId, setImageLoadingId] = useState("");
  const [imageErrorId, setImageErrorId] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const imageRequests = useRef(new Set<string>());
  const lifeRunIdRef = useRef(0);
  const musicRef = useRef<AmbientMusicController | null>(null);
  const musicStartingRef = useRef(false);
  const printerAudioRef = useRef<AudioContext | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicError, setMusicError] = useState(false);

  const isStarWorld = /星际|群星|宇宙|外星|太空|银河|航路|星舰/.test(world);
  const isHauntedWorld = /灵异|鬼|亡者|怪谈|阴阳/.test(world);
  const isCultivationWorld = /灵气|修仙|修行|仙门|灵根/.test(world);
  const isXianxiaWorld = /仙侠|修仙|仙门|群山|长生/.test(world);
  const isAncientWorld = /古老王朝|王朝|乱世|江湖/.test(world);
  const isOceanWorld = /群岛|海洋|远航/.test(world);
  const isSteamWorld = /蒸汽|机械与魔法|机械文明/.test(world);
  const activeWorldNode = isHauntedWorld ? "异世界"
    : isStarWorld ? "星际"
      : isSteamWorld ? "蒸汽"
      : isXianxiaWorld ? "仙侠"
        : isAncientWorld ? "古代"
          : isOceanWorld ? "海洋"
            : isCultivationWorld ? "现代" : "";
  const guideName = isHauntedWorld ? "白衣姑娘" : "沈知白";
  const worldLabel = isStarWorld ? "星际文明"
    : isHauntedWorld ? "灵异古城"
      : isSteamWorld ? "蒸汽奇境"
      : isXianxiaWorld ? "仙侠世界"
        : isAncientWorld ? "王朝风云"
          : isOceanWorld ? "群岛纪元"
            : isCultivationWorld ? "灵气复苏"
              : world.trim().split(/[，。,\n]/)[0].slice(0, 12) || "未命名世界";
  const currentEvent = lifePlan?.events[eventIndex] ?? null;
  const isEventYear = Boolean(currentEvent && currentEvent.age === year);
  const activeMemory = lifePlan?.memories?.find((memory) => memory.age === year);
  const currentEventImage = currentEvent ? imageByEvent[currentEvent.id] : undefined;
  const lifeEnded = Boolean(lifePlan && (year >= 100 || stats.health <= 0));
  const visibleCharacters = lifePlan?.characters.filter((person) => metCharacterIds.includes(person.id)) ?? [];
  const generatedImageCount = Object.keys(imageByEvent).length;
  const waitingStages = [
    { title: "世界观构建", detail: `融合你选择的${worldLabel}与${era}，梳理故事发生的规则。` },
    { title: "人物形成", detail: `为${identity}安排人生轨迹，让重要角色在合适的年岁登场。` },
    { title: "人生事件编排", detail: "在第9、19、31、51、76年安排人生转折与选择。" },
    { title: "关系构建", detail: `结合${aspiration}，设计相逢、牵绊与关系转折。` },
    { title: "年度记忆编织", detail: "为不同人生阶段写下连贯、有因果的成长片段。" },
  ];
  const coverWaitingStage = { title: "绘制此生封面", detail: `为${name}在${worldLabel}中的人生生成专属封面。` };
  const waitingStageIndex = planStage === "cover" ? waitingStages.length : Math.max(0, Math.min(displayedPlanStageIndex, waitingStages.length - 1));
  const waitingStage = planStage === "cover" ? coverWaitingStage : displayedPlanStageIndex < 0
    ? { title: "命运正在展开", detail: "正在将你选择的世界、身份与志向编织成一段人生。" }
    : waitingStages[waitingStageIndex];
  const waitingStageStatus = planStage === "cover" ? "专属封面" : displayedPlanStageIndex < 0 ? "推演已启动" : `人生内容 ${waitingStageIndex + 1} / ${waitingStages.length}`;
  const nextEventAge = currentEvent && currentEvent.age > year ? currentEvent.age : lifePlan?.events[eventIndex + (isEventYear ? 1 : 0)]?.age;
  const activeStoryText = lifeEnded
    ? lifePlan?.endingLine || "这一生已经走到终点。"
    : isEventYear && currentEvent
      ? currentEvent.narrative
      : year === 0 ? lifePlan?.openingLine || "你的人生从今天开始。" : activeMemory?.narrative || summarizeYear(year, worldLabel, aspiration, stats);
  const activeStoryHighlight = lifeEnded
    ? "这一生最重要的答案，是你曾经认真地活过。"
    : isEventYear && currentEvent
      ? selectedChoice !== null ? currentEvent.choices[selectedChoice]?.consequence || yearFocus(year, aspiration) : "命运把一个重要的选择交到了你手里。"
      : activeMemory?.highlight || yearFocus(year, aspiration);
  const typingIntervalMs = Math.max(8, Math.round(32 / playbackSpeed));
  const lifeCoverSrc = coverImage?.dataUrl || coverImage?.url || fallbackEventImage(world, era, 0);

  useEffect(() => {
    let cancelled = false;
    loadModelCatalog().then((catalog) => {
      if (cancelled) return;
      setModelCatalog(catalog);
      setModelCatalogStatus("ready");
      setModelChain((current) => {
        const available = new Set(catalog.textModels);
        const valid = current.filter((model) => available.has(model)).slice(0, 5);
        return valid.length ? valid : DEFAULT_MODEL_CHAIN.filter((model) => available.has(model)).slice(0, 5);
      });
    }).catch(() => {
      if (!cancelled) setModelCatalogStatus("error");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(MODEL_CHAIN_STORAGE_KEY, JSON.stringify(modelChain));
  }, [modelChain]);

  useEffect(() => {
    window.localStorage.setItem("life-prototype-image-gen-v1", String(imageGenerationEnabled));
  }, [imageGenerationEnabled]);

  useEffect(() => {
    window.localStorage.setItem("life-prototype-typing-sound-v1", String(typingSoundEnabled));
  }, [typingSoundEnabled]);

  useEffect(() => {
    if (!planLoading) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setPlanElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [planLoading]);

  useEffect(() => {
    if (page !== 4 || !waitingFortune) return;
    const frame = window.requestAnimationFrame(() => document.querySelector(".waiting-fortune-result")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    return () => window.cancelAnimationFrame(frame);
  }, [page, waitingFortune]);

  useEffect(() => () => { planAbortRef.current?.abort(); }, []);
  useEffect(() => () => { musicRef.current?.stop(); musicRef.current = null; }, []);
  useEffect(() => () => { void printerAudioRef.current?.close(); printerAudioRef.current = null; }, []);

  useEffect(() => {
    const focused = keyboard.focusedElement;
    if (!keyboard.visible || !focused) return;
    const reveal = () => {
      if (document.activeElement === focused) focused.scrollIntoView({ block: "center", behavior: "instant" });
    };
    const first = window.setTimeout(reveal, 360);
    const second = window.setTimeout(reveal, 650);
    return () => { window.clearTimeout(first); window.clearTimeout(second); };
  }, [keyboard.visible, keyboard.focusedElement]);

  useEffect(() => {
    if (!lifePlan) return;
    const snapshot: SavedRun = { plan: lifePlan, year, eventIndex, stats, relationships, metCharacterIds, lifeLog, name };
    try {
      window.localStorage.setItem("life-prototype-current-run-v1", JSON.stringify(snapshot));
    } catch {
      // Keep play moving if browser storage is full.
    }
  }, [lifePlan, year, eventIndex, stats, relationships, metCharacterIds, lifeLog, name]);

  useEffect(() => {
    if (page !== 3 || !isEventYear || !currentEvent) return;
    setMetCharacterIds((current) => [...new Set([...current, ...currentEvent.characterIds])]);
  }, [page, year, eventIndex, isEventYear, currentEvent]);

  const moveTo = (next: number) => {
    keyboard.hide();
    setPage(next === 3 ? 3 : 0);
  };

  const keepInputVisible = (element: HTMLElement) => {
    const reveal = () => {
      if (document.activeElement === element) element.scrollIntoView({ block: "center", behavior: "instant" });
    };
    window.setTimeout(reveal, 360);
    window.setTimeout(reveal, 650);
  };

  const dismissKeyboardOnBlur = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!(event.relatedTarget instanceof HTMLInputElement || event.relatedTarget instanceof HTMLTextAreaElement)) keyboard.hide();
  };

  const chooseWorldNode = (node: (typeof worldNodes)[number]) => setWorld(node.world);

  const toggleBackgroundMusic = async () => {
    if (musicRef.current) {
      musicRef.current.stop();
      musicRef.current = null;
      setMusicEnabled(false);
      setMusicError(false);
      return;
    }
    if (musicStartingRef.current) return;
    musicStartingRef.current = true;
    setMusicError(false);
    try {
      musicRef.current = await startAmbientMusic();
      setMusicEnabled(true);
    } catch {
      setMusicError(true);
    } finally {
      musicStartingRef.current = false;
    }
  };

  const lightWaitingStar = () => {
    if (!planLoading || litWaitingStars >= 3) return;
    const nextCount = litWaitingStars + 1;
    setLitWaitingStars(nextCount);
    if (nextCount === 3) {
      const fortune = WAITING_FORTUNES[Math.floor(Math.random() * WAITING_FORTUNES.length)];
      waitingFortuneRef.current = fortune;
      setWaitingFortune(fortune);
    }
  };

  const resetWaitingFortune = () => {
    waitingFortuneRef.current = "";
    setWaitingFortune("");
    setLitWaitingStars(0);
  };

  const toggleTypingSound = async () => {
    if (typingSoundEnabled) {
      setTypingSoundEnabled(false);
      setTypingSoundUnavailable(false);
      return;
    }
    try {
      if (!window.AudioContext) throw new Error("Audio is unavailable.");
      if (!printerAudioRef.current || printerAudioRef.current.state === "closed") printerAudioRef.current = new AudioContext();
      await printerAudioRef.current.resume();
      setTypingSoundEnabled(true);
      setTypingSoundUnavailable(false);
    } catch {
      setTypingSoundUnavailable(true);
    }
  };

  const playPrinterTick = useCallback(() => {
    const context = printerAudioRef.current;
    if (!typingSoundEnabled || !context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(1_300 + Math.random() * 460, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.008, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.014);
  }, [typingSoundEnabled]);

  const chooseRandomWorld = () => {
    const available = worldNodes.filter((node) => node.title !== activeWorldNode);
    const node = available[Math.floor(Math.random() * available.length)] || worldNodes[0];
    chooseWorldNode(node);
  };

  const chooseIdentity = (choice: string) => {
    if (choice === "随机") {
      const result = chooseRandom(identities.slice(0, -1));
      setIdentity(result);
      setRandomChoiceNotice("系统随机分配身份：" + result);
      return;
    }
    setIdentity(choice);
    setRandomChoiceNotice("");
  };

  const chooseAspiration = (choice: string) => {
    if (choice === "随机") {
      const result = chooseRandom(aspirations.slice(0, -1));
      setAspiration(result);
      setRandomChoiceNotice("系统随机分配人生志向：" + result);
      return;
    }
    setAspiration(choice);
    setRandomChoiceNotice("");
  };

  const requestEventImage = async (event: LifeEvent) => {
    if (!imageGenerationEnabled || imageByEvent[event.id] || imageRequests.current.has(event.id) || imageRequests.current.size > 0) return;
    if (Object.keys(imageByEvent).length + imageRequests.current.size >= WORLD_IMAGE_LIMIT) return;
    const runId = lifeRunIdRef.current;
    imageRequests.current.add(event.id);
    setImageLoadingId(event.id);
    setImageErrorId("");
    const scenePrompt = event.imagePrompt || worldLabel + "，" + era + "时代背景，" + event.title + "：" + event.narrative;
    const prompt = styledIllustrationPrompt(scenePrompt, "横版 4:3 动漫电影场景关键帧，重点呈现这一事件中的人物动作、环境线索与情绪，适合叙事卡片裁切。");
    try {
      const image = await generateEventImage(prompt);
      if (runId !== lifeRunIdRef.current) return;
      setImageByEvent((current) => ({ ...current, [event.id]: { url: image.url, dataUrl: image.dataUrl } }));
    } catch {
      if (runId === lifeRunIdRef.current) setImageErrorId(event.id);
    } finally {
      if (runId !== lifeRunIdRef.current) return;
      imageRequests.current.delete(event.id);
      setImageLoadingId("");
    }
  };

  const startNewLifePlan = async () => {
    if (planAbortRef.current) return;
    keyboard.hide();
    if (world.trim().length < 8) {
      setPlanError("请先写下至少 8 个字的世界设定。");
      return;
    }
    if (!modelChain.length) {
      setPlanError("先在 AI 设置中添加一个文字模型。");
      return;
    }
    lifeRunIdRef.current += 1;
    const runId = lifeRunIdRef.current;
    imageRequests.current.clear();
    setImageByEvent({});
    setCoverImage({ url: fallbackEventImage(world, era, 0), dataUrl: null });
    setImageLoadingId("");
    setImageErrorId("");
    const controller = new AbortController();
    planAbortRef.current = controller;
    setAutoPlay(false);
    setPlanElapsedSeconds(0);
    setPlanStage("story");
    setDisplayedPlanStageIndex(-1);
    setLitWaitingStars(0);
    waitingFortuneRef.current = "";
    setWaitingFortune("");
    setPlanLoading(true);
    setPlanError("");
    setPage(4);
    try {
      const protagonist = name.trim() || rollLifeName();
      if (protagonist !== name) setName(protagonist);
      const result = await createLifePlan({ world, worldLabel, era, identity, aspiration, name: protagonist, traits: "", sourceTitle: "", castNotes, stats: DEFAULT_STATS, modelChain }, controller.signal, (progress) => {
        const progressIndex: Record<string, number> = { world: 0, characters: 1, events: 2, relationships: 3, memories: 4 };
        if (progress.stage in progressIndex) setDisplayedPlanStageIndex(progressIndex[progress.stage]);
      });
      if (controller.signal.aborted || planAbortRef.current !== controller || lifeRunIdRef.current !== runId) return;
      setPlanStage("cover");
      setDisplayedPlanStageIndex(waitingStages.length);
      const coverScene = [
        `为《${protagonist}的这一世》绘制一张专属人生封面。`,
        `世界设定：${world.slice(0, 420)}`,
        `时代：${era}。身份：${identity}。此生志向：${aspiration}。`,
        `本局故事基调：${result.plan.worldSummary}。人生开场：${result.plan.openingLine}`,
      ].join("\n");
      const coverPrompt = styledIllustrationPrompt(coverScene, "竖版 3:4 人生封面构图，动漫主角与这个世界独有的环境意象同框，人物表情自然，构图简洁有层次，封面美术设计感，无边框、不要拼贴。");
      try {
        const cover = await generateEventImage(coverPrompt, { signal: controller.signal, ratio: "3:4" });
        if (controller.signal.aborted || planAbortRef.current !== controller || lifeRunIdRef.current !== runId) return;
        setCoverImage({ url: cover.url, dataUrl: cover.dataUrl });
      } catch {
        if (controller.signal.aborted || planAbortRef.current !== controller || lifeRunIdRef.current !== runId) return;
        setCoverImage({ url: fallbackEventImage(world, era, 0), dataUrl: null });
      }
      const generatedPlan = waitingFortuneRef.current ? { ...result.plan, openingLine: result.plan.openingLine + " " + waitingFortuneRef.current } : result.plan;
      setLifePlan(generatedPlan);
      setStats(DEFAULT_STATS);
      setYear(0);
      setEventIndex(0);
      setSelectedChoice(null);
      setAutoPlay(true);
      setRelationships(Object.fromEntries(result.plan.characters.map((person) => [person.id, 50])));
      setMetCharacterIds([]);
      setLifeLog([{ age: 0, title: "人生开始", text: generatedPlan.openingLine, highlight: yearFocus(0, aspiration), kind: "milestone" }]);
      setImageByEvent({});
      imageRequests.current.clear();
      moveTo(3);
    } catch (error) {
      if (controller.signal.aborted || planAbortRef.current !== controller) return;
      const detail = error as Error & { attempts?: Array<{ model: string; result: string; status?: number | null; reason?: string }> };
      const attempted = detail.attempts?.length
        ? "已尝试：" + detail.attempts.map((item) => item.model + (item.result === "failed" ? "（" + describeModelFailure(item) + "）" : "（成功）")).join("、") + "。"
        : "";
      const message = detail.name === "TimeoutError" ? "推演等待超时" : detail instanceof TypeError ? "无法连接推演服务，请检查本地服务是否运行" : detail.attempts?.length ? "当前模型未能生成完整的人生方案" : detail.message === "Request failed." ? "推演服务暂时没有返回有效结果" : detail.message || "人生方案生成失败";
      setPlanError(message + "。" + attempted + "可以重试或调整模型顺序。");
    } finally {
      if (planAbortRef.current === controller) {
        planAbortRef.current = null;
        setPlanLoading(false);
      }
    }
  };

  const cancelPlanGeneration = () => {
    planAbortRef.current?.abort();
    planAbortRef.current = null;
    setPlanLoading(false);
    setDisplayedPlanStageIndex(0);
    setAutoPlay(false);
    setPlanStage("story");
    setPlanError("");
    setCoverImage(null);
    resetWaitingFortune();
    moveTo(0);
  };

  const chooseLifeEvent = (choiceIndex: number) => {
    if (!currentEvent || !isEventYear || selectedChoice !== null) return;
    const selected = currentEvent.choices[choiceIndex];
    if (!selected) return;
    setSelectedChoice(choiceIndex);
    setStats((current) => applyEffects(current, selected.effects));
    setRelationships((current) => {
      const next = { ...current };
      for (const [id, delta] of Object.entries(selected.relationshipEffects)) {
        next[id] = clampRelationship((next[id] ?? 50) + delta);
      }
      return next;
    });
    setLifeLog((current) => [...current, { age: year, title: currentEvent.title, text: currentEvent.narrative + " 你选择了：" + selected.label, highlight: selected.consequence, kind: "milestone" }]);
  };

  const advanceOneYear = () => {
    if (!lifePlan || lifeEnded || (isEventYear && selectedChoice === null)) return;
    const nextAge = year + 1;
    const nextStats = advanceLifeYear(stats, year);
    setStats(nextStats);
    if (isEventYear) setEventIndex((current) => current + 1);
    setYear(nextAge);
    setSelectedChoice(null);
    if (nextAge < 100 && nextStats.health > 0 && !lifePlan.events.some((event) => event.age === nextAge)) {
      const memory = lifePlan.memories?.find((item) => item.age === nextAge);
      const narrative = memory?.narrative || summarizeYear(nextAge, worldLabel, aspiration, nextStats);
      setLifeLog((current) => [...current, { age: nextAge, title: memory?.title || storyYearLabel(nextAge), text: narrative, highlight: memory?.highlight || yearFocus(nextAge, aspiration), kind: memory ? "memory" : "year" }]);
    }
  };

  const fastForward = () => {
    if (!lifePlan || lifeEnded || (isEventYear && selectedChoice === null)) return;
    const nextIndex = isEventYear ? eventIndex + 1 : eventIndex;
    const targetAge = Math.min(100, Math.max(year + 1, lifePlan.events[nextIndex]?.age ?? 100));
    let nextStats = stats;
    for (let cursor = year; cursor < targetAge; cursor += 1) nextStats = advanceLifeYear(nextStats, cursor);
    setStats(nextStats);
    if (isEventYear) setEventIndex(nextIndex);
    setYear(targetAge);
    setSelectedChoice(null);
    const landingOnEvent = lifePlan.events.some((event) => event.age === targetAge);
    const landedMemories = (lifePlan.memories || []).filter((memory) => memory.age > year && memory.age < targetAge).map((memory) => ({ age: memory.age, title: memory.title, text: memory.narrative, highlight: memory.highlight, kind: "memory" as const }));
    const landingEntry = targetAge >= 100
      ? { age: targetAge, title: "人生终章", text: "这一生走到了终点。", highlight: "你活成了自己的答案。", kind: "milestone" as const }
      : !landingOnEvent
        ? { age: targetAge, title: "走到" + storyYearLabel(targetAge), text: "时光流转，你来到了" + stageForAge(targetAge) + "。" + summarizeYear(targetAge, worldLabel, aspiration, nextStats), highlight: yearFocus(targetAge, aspiration), kind: "year" as const }
        : null;
    if (landedMemories.length || landingEntry) setLifeLog((current) => [...current, ...landedMemories, ...(landingEntry ? [landingEntry] : [])]);
  };

  const manualAdvanceOneYear = () => {
    setAutoPlay(false);
    advanceOneYear();
  };

  const manualFastForward = () => {
    setAutoPlay(false);
    fastForward();
  };

  useEffect(() => {
    if (!autoPlay || page !== 3 || !lifePlan) return;
    if (lifeEnded) {
      setAutoPlay(false);
      return;
    }
    if (imageLoadingId || (isEventYear && selectedChoice === null)) return;
    const revealDelay = Math.max(1_800, activeStoryText.length * typingIntervalMs + 1_400);
    const timer = window.setTimeout(advanceOneYear, revealDelay);
    return () => window.clearTimeout(timer);
  }, [autoPlay, page, lifePlan, lifeEnded, isEventYear, selectedChoice, activeStoryText, playbackSpeed, typingIntervalMs, year, eventIndex, imageLoadingId]);

  useEffect(() => {
    if (page !== 3 || year === 0) return;
    const scrollTimer = window.setTimeout(() => conversationEndRef.current?.scrollIntoView({ behavior: autoPlay ? "smooth" : "auto", block: "end" }), 80);
    return () => window.clearTimeout(scrollTimer);
  }, [page, year, selectedChoice, lifeEnded, autoPlay]);

  const addModelToChain = () => {
    if (!modelToAdd || modelChain.includes(modelToAdd) || modelChain.length >= 5) return;
    setModelChain((current) => [...current, modelToAdd].slice(0, 5));
    setModelToAdd("");
  };

  const replaceModel = (index: number, nextModel: string) => {
    if (modelChain.some((model, currentIndex) => currentIndex !== index && model === nextModel)) return;
    setModelChain((current) => current.map((model, currentIndex) => currentIndex === index ? nextModel : model));
  };

  const moveModel = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= modelChain.length) return;
    setModelChain((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const runModelTest = async () => {
    if (!modelChain.length) {
      setModelTestMessage("请先添加至少一个文字模型。");
      return;
    }
    setModelTesting(true);
    setModelTestMessage("");
    try {
      const result = await testModelChain(modelChain);
      setModelTestMessage("链路可用，" + result.modelUsed + " 已响应。");
    } catch (error) {
      const attempts = (error as Error & { attempts?: Array<{ model: string }> }).attempts || [];
      setModelTestMessage(attempts.length ? "链路中的 " + attempts.length + " 个模型均未响应。" : (error as Error).message);
    } finally {
      setModelTesting(false);
    }
  };

  const shareLife = async () => {
    if (!lifePlan) return;
    const highlights = lifeLog.slice(-8).map((entry) => storyYearLabel(entry.age) + " · " + entry.title + "：" + entry.text).join("\n");
    const summaryText = [
      "《" + name + "的这一世》",
      era + " · " + worldLabel + " · " + storyYearLabel(year) + "终章",
      "此生志向：" + aspiration,
      "人生属性：" + STAT_META.map((item) => item.label + " " + stats[item.id]).join(" / "),
      "重要的人：" + (visibleCharacters.map((person) => person.name).join("、") || "这段人生仍在继续"),
      "人生片段：",
      highlights,
      "结语：" + lifePlan.endingLine,
    ].join("\n");
    try {
      if (navigator.share) await navigator.share({ title: name + "的这一世", text: summaryText });
      else {
        await navigator.clipboard.writeText(summaryText);
        setShareMessage("人生总结已复制，可以分享给朋友了。");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(summaryText);
        setShareMessage("人生总结已复制，可以分享给朋友了。");
      } catch {
        setShareMessage("当前浏览器不支持分享，请复制屏幕上的人生总结。");
      }
    }
  };

  const resetForAnotherLife = () => {
    lifeRunIdRef.current += 1;
    imageRequests.current.clear();
    setLifePlan(null);
    setAutoPlay(false);
    setPlanError("");
    setYear(0);
    setEventIndex(0);
    setSelectedChoice(null);
    setStats(DEFAULT_STATS);
    setRelationships({});
    setMetCharacterIds([]);
    setLifeLog([]);
    setImageByEvent({});
    setImageLoadingId("");
    setImageErrorId("");
    setPage(0);
  };

  return (
    <MobileScroll key={page} className={"app-screen" + (page === 3 ? " app-screen-story" : "")}>
      <main className={"life-app page-" + page}>
        {(page === 0 || page === 3 || page === 4) && <div className="floating-music-anchor"><button className={`floating-music-button${musicEnabled ? " is-on" : ""}${musicError ? " has-error" : ""}`} type="button" aria-pressed={musicEnabled} aria-label={musicError ? "背景音乐无法播放，点击重试" : musicEnabled ? "关闭背景音乐" : "开启背景音乐"} onClick={() => void toggleBackgroundMusic()}>{musicEnabled ? <SpeakerLoudIcon /> : <SpeakerOffIcon />}</button></div>}
        {page === 0 && (
          <section className="reference-home-screen" aria-label="世界设定" data-world={activeWorldNode || "custom"}>
            <div className="reference-hero" aria-label="星图世界">
              <img className="reference-home-art" src="/assets/game/world-home-reference.png" alt="星图上的七种人生世界" draggable="false" />
              <div className="reference-map-hotspots" role="group" aria-label="选择人生世界">
                {worldNodes.map((node) => <button key={node.title} type="button" aria-label={`${node.title}：${node.detail}`} aria-pressed={activeWorldNode === node.title} className={`reference-hotspot map-hotspot ${node.style}${activeWorldNode === node.title ? " is-selected" : ""}`} onClick={() => chooseWorldNode(node)}><span className="visually-hidden">{node.title}：{node.detail}</span></button>)}
              </div>
            </div>
            <div className="home-controls">
              <div className="home-section-heading"><span>世界设定</span><small>{world.length}/1000</small></div>
              <div className="home-world-field">
                <KeyboardTextarea aria-label="写下你想进入的世界" maxLength={1000} value={world} onChange={(event) => setWorld(event.target.value)} onFocus={(event) => keepInputVisible(event.currentTarget)} onBlur={dismissKeyboardOnBlur} placeholder="写下想进入的世界，也可以写小说的世界观与人物背景……" />
                <button type="button" className="world-roll" aria-label="随机灵感" onClick={chooseRandomWorld}>✦ 换个灵感</button>
              </div>
              <div className="home-section-heading"><span>时代背景</span><button type="button" onClick={() => { keyboard.hide(); setCustomEra(era); setEraSheetOpen(true); }}>自定义时代</button></div>
              <div className="home-era-grid" role="group" aria-label="时代背景">
                {eraTiles.map((tile) => <button key={tile.title} type="button" aria-label={`时代：${tile.title}`} aria-pressed={era === tile.title} className={era === tile.title ? "selected" : ""} onClick={() => setEra(tile.title)}><img src={tile.image} alt="" draggable="false" /><span>{tile.title}</span></button>)}
              </div>
              {!eras.includes(era) && <p className="home-custom-era">当前时代：{era}</p>}
              <div className="home-section-heading"><span>你的身份</span></div>
              <div className="home-chip-grid" role="group" aria-label="你的身份">{identities.map((item) => <button key={item} type="button" aria-label={item === "随机" ? "随机选择身份" : item} aria-pressed={item !== "随机" && identity === item} className={item !== "随机" && identity === item ? "selected" : item === "随机" ? "random-option" : ""} onClick={() => chooseIdentity(item)}>{item === "随机" ? "✧ 随机" : item}</button>)}</div>
              {randomChoiceNotice.startsWith("系统随机分配身份：") && <p className="random-choice-notice" role="status" aria-live="polite">{randomChoiceNotice}</p>}
              <div className="home-section-heading"><span>人生志向</span></div>
              <div className="home-chip-grid" role="group" aria-label="人生志向">{aspirations.map((item) => <button key={item} type="button" aria-label={item === "随机" ? "随机选择人生志向" : item} aria-pressed={item !== "随机" && aspiration === item} className={item !== "随机" && aspiration === item ? "selected" : item === "随机" ? "random-option" : ""} onClick={() => chooseAspiration(item)}>{item === "随机" ? "✧ 随机" : item}</button>)}</div>
              {randomChoiceNotice.startsWith("系统随机分配人生志向：") && <p className="random-choice-notice" role="status" aria-live="polite">{randomChoiceNotice}</p>}
              <button className="advanced-toggle" type="button" aria-expanded={advancedOpen} aria-controls="advanced-life-options" onClick={() => { if (advancedOpen) keyboard.hide(); setAdvancedOpen((current) => !current); }}><span>高级设置 <small>姓名与想遇见的人</small></span><ChevronRightIcon className={advancedOpen ? "open" : ""} /></button>
              {advancedOpen && <div id="advanced-life-options" className="advanced-life-options">
                <label htmlFor="hero-name">这一世的名字</label>
                <div className="home-name-row"><KeyboardInput id="hero-name" value={name} maxLength={12} onChange={(event) => setName(event.target.value)} onFocus={(event) => keepInputVisible(event.currentTarget)} onBlur={dismissKeyboardOnBlur} /><button type="button" onClick={() => { keyboard.hide(); setName((current) => rollLifeName(current)); }}>换一个</button></div>
                <label htmlFor="cast-notes">这一生想遇到的人 <small>选填</small></label>
                <KeyboardTextarea id="cast-notes" maxLength={900} value={castNotes} onChange={(event) => setCastNotes(event.target.value)} onFocus={(event) => keepInputVisible(event.currentTarget)} onBlur={dismissKeyboardOnBlur} placeholder="每行一位，例如：沈知白｜引路人，外冷内热" />
                <button type="button" className="home-model-link" onClick={() => { keyboard.hide(); setModelSheetOpen(true); }}>模型设置</button>
              </div>}
              {planError && <div className="error-note" role="alert">{planError}<button type="button" onClick={() => setModelSheetOpen(true)}>检查模型链</button></div>}
              <button className="home-start-action" type="button" disabled={planLoading} onClick={startNewLifePlan}>{planLoading ? "正在推演这一生…" : "推演我的人生"}<ArrowRightIcon /></button>
            </div>
          </section>
        )}

        {page === 4 && (
          <section className="plan-generation-screen" aria-labelledby="plan-generation-title">
            <header className="story-topbar"><button className="icon-button" type="button" aria-label={planLoading ? "取消推演并返回设定" : "返回设定"} onClick={cancelPlanGeneration}><ArrowLeftIcon /></button><div className="story-title"><span>命运推演局</span><strong>{planLoading ? "推演进行中" : "推演结果"}</strong></div></header>
            <div className="plan-generation-art" data-busy={planLoading ? "true" : "false"} aria-hidden="true"><img src={lifeCoverSrc} alt="" /><span className="plan-generation-orbit" /><MagicWandIcon /></div>
            {planLoading ? <>
              <div role="status"><span className="plan-generation-kicker">{planStage === "cover" ? "人生方案已生成" : "推演已开始"}</span><h1 id="plan-generation-title">{planStage === "cover" ? <>正在绘制<br />此生封面</> : <>你的这一世，<br />正在展开</>}</h1><p className="plan-generation-copy">{planStage === "cover" ? "文字故事已经生成，正在绘制专属封面；完成后从人生第 1 年开始。" : "正在生成你的世界、人物、关系与年度记忆。完成后会从人生第 1 年开始。"}</p></div>
              <p className="plan-generation-timer">已等待 <b>{planElapsedSeconds}</b> 秒</p>
              <p className="plan-generation-hint">{planStage === "cover" ? "专属封面正在绘制；如果绘制失败，会用世界主题插画继续。" : planElapsedSeconds < 45 ? "下面会轮换展示这份人生方案包含的内容。" : "推演仍在继续，可以继续等待或取消后调整模型设置。"}</p>
              <section className="plan-generation-stage" aria-label={planStage === "cover" ? "封面绘制状态" : "人生方案内容"} aria-live="polite" aria-atomic="true">
                <div className="plan-generation-stage-track" aria-hidden="true">{Array.from({ length: waitingStages.length + 1 }, (_, index) => <i key={index} className={index === waitingStageIndex && (displayedPlanStageIndex >= 0 || planStage === "cover") ? "active" : planStage === "cover" && index < waitingStages.length ? "completed" : ""} />)}</div>
                <div key={planStage + waitingStageIndex + waitingStageStatus} className="plan-generation-stage-copy"><span>{waitingStageStatus}</span><h2>{waitingStage.title}</h2><p>{waitingStage.detail}</p></div>
              </section>
              <div className="plan-generation-context" aria-label="本次人生设定"><span>{worldLabel}</span><i>{era}</i><i>{identity}</i><i>{aspiration}</i></div>
              <section className="waiting-fortune-card" aria-labelledby="waiting-fortune-title">
                <div className="waiting-fortune-heading"><div><span>等待时的星愿</span><h2 id="waiting-fortune-title">点亮三颗星</h2></div><small>{litWaitingStars}/3</small></div>
                <p className="waiting-fortune-copy">点亮后抽取一句寄语，它会成为你人生第 1 年的开篇祝福。</p>
                <div className="waiting-fortune-stars" role="group" aria-label="依次点亮三颗星">
                  {[0, 1, 2].map((index) => <button key={index} type="button" aria-label={`点亮第 ${index + 1} 颗命运星`} aria-pressed={index < litWaitingStars} disabled={index !== litWaitingStars || litWaitingStars >= 3} onClick={lightWaitingStar}><StarFilledIcon /></button>)}
                </div>
                {waitingFortune && <p className="waiting-fortune-result" role="status" aria-live="polite">{waitingFortune}<button type="button" onClick={resetWaitingFortune}>再抽一签</button></p>}
              </section>
              <button className="text-back" type="button" onClick={cancelPlanGeneration}>取消推演，返回设定</button>
            </> : <>
              <h1 id="plan-generation-title">这次推演<br />没有完成</h1>
              <p className="plan-generation-error" role="alert">{planError || "没有收到完整的人生方案，请重新推演。"}</p>
              <button className="primary-action" type="button" onClick={startNewLifePlan}>重新推演 <ArrowRightIcon /></button>
              <div className="plan-generation-links"><button type="button" onClick={() => setModelSheetOpen(true)}>调整模型设置</button><button type="button" onClick={cancelPlanGeneration}>返回修改设定</button></div>
            </>}
          </section>
        )}

        {page === 3 && lifePlan && (
          <>
            <header className="story-topbar">
              <button className="icon-button" onClick={() => moveTo(0)} aria-label="返回世界设定"><ArrowLeftIcon /></button>
              <div className="story-title"><span>{lifeEnded ? "人生终章" : storyYearLabel(year) + " · " + stageForAge(year)}</span><strong>{name}的这一世</strong></div>
              <button className="story-menu" onClick={() => setRelationshipOpen(true)} aria-label="查看关系图谱"><PersonIcon /></button>
            </header>
            <div className="story-scroll conversation-scroll">
              <section className="playback-rail" aria-label="人生推演控制">
                <div className="playback-mode">
                  <button type="button" className={"auto-play-toggle" + (autoPlay ? " is-active" : "")} aria-pressed={autoPlay} disabled={lifeEnded} onClick={() => setAutoPlay((current) => !current)}>{autoPlay ? "Ⅱ 暂停推演" : "▶ 继续自动推演"}</button>
                  <span className="playback-status">{lifeEnded ? "人生已抵达终点" : isEventYear && selectedChoice === null ? "关键抉择 · 等待你的回应" : autoPlay ? "命运正在向前" : "手动掌舵"}</span>
                </div>
                <div className="playback-tools">
                  <div className="speed-picker" role="group" aria-label="推演速度">{([0.5, 1, 2] as const).map((speed) => <button key={speed} type="button" aria-pressed={playbackSpeed === speed} className={playbackSpeed === speed ? "selected" : ""} onClick={() => setPlaybackSpeed(speed)}>{speed}×</button>)}</div>
                  <button type="button" className={"typing-sound-toggle" + (typingSoundEnabled ? " is-on" : "")} aria-pressed={typingSoundEnabled} onClick={() => void toggleTypingSound()}>{typingSoundEnabled ? <SpeakerLoudIcon /> : <SpeakerOffIcon />}打字声{typingSoundEnabled ? "开" : "关"}</button>
                </div>
                {typingSoundUnavailable && <span className="sound-error" role="status">当前设备无法播放打字声</span>}
              </section>

              <div className="conversation-feed" aria-label="人生故事对话流">
                <article className="life-cover-slip">
                  <div className="life-cover-art"><img src={lifeCoverSrc} alt={`${name}在${worldLabel}中的人生封面`} /><div className="life-cover-caption"><span>此生封面</span><h1>{name}的这一世</h1><p>{era} · {identity} · {aspiration}</p></div></div>
                </article>
                {lifeLog.filter((entry) => entry.age < year || (lifeEnded && entry.age === year && entry.title !== "人生终章")).map((entry, index) => {
                  const historicalEvent = lifePlan.events.find((event) => event.age === entry.age && event.title === entry.title);
                  const historicalImage = historicalEvent ? imageByEvent[historicalEvent.id] : undefined;
                  const historicalImageSrc = historicalImage?.dataUrl || historicalImage?.url;
                  return <article className={"memory-slip" + (entry.kind === "milestone" ? " is-milestone" : entry.kind === "memory" ? " is-memory" : "")} key={entry.age + "-" + entry.title + "-" + index}>
                    <div className="memory-slip-heading"><span>{storyYearLabel(entry.age)} · {stageForAge(entry.age)}</span><i>{entry.kind === "milestone" ? "命运留痕" : entry.kind === "memory" ? "年度记忆" : "年记"}</i></div>
                    <h2>{entry.title}</h2>
                    {historicalImageSrc && <div className="memory-history-image"><img src={historicalImageSrc} alt={entry.title + "的生成影像"} loading="lazy" /></div>}
                    <p>{entry.text}</p>
                    <div className="year-highlight-bar"><span>{entry.kind === "milestone" ? "命运回声" : "这一年的重点"}</span><strong>{entry.highlight || yearFocus(entry.age, aspiration)}</strong></div>
                  </article>;
                })}

                {!lifeEnded && isEventYear && currentEvent && <article className="memory-slip active-memory event-memory" key={"event-" + currentEvent.id}>
                  <div className="memory-slip-heading"><span>{storyYearLabel(year)} · {stageForAge(year)}</span><i>命运节点</i></div>
                  <h1>{currentEvent.title}</h1>
                  <div className={"event-art event-art-scene" + (!currentEventImage ? " is-unpainted" : "")}>
                    {currentEventImage?.dataUrl || currentEventImage?.url ? <img src={currentEventImage.dataUrl || currentEventImage.url || ""} alt={worldLabel + " · " + currentEvent.title} /> : <div className="event-image-placeholder"><span>这一幕尚未显影</span><strong>{currentEvent.title}</strong><small>为这段经历生成专属影像</small></div>}
                    {imageLoadingId === currentEvent.id && <div className="image-generation-badge">正在绘制这一幕</div>}
                    {imageErrorId === currentEvent.id && <div className="image-generation-badge" role="status">生成失败，可以重试</div>}
                    {!imageByEvent[currentEvent.id] && imageGenerationEnabled && imageLoadingId !== currentEvent.id && <button className="image-generation-action" type="button" disabled={Boolean(imageLoadingId) || generatedImageCount >= WORLD_IMAGE_LIMIT} onClick={() => requestEventImage(currentEvent)}><MagicWandIcon />{imageLoadingId ? "等待上一张完成" : generatedImageCount >= WORLD_IMAGE_LIMIT ? "本局影像次数已用完" : imageErrorId === currentEvent.id ? "重试生成影像" : "为这一刻生成影像"}</button>}
                    {!imageGenerationEnabled && !imageByEvent[currentEvent.id] && <div className="image-generation-badge">影像生成已关闭</div>}
                  </div>
                  <p className="memory-narrative"><TypewriterText text={currentEvent.narrative} animate intervalMs={typingIntervalMs} onTick={playPrinterTick} /></p>
                  {visibleCharacters.length > 0 && <div className="encounter-chips"><span>此刻在场</span>{visibleCharacters.map((person) => <button key={person.id} onClick={() => setRelationshipOpen(true)}>{person.name}</button>)}</div>}
                  <div className="choice-prompt">此刻，你会怎么做？</div>
                  <div className="event-choices">
                    {currentEvent.choices.map((option, index) => <button key={currentEvent.id + "-" + index} type="button" disabled={selectedChoice !== null} aria-pressed={selectedChoice === index} onClick={() => chooseLifeEvent(index)} className={"event-choice " + (selectedChoice === index ? "picked" : "")}><span className="choice-marker">{selectedChoice === index ? <CheckIcon /> : String.fromCharCode(65 + index)}</span><span>{option.label}</span><ChevronRightIcon /></button>)}
                  </div>
                  {selectedChoice !== null && <div className="consequence-note"><StarFilledIcon /><span>{currentEvent.choices[selectedChoice]?.consequence} 这个选择会留在你的人生里。</span></div>}
                  <div className="year-highlight-bar"><span>这一节点的重点</span><strong>{activeStoryHighlight}</strong></div>
                </article>}

                {!lifeEnded && !isEventYear && <article className="memory-slip active-memory year-memory" key={"year-" + year}>
                  <div className="memory-slip-heading"><span>{storyYearLabel(year)} · {stageForAge(year)}</span><i>{year === 0 ? "人生开卷" : "正在续写"}</i></div>
                  <h1>{year === 0 ? "人生初章" : storyYearLabel(year)}</h1>
                  <p className="memory-narrative"><TypewriterText text={activeStoryText} animate intervalMs={typingIntervalMs} onTick={playPrinterTick} /></p>
                  <div className="year-highlight-bar"><span>这一年的重点</span><strong>{activeStoryHighlight}</strong></div>
                </article>}

                {lifeEnded && <article className="memory-slip active-memory ending-memory" key={"ending-" + year}>
                  <div className="memory-slip-heading"><span>一生终了 · {storyYearLabel(year)}</span><i>人生终章</i></div>
                  <h1>你活成了<br />自己的答案</h1>
                  {imageByEvent[lifePlan.events[Math.max(0, eventIndex - 1)]?.id] ? <div className="ending-hero"><img src={imageByEvent[lifePlan.events[Math.max(0, eventIndex - 1)]?.id]?.dataUrl || imageByEvent[lifePlan.events[Math.max(0, eventIndex - 1)]?.id]?.url || ""} alt={worldLabel + "中的人生终章"} /></div> : <div className="ending-hero-empty"><span>这一生的答案</span><p>{lifePlan.endingLine}</p></div>}
                  <p className="ending-narrative"><TypewriterText text={lifePlan.endingLine} animate intervalMs={typingIntervalMs} onTick={playPrinterTick} /></p>
                  <div className="year-highlight-bar"><span>这一生的重点</span><strong>{activeStoryHighlight}</strong></div>
                  <div className="ending-stat-line">{STAT_META.map((item) => <span key={item.id}>{item.label} <b>{stats[item.id]}</b></span>)}</div>
                  <section className="ending-reflection"><span>这一生遇见的人</span><p>{visibleCharacters.length ? visibleCharacters.map((person) => person.name + "（" + person.role + "）").join("、") : "这一生暂时没有特别的相遇"}。这些相遇留在了你的故事里。</p></section>
                  <button className="primary-action" type="button" onClick={shareLife}><GlobeIcon /> 分享这段人生</button>
                  {shareMessage && <p className="bottom-note story-note" role="status">{shareMessage}</p>}
                  <button className="text-back" type="button" onClick={resetForAnotherLife}>再活一次</button>
                </article>}

                {!lifeEnded && <>
                  <section className="relationship-panel conversation-relationships">
                    <div className="relationship-heading"><span>关系谱 · {visibleCharacters.length} 人逐渐入场</span><button type="button" onClick={() => setRelationshipOpen(true)}>查看图谱 <ChevronRightIcon /></button></div>
                    {visibleCharacters.length ? <div className="relationship-row"><div className="person-portrait character-monogram" aria-hidden="true"><span>{Array.from(visibleCharacters[0].name)[0]}</span></div><div className="person-info"><strong>{visibleCharacters[0].name}</strong><span>{visibleCharacters[0].role} · {clampRelationship(relationships[visibleCharacters[0].id] ?? 50)} 牵绊</span><div className="bond-track"><i style={{ width: String(clampRelationship(relationships[visibleCharacters[0].id] ?? 50)) + "%" }} /></div></div><span className="bond-value">{clampRelationship(relationships[visibleCharacters[0].id] ?? 50)}</span></div> : <p className="empty-relations">重要的人会随着你的故事逐渐出现。</p>}
                  </section>
                  <div className="conversation-manual-controls">
                    <button className="primary-action next-event" type="button" disabled={Boolean(isEventYear && selectedChoice === null)} onClick={manualAdvanceOneYear}><span>{isEventYear && selectedChoice === null ? "先回应这次相遇" : "手动推进到 " + storyYearLabel(year + 1)}</span><ArrowRightIcon /></button>
                    {nextEventAge && nextEventAge > year + 1 && <button className="text-back fast-forward-button" type="button" disabled={Boolean(isEventYear && selectedChoice === null)} onClick={manualFastForward}>快进到下个重要节点 · {storyYearLabel(nextEventAge)}</button>}
                  </div>
                </>}
                <div className="conversation-end-anchor" ref={conversationEndRef} />
              </div>
            </div>            <BottomSheet open={relationshipOpen} onOpenChange={setRelationshipOpen} title="人生关系谱" description="重要的人会随着相遇逐步加入，并记住你们共同经历的事情。" snap={0.76}>
              {visibleCharacters.length ? <div className="relationship-graph">
                <div className="relationship-self"><div className="identity-orb"><PersonIcon /></div><div><strong>{name}</strong><span>此生的主角 · {storyYearLabel(year)}</span></div></div>
                {visibleCharacters.map((person) => {
                  const bond = clampRelationship(relationships[person.id] ?? 50);
                  const status = bond >= 75 ? "亲近" : bond >= 55 ? "熟悉" : bond >= 35 ? "微妙" : "疏远";
                  return <div className="relationship-graph-node" key={person.id}><div className="graph-connector" /><div className="person-portrait character-monogram" aria-hidden="true"><span>{Array.from(person.name)[0]}</span></div><div className="graph-person-copy"><strong>{person.name}</strong><span>{person.role} · {status}</span><p>{person.description}</p><div className="bond-track"><i style={{ width: String(bond) + "%" }} /></div></div><b className="bond-value">{bond}</b></div>;
                })}
              </div> : <div className="relationship-empty"><PersonIcon /><p>这一生的关系谱还空着。继续往前走，等待重要的人出现。</p></div>}
            </BottomSheet>
          </>
        )}

        <BottomSheet open={eraSheetOpen} onOpenChange={setEraSheetOpen} title="自定义时代" description="写下你想体验的年代或时间背景。" snap={0.42}>
          <div className="custom-era-form"><KeyboardInput aria-label="自定义时代名称" className="name-input" value={customEra} maxLength={16} onChange={(event) => setCustomEra(event.target.value)} /><button className="primary-action" onClick={() => { setEra(customEra.trim() || "自定义时代"); setEraSheetOpen(false); keyboard.hide(); }}>使用这个时代 <CheckIcon /></button></div>
        </BottomSheet>

        <BottomSheet open={modelSheetOpen} onOpenChange={setModelSheetOpen} title="模型链设置" description="文字生成会按顺序尝试；每个模型每次只试一次，最多 5 个。全部失败时本次人生方案会明确报错。" snap={0.86}>
          <div className="model-chain-sheet">
            <div className="provider-status"><span className={"provider-dot " + modelCatalogStatus} />{modelCatalogStatus === "ready" ? "发现 " + modelCatalog.textModels.length + " 个文字模型" : modelCatalogStatus === "loading" ? "正在读取模型目录…" : "模型目录不可用，请检查本地 API 服务"}<small>Agnes 生图模型：{modelCatalog.imageModels.join("、") || "不可用"}</small></div>
            {modelChain.map((model, index) => <div className="model-chain-row" key={model}><div className="model-rank"><b>{index + 1}</b><span>{index === 0 ? "主模型" : "备用 " + index}</span></div><select aria-label={(index === 0 ? "主模型" : "备用模型 " + index) + "选择"} value={model} onChange={(event) => replaceModel(index, event.target.value)}>{modelCatalog.textModels.map((option) => <option key={option} value={option} disabled={modelChain.some((item, itemIndex) => item === option && itemIndex !== index)}>{option}</option>)}</select><div className="model-order-actions"><button aria-label="上移模型" disabled={index === 0} onClick={() => moveModel(index, -1)}>↑</button><button aria-label="下移模型" disabled={index === modelChain.length - 1} onClick={() => moveModel(index, 1)}>↓</button><button aria-label="移除模型" disabled={modelChain.length <= 1} onClick={() => setModelChain((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div></div>)}
            {modelChain.length < 5 && <div className="add-model-row"><select aria-label="添加备用模型" value={modelToAdd} onChange={(event) => setModelToAdd(event.target.value)}><option value="">添加备用模型…</option>{modelCatalog.textModels.filter((model) => !modelChain.includes(model)).map((model) => <option key={model} value={model}>{model}</option>)}</select><button disabled={!modelToAdd} onClick={addModelToChain}>添加</button></div>}
            <label className="image-gen-toggle"><input type="checkbox" checked={imageGenerationEnabled} onChange={(event) => setImageGenerationEnabled(event.target.checked)} /><span><strong>关键事件手动生成插画</strong><small>进入关键事件后点击“生成这一幕”；每局最多 5 张。</small></span></label>
            {modelTestMessage && <p className="model-test-result" role="status">{modelTestMessage}</p>}
            <button className="primary-action model-test-button" disabled={modelTesting || modelCatalogStatus !== "ready"} onClick={runModelTest}>{modelTesting ? "正在测试模型链…" : "测试文字模型链"}<ArrowRightIcon /></button>
          </div>
        </BottomSheet>
      </main>
    </MobileScroll>
  );
}
